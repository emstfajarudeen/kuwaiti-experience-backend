import { createHash, randomUUID } from 'node:crypto'
import { generateKeyPairSync } from 'node:crypto'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { Secret } from '@adonisjs/core/helpers'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import env from '#start/env'
import {
  createCustomerNotification,
  deliverPushBatch,
  registerPushToken,
} from '#services/customer_notification_service'
import { createBroadcast, processBroadcast } from '#services/notification_broadcast_service'

const base = '/api/v2'
let sequence = 0

async function createCustomer() {
  const n = ++sequence
  const [id] = await db.table('customers').insert({
    phone_e164: `+9655100${String(n).padStart(4, '0')}`,
    first_name: 'Lang',
    last_name: `User${n}`,
    phone_verified_at: new Date(),
    created_at: new Date(),
  })
  return Number(id)
}

/** A signed-in customer without going through OTP: the opaque token is stored hashed. */
async function signIn(customerId: number) {
  const token = `ca_${randomUUID().replaceAll('-', '').padEnd(64, 'x')}`
  await db.table('customer_sessions').insert({
    id: randomUUID(),
    customer_id: customerId,
    access_token_hash: createHash('sha256').update(token).digest('hex'),
    access_expires_at: new Date(Date.now() + 3600_000),
    authenticated_at: new Date(),
    expires_at: new Date(Date.now() + 86_400_000),
    created_at: new Date(),
  })
  return token
}

/** Capture what would be sent to Firebase. */
function fakeFirebase() {
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
  const calls: Array<{ token: string; title: string; body: string; data: Record<string, string> }> =
    []
  globalThis.fetch = (async (input: any, init?: any) => {
    if (String(input).includes('oauth2.googleapis.com'))
      return Response.json({ access_token: 'access-token', expires_in: 3600 })
    const message = JSON.parse(init.body).message
    calls.push({ token: message.token, ...message.notification, data: message.data })
    return Response.json({ name: 'projects/test-project/messages/1' })
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

async function drain() {
  while (await deliverPushBatch()) {
    // keep going until the outbox is empty
  }
}

test.group('Push notification language', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    return testUtils.db().truncate()
  })

  test('registering stores the device language and defaults to English', async ({
    client,
    assert,
  }) => {
    const token = await signIn(await createCustomer())
    const auth = { Authorization: `Bearer ${token}` }

    const plain = await client
      .post(`${base}/customer/me/push-tokens`)
      .header('Authorization', auth.Authorization)
      .json({ token: 'fcm-a', platform: 'android' })
    plain.assertStatus(201)
    assert.equal(plain.body().data.language, 'en')

    const arabic = await client
      .post(`${base}/customer/me/push-tokens`)
      .header('Authorization', auth.Authorization)
      .json({ token: 'fcm-b', platform: 'ios', language: 'ar' })
    arabic.assertStatus(201)
    assert.equal(arabic.body().data.language, 'ar')

    // Re-registering without a language keeps the saved one.
    const again = await client
      .post(`${base}/customer/me/push-tokens`)
      .header('Authorization', auth.Authorization)
      .json({ token: 'fcm-b', platform: 'ios' })
    assert.equal(again.body().data.language, 'ar')

    const bad = await client
      .post(`${base}/customer/me/push-tokens`)
      .header('Authorization', auth.Authorization)
      .json({ token: 'fcm-c', platform: 'ios', language: 'fr' })
    bad.assertStatus(422)
  })

  test('PATCH switches the language and is limited to the owner', async ({ client, assert }) => {
    const customerId = await createCustomer()
    const token = await signIn(customerId)
    const other = await signIn(await createCustomer())
    const created = await registerPushToken(customerId, { token: 'fcm-1', platform: 'android' })
    const id = created.data.id

    const changed = await client
      .patch(`${base}/customer/me/push-tokens/${id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ language: 'ar' })
    changed.assertStatus(200)
    assert.equal(changed.body().data.language, 'ar')
    assert.equal(
      (await db.from('customer_push_tokens').where('id', id).firstOrFail()).language,
      'ar'
    )

    const invalid = await client
      .patch(`${base}/customer/me/push-tokens/${id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ language: 'fr' })
    invalid.assertStatus(422)

    const stranger = await client
      .patch(`${base}/customer/me/push-tokens/${id}`)
      .header('Authorization', `Bearer ${other}`)
      .json({ language: 'en' })
    stranger.assertStatus(404)

    const guest = await client
      .patch(`${base}/customer/me/push-tokens/${id}`)
      .json({ language: 'en' })
    guest.assertStatus(401)
  })

  test('each device receives the notification in its own language', async ({ assert }) => {
    const firebase = fakeFirebase()
    try {
      const customerId = await createCustomer()
      await registerPushToken(customerId, { token: 'phone-en', platform: 'android' })
      await registerPushToken(customerId, { token: 'phone-ar', platform: 'ios', language: 'ar' })
      await createCustomerNotification(customerId, {
        type: 'general',
        title: 'New places',
        body: 'Come and see.',
        title_ar: 'أماكن جديدة',
        body_ar: 'تعال وشاهد.',
      })
      await drain()
      const byToken = new Map(firebase.calls.map((call) => [call.token, call]))
      assert.equal(byToken.get('phone-en')?.title, 'New places')
      assert.equal(byToken.get('phone-ar')?.title, 'أماكن جديدة')
      assert.equal(byToken.get('phone-ar')?.body, 'تعال وشاهد.')
      // Both languages still travel in `data`, so the app can pick its own.
      assert.equal(byToken.get('phone-en')?.data.title_ar, 'أماكن جديدة')
      assert.equal(byToken.get('phone-en')?.data.title_en, 'New places')
    } finally {
      firebase.restore()
    }
  })

  test('Arabic devices fall back to English when the Arabic text is missing or partial', async ({
    assert,
  }) => {
    const firebase = fakeFirebase()
    try {
      const customerId = await createCustomer()
      await registerPushToken(customerId, { token: 'phone-ar', platform: 'ios', language: 'ar' })
      await createCustomerNotification(customerId, {
        type: 'general',
        title: 'English only',
        body: 'No Arabic text.',
      })
      await createCustomerNotification(customerId, {
        type: 'general',
        title: 'Half translated',
        body: 'Only the title has Arabic.',
        title_ar: 'عنوان فقط',
        body_ar: '   ',
      })
      await drain()
      assert.deepEqual(firebase.calls.map((call) => call.title).sort(), [
        'English only',
        'Half translated',
      ])
    } finally {
      firebase.restore()
    }
  })

  test('broadcasts carry the Arabic text through to inbox rows', async ({ assert }) => {
    const [adminId] = await db.table('users').insert({
      full_name: 'Lang Admin',
      email: 'lang-admin@example.com',
      password: 'x',
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const customerId = await createCustomer()
    await registerPushToken(customerId, { token: 'bc-ar', platform: 'ios', language: 'ar' })
    const created = await createBroadcast(
      {
        request_key: 'b'.repeat(32),
        title: 'Offer',
        body: 'Today only',
        title_ar: 'عرض',
        body_ar: 'اليوم فقط',
        audience: 'all',
      },
      Number(adminId)
    )
    await processBroadcast(created.id)
    const row = await db
      .from('customer_notifications')
      .where('broadcast_id', created.id)
      .firstOrFail()
    assert.equal(row.title_ar, 'عرض')
    assert.equal(row.body_ar, 'اليوم فقط')
  })
})
