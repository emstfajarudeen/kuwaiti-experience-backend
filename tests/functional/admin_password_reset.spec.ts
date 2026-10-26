import { createHash } from 'node:crypto'
import { test } from '@japa/runner'
import hash from '@adonisjs/core/services/hash'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { authenticateAdmin, loginAdmin } from '../helpers/admin_auth.js'

const email = 'password-reset-admin@example.com'
const password = 'a-very-long-test-password'
const nextPassword = 'a-new-very-long-test-password'

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function initialPage(response: { text(): string }) {
  const match = response
    .text()
    .match(/<script data-page="[^"]+" type="application\/json">([^<]+)<\/script>/)
  if (!match) throw new Error('Expected an Inertia page object in the initial HTML response')
  return JSON.parse(match[1]) as { component: string; props: Record<string, unknown> }
}

async function createAdmin() {
  await db.table('users').insert({
    full_name: 'Password Reset Admin',
    email,
    password: await hash.make(password),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  return db.from('users').where('email', email).firstOrFail()
}

test.group('Admin password reset', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('renders the generic reset-request confirmation for any valid email', async ({
    client,
    assert,
  }) => {
    const page = await client.get('/admin/forgot-password')
    page.assertStatus(200)
    assert.equal(initialPage(page).component, 'auth/forgot_password')

    const unknown = await client
      .post('/admin/forgot-password')
      .withCsrfToken()
      .form({ email: 'unknown@example.com' })
    unknown.assertStatus(200)
    assert.equal(initialPage(unknown).props.submitted, true)

    await createAdmin()
    const known = await client.post('/admin/forgot-password').withCsrfToken().form({ email })
    known.assertStatus(200)
    assert.equal(initialPage(known).props.submitted, true)
    const remaining = await db.from('admin_password_reset_tokens').count('* as total').first()
    assert.equal(Number(remaining?.total), 0)
  })

  test('accepts a single valid token, revokes sessions, and records the reset', async ({
    client,
    assert,
  }) => {
    const admin = await createAdmin()
    const tokens = await loginAdmin(email, password)
    const token = 'a'.repeat(64)
    const now = new Date()
    await db.table('admin_password_reset_tokens').insert({
      id: '77777777-7777-4777-8777-777777777777',
      user_id: admin.id,
      token_hash: tokenHash(token),
      expires_at: new Date(now.getTime() + 60_000),
      created_at: now,
    })

    const validPage = await client.get('/admin/reset-password?token=' + token)
    validPage.assertStatus(200)
    assert.equal(initialPage(validPage).component, 'auth/reset_password')
    assert.equal(initialPage(validPage).props.tokenValid, true)

    const reset = await client
      .post('/admin/reset-password')
      .withCsrfToken()
      .redirects(0)
      .form({ token, newPassword: nextPassword, confirmPassword: nextPassword })
    reset.assertStatus(302)
    assert.equal(reset.header('location'), '/admin/login')
    await assert.rejects(() => authenticateAdmin(tokens.accessToken))

    const login = await client
      .post('/admin/login')
      .withCsrfToken()
      .redirects(0)
      .form({ email, password: nextPassword })
    login.assertStatus(302)

    const replay = await client
      .post('/admin/reset-password')
      .withCsrfToken()
      .redirects(0)
      .form({ token, newPassword: password, confirmPassword: password })
    replay.assertStatus(302)
    assert.equal(replay.header('location'), '/admin/reset-password')
    const auditEntries = await db
      .from('audit_logs')
      .where('action', 'admin.password_reset.completed')
      .where('entity_id', String(admin.id))
      .count('* as total')
      .first()
    assert.equal(Number(auditEntries?.total), 1)
  })
})
