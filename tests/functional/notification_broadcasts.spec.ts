import { generateKeyPairSync } from 'node:crypto'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import { Secret } from '@adonisjs/core/helpers'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import limiter from '@adonisjs/limiter/services/main'
import Tokens from 'csrf'
import {
  checkPushConnection,
  deliverPushBatch,
  registerPushToken,
} from '#services/customer_notification_service'
import {
  processBroadcast,
  processPendingBroadcasts,
} from '#services/notification_broadcast_service'
import { loginAdmin } from '../helpers/admin_auth.js'

const password = 'a-very-long-test-password'
let sequence = 0

function initialPage(response: { text(): string }) {
  const match = response
    .text()
    .match(/<script data-page="[^"]+" type="application\/json">([^<]+)<\/script>/)
  if (!match) throw new Error('Expected an Inertia page object in the initial HTML response')
  return JSON.parse(match[1]) as { component: string; props: Record<string, any> }
}

async function createAdmin(email = 'notify-admin@example.com') {
  await db.table('users').insert({
    full_name: 'Notify Admin',
    email,
    password: await hash.make(password),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  return accessTokenFor(email)
}

/** A staff member whose role carries only the given permissions. */
async function createStaff(email: string, keys: string[]) {
  const [userId] = await db.table('users').insert({
    full_name: 'Limited Staff',
    email,
    password: await hash.make(password),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  const [roleId] = await db.table('roles').insert({
    slug: `limited-${++sequence}`,
    name: 'Limited',
    description: null,
    is_system: false,
    created_at: new Date(),
  })
  const permissions = await db.from('permissions').whereIn('key', keys)
  await db
    .table('role_permissions')
    .insert(permissions.map((permission) => ({ role_id: roleId, permission_id: permission.id })))
  await db.table('user_roles').insert({ user_id: userId, role_id: roleId, created_at: new Date() })
  return accessTokenFor(email)
}

async function createCustomer(tokens: Array<'ios' | 'android'> = []) {
  const n = ++sequence
  const [id] = await db.table('customers').insert({
    phone_e164: `+9655000${String(n).padStart(4, '0')}`,
    first_name: 'Test',
    last_name: `User${n}`,
    phone_verified_at: new Date(),
    created_at: new Date(),
  })
  for (const platform of tokens)
    await registerPushToken(Number(id), {
      token: `${platform}-token-${n}-${Math.random()}`,
      platform,
    })
  return { id: Number(id), phone: `+9655000${String(n).padStart(4, '0')}` }
}

function send(
  client: ApiClient,
  token: string,
  fields: Record<string, unknown>,
  path = '/admin/notifications'
) {
  const tokens = new Tokens()
  const secret = tokens.secretSync()
  return client
    .post(path)
    .cookie('admin_access', token)
    .withSession({ 'csrf-secret': secret })
    .json({ ...fields, _csrf: tokens.create(secret) })
    .redirects(0)
}

async function expectStatus(
  pending: Promise<{ assertStatus(status: number): unknown }>,
  status: number
) {
  const response = await pending
  response.assertStatus(status)
}

async function countRows(table: string) {
  const row = await db.from(table).count('* as n').first()
  return Number(row?.n)
}

async function accessTokenFor(email: string) {
  const login = await loginAdmin(email, password)
  return login.accessToken
}

const key = () => (++sequence).toString(16).padStart(32, '0')
const valid = (extra: Record<string, unknown> = {}) => ({
  request_key: key(),
  audience: 'all',
  title: 'Welcome back',
  body: 'New places are waiting for you.',
  ...extra,
})

/** Point the push service at a fake Firebase and capture every outgoing request. */
function fakeFirebase(respond?: (url: string, body: any) => Response | undefined) {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  const previous = {
    fetch: globalThis.fetch,
    project: env.get('FCM_PROJECT_ID'),
    email: env.get('FCM_CLIENT_EMAIL'),
    key: env.get('FCM_PRIVATE_KEY'),
  }
  const e = env as unknown as { set(key: string, value: unknown): void }
  e.set('FCM_PROJECT_ID', 'test-project')
  e.set('FCM_CLIENT_EMAIL', 'svc@test-project.iam.gserviceaccount.com')
  e.set('FCM_PRIVATE_KEY', new Secret(privateKey))
  const calls: Array<{ url: string; body: any }> = []
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input)
    if (url.includes('oauth2.googleapis.com'))
      return Response.json({ access_token: 'access-token', expires_in: 3600 })
    const body = JSON.parse(init.body)
    calls.push({ url, body })
    return respond?.(url, body) ?? Response.json({ name: 'projects/test-project/messages/1' })
  }) as typeof fetch
  return {
    calls,
    restore() {
      globalThis.fetch = previous.fetch
      e.set('FCM_PROJECT_ID', previous.project)
      e.set('FCM_CLIENT_EMAIL', previous.email)
      e.set('FCM_PRIVATE_KEY', previous.key)
      if (previous.project === undefined) delete process.env.FCM_PROJECT_ID
      if (previous.email === undefined) delete process.env.FCM_CLIENT_EMAIL
      if (previous.key === undefined) delete process.env.FCM_PRIVATE_KEY
    },
  }
}

test.group('CMS push notifications', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    return testUtils.db().truncate()
  })

  test('throttles broadcasts per staff member', async ({ client }) => {
    const admin = await createAdmin()
    for (let attempt = 0; attempt < 10; attempt++)
      await expectStatus(send(client, admin, valid({ title: '' })), 302)
    await expectStatus(send(client, admin, valid()), 429)
  })

  test('restricts the page and sending to the right permissions', async ({ client, assert }) => {
    const guest = await client.get('/admin/notifications').redirects(0)
    guest.assertStatus(302)
    assert.equal(guest.header('location'), '/admin/login')

    const admin = await createAdmin()
    const page = await client.get('/admin/notifications').cookie('admin_access', admin)
    page.assertStatus(200)
    const props = initialPage(page)
    assert.equal(props.component, 'notifications/index')
    assert.isTrue(props.props.canSend)
    assert.isFalse(props.props.overview.configured)
    assert.match(props.props.requestKey, /^[a-f0-9]{32}$/)

    const viewer = await createStaff('notify-viewer@example.com', ['notifications.view'])
    const readOnly = await client.get('/admin/notifications').cookie('admin_access', viewer)
    readOnly.assertStatus(200)
    assert.isFalse(initialPage(readOnly).props.canSend)
    await expectStatus(send(client, viewer, valid()), 403)
    await expectStatus(send(client, viewer, {}, '/admin/notifications/check-connection'), 403)

    const nobody = await createStaff('notify-none@example.com', ['dashboard.view'])
    await expectStatus(client.get('/admin/notifications').cookie('admin_access', nobody), 403)
    assert.equal(await countRows('notification_broadcasts'), 0)
  })

  test('queues one broadcast, fans out to every customer and is idempotent', async ({
    client,
    assert,
  }) => {
    const admin = await createAdmin()
    const a = await createCustomer(['ios', 'android'])
    const b = await createCustomer(['android'])
    await createCustomer([]) // no device: still gets the in-app inbox message

    const fields = valid()
    await expectStatus(send(client, admin, fields), 302)
    await expectStatus(send(client, admin, fields), 302) // double submit
    assert.equal(await countRows('notification_broadcasts'), 1)
    const queued = await db.from('notification_broadcasts').firstOrFail()
    assert.equal(queued.status, 'queued')
    assert.equal(queued.audience, 'all')
    const audit = await db.from('audit_logs').where('action', 'notification.broadcast').first()
    assert.equal(audit.entity_id, String(queued.id))

    assert.equal(await processPendingBroadcasts(), 1)
    assert.equal(await processPendingBroadcasts(), 0)
    assert.isFalse(await processBroadcast(queued.id)) // already completed

    const done = await db.from('notification_broadcasts').where('id', queued.id).firstOrFail()
    assert.equal(done.status, 'completed')
    assert.equal(done.recipient_count, 3)
    assert.equal(done.push_count, 3)
    const inbox = await db.from('customer_notifications').where('broadcast_id', queued.id)
    assert.lengthOf(inbox, 3)
    assert.isTrue(inbox.every((row) => row.type === 'general' && row.title === 'Welcome back'))
    const outbox = await db
      .from('customer_notification_outbox as o')
      .join('customer_notifications as n', 'n.id', 'o.notification_id')
      .where('n.broadcast_id', queued.id)
      .select('n.customer_id')
    assert.sameMembers(
      outbox.map((row) => row.customer_id),
      [a.id, a.id, b.id]
    )

    const page = await client.get('/admin/notifications').cookie('admin_access', admin)
    const history = initialPage(page).props.broadcasts
    assert.lengthOf(history, 1)
    assert.include(history[0], {
      status: 'completed',
      recipients: 3,
      devices: 3,
      delivered: 0,
      pending: 3,
      audience: 'all',
      sent_by: 'Notify Admin',
    })
    assert.equal(initialPage(page).props.overview.audiences.all.devices, 3)
    assert.equal(initialPage(page).props.overview.queue.pending, 3)
  })

  test('platform audiences only reach customers with a device on that platform', async ({
    client,
    assert,
  }) => {
    const admin = await createAdmin()
    const both = await createCustomer(['ios', 'android'])
    const iosOnly = await createCustomer(['ios'])
    await createCustomer(['android'])
    await createCustomer([])

    await expectStatus(send(client, admin, valid({ audience: 'ios' })), 302)
    await processPendingBroadcasts()
    const broadcast = await db.from('notification_broadcasts').firstOrFail()
    const recipients = await db.from('customer_notifications').where('broadcast_id', broadcast.id)
    assert.sameMembers(
      recipients.map((row) => row.customer_id),
      [both.id, iosOnly.id]
    )
    const platforms = await db
      .from('customer_notification_outbox as o')
      .join('customer_push_tokens as t', 't.id', 'o.push_token_id')
      .select('t.platform')
    assert.deepEqual(
      platforms.map((row) => row.platform),
      ['ios', 'ios']
    )
  })

  test('single-user sends find the customer by phone and reject bad input', async ({
    client,
    assert,
  }) => {
    const admin = await createAdmin()
    const target = await createCustomer(['ios'])
    await createCustomer(['ios'])
    const count = () => countRows('notification_broadcasts')

    // Spaces and dashes are tolerated; strict E.164 is stored.
    const spaced = target.phone.replace(/^(\+965)(\d{4})(\d{4})$/, '$1 $2-$3')
    await expectStatus(
      send(client, admin, valid({ audience: 'customer', customer_phone: spaced })),
      302
    )
    assert.equal(await count(), 1)
    await processPendingBroadcasts()
    const inbox = await db.from('customer_notifications').select('customer_id')
    assert.deepEqual(
      inbox.map((row) => row.customer_id),
      [target.id]
    )

    for (const bad of [
      valid({ audience: 'customer', customer_phone: '+96599999999' }), // unknown user
      valid({ audience: 'customer' }), // phone required
      valid({ audience: 'customer', customer_phone: 'not-a-phone' }),
      valid({ audience: 'everyone' }),
      valid({ title: '   ' }),
      valid({ title: 'x'.repeat(101) }),
      valid({ body: '' }),
      valid({ body: 'x'.repeat(501) }),
      valid({ title: 'line\nbreak' }),
      valid({ body: 'bell\u0007' }),
      valid({ request_key: 'short' }),
    ]) {
      await limiter.clear() // exercised separately in the throttle test
      await expectStatus(send(client, admin, bad), 302)
    }
    assert.equal(await count(), 1)
  })

  test('delivers through FCM, tracks results and prunes dead devices', async ({
    client,
    assert,
  }) => {
    const firebase = fakeFirebase((_url, body) =>
      body.message.token.startsWith('dead-')
        ? Response.json(
            { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } },
            { status: 404 }
          )
        : undefined
    )
    try {
      const admin = await createAdmin()
      const user = await createCustomer([])
      await registerPushToken(user.id, { token: 'live-token', platform: 'android' })
      await registerPushToken(user.id, { token: 'dead-token', platform: 'ios' })

      await expectStatus(
        send(client, admin, valid({ audience: 'customer', customer_phone: user.phone })),
        302
      )
      await processPendingBroadcasts()
      while (await deliverPushBatch()) {
        // drain
      }

      const sent = firebase.calls.filter((call) => !call.body.validate_only)
      assert.lengthOf(sent, 2)
      const live = sent.find((call) => call.body.message.token === 'live-token')!
      assert.equal(live.body.message.notification.title, 'Welcome back')
      assert.equal(live.body.message.notification.body, 'New places are waiting for you.')
      assert.equal(live.body.message.data.type, 'general')

      const rows = await db.from('customer_notification_outbox')
      assert.lengthOf(rows, 1) // the dead device cascaded away
      assert.isNotNull(rows[0].delivered_at)
      assert.lengthOf(await db.from('customer_push_tokens'), 1)

      const page = await client.get('/admin/notifications').cookie('admin_access', admin)
      const [entry] = initialPage(page).props.broadcasts
      assert.include(entry, { devices: 2, delivered: 1, failed: 0, pending: 0, removed: 1 })
      assert.isTrue(initialPage(page).props.overview.configured)
    } finally {
      firebase.restore()
    }
  })

  test('the connection check proves credentials and surfaces Firebase rejections', async ({
    client,
    assert,
  }) => {
    const firebase = fakeFirebase((_url, body) =>
      body.validate_only
        ? Response.json({ error: { status: 'INVALID_ARGUMENT' } }, { status: 400 })
        : undefined
    )
    try {
      assert.deepEqual(await checkPushConnection(), { projectId: 'test-project' })
      const dryRun = firebase.calls.at(-1)!
      assert.isTrue(dryRun.body.validate_only)
      assert.include(dryRun.url, '/projects/test-project/messages:send')

      const admin = await createAdmin()
      const response = await send(client, admin, {}, '/admin/notifications/check-connection')
      response.assertStatus(302)
      assert.equal(response.header('location'), '/admin/notifications')
      assert.isTrue(firebase.calls.some((call) => call.body.validate_only))
    } finally {
      firebase.restore()
    }

    const rejected = fakeFirebase(() =>
      Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 })
    )
    try {
      await checkPushConnection()
      assert.fail('expected the connection check to fail')
    } catch (error) {
      assert.match((error as Error).message, /PERMISSION_DENIED/)
    } finally {
      rejected.restore()
    }
  })
})
