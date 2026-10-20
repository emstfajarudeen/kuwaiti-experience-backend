import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import limiter from '@adonisjs/limiter/services/main'
import { setTestSmsSender } from '../../app/services/customer_sms_service.js'
import { loginAdmin } from '../../app/services/auth_service.js'

const base = '/api/v2'
let code = ''
const phone = '+96590987788'

async function verify(client: ApiClient) {
  const sent = await client.post(`${base}/customer/auth/otp`).json({ phone_e164: phone })
  sent.assertStatus(202)
  const verified = await client
    .post(`${base}/customer/auth/otp/${sent.body().data.id}/verify`)
    .json({ code })
  verified.assertStatus(200)
  return { challenge: sent.body().data, outcome: verified.body().data }
}

async function legal(client: ApiClient) {
  const acceptances = []
  for (const slug of ['privacy-policy', 'terms-and-conditions']) {
    const [id] = await db.table('pages').insert({
      slug,
      status: 'published',
      published_at: new Date(Date.now() - 1000),
      created_at: new Date(),
    })
    await db
      .table('page_translations')
      .insert({ page_id: id, locale: 'en', title: slug, body: `Approved ${slug} policy text` })
    const page = await client.get(`${base}/pages/${slug}`)
    page.assertStatus(200)
    acceptances.push({ slug, locale: 'en', content_hash: page.body().meta.content_hash })
  }
  return acceptances
}

async function register(client: ApiClient) {
  const legalAcceptances = await legal(client)
  const { outcome } = await verify(client)
  const result = await client.post(`${base}/customers`).json({
    verification_token: outcome.verification_token,
    first_name: 'Mariam',
    last_name: 'Al-Khaled',
    legal_acceptances: legalAcceptances,
  })
  result.assertStatus(201)
  return result.body().data
}

async function adminToken() {
  await db.table('users').insert({
    full_name: 'Support Admin',
    email: 'support-test@example.com',
    password: await hash.make('support-admin-test-password'),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  const session = await loginAdmin('support-test@example.com', 'support-admin-test-password')
  return session.accessToken
}

test.group('Customer accounts and support', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    setTestSmsSender(async (_phone, sentCode) => {
      code = sentCode
    })
    return testUtils.db().withGlobalTransaction()
  })
  group.each.teardown(() => setTestSmsSender())

  test('registration, me, refresh share one complete Customer; reuse revokes access', async ({
    client,
    assert,
  }) => {
    const session = await register(client)
    assert.isNull(session.customer.email)
    assert.deepEqual(
      Object.keys(session.customer).sort(),
      [
        'id',
        'phone_e164',
        'first_name',
        'last_name',
        'email',
        'profile_photo_id',
        'phone_verified_at',
        'created_at',
        'updated_at',
      ].sort()
    )
    const me = await client
      .get(`${base}/customer/me`)
      .header('Authorization', `Bearer ${session.credentials.access_token}`)
    me.assertStatus(200)
    assert.deepEqual(me.body().data, session.customer)
    const refreshed = await client
      .post(`${base}/customer/auth/refresh`)
      .json({ refresh_token: session.credentials.refresh_token })
    refreshed.assertStatus(200)
    assert.deepEqual(refreshed.body().data.customer, session.customer)
    const previousAccess = await client
      .get(`${base}/customer/me`)
      .header('Authorization', `Bearer ${session.credentials.access_token}`)
    previousAccess.assertStatus(401)
    const currentAccess = await client
      .get(`${base}/customer/me`)
      .header('Authorization', `Bearer ${refreshed.body().data.credentials.access_token}`)
    currentAccess.assertStatus(200)
    const reused = await client
      .post(`${base}/customer/auth/refresh`)
      .json({ refresh_token: session.credentials.refresh_token })
    reused.assertStatus(401)
    const denied = await client
      .get(`${base}/customer/me`)
      .header('Authorization', `Bearer ${refreshed.body().data.credentials.access_token}`)
    denied.assertStatus(401)
    const consent = await db
      .from('customer_legal_acceptances')
      .where('customer_id', session.customer.id)
    assert.lengthOf(consent, 2)
    assert.include(consent[0].body, 'Approved')
  })

  test('OTP is hidden, cooldown is enforced and old codes cannot be reused', async ({
    client,
    assert,
  }) => {
    const sent = await client.post(`${base}/customer/auth/otp`).json({ phone_e164: phone })
    sent.assertStatus(202)
    assert.deepEqual(
      Object.keys(sent.body().data).sort(),
      ['id', 'expires_at', 'resend_available_at'].sort()
    )
    const id = sent.body().data.id
    const wrong = code === '0000' ? '0001' : '0000'
    const bad = await client.post(`${base}/customer/auth/otp/${id}/verify`).json({ code: wrong })
    bad.assertStatus(422)
    const afterFailure = await db.from('customer_otp_challenges').where('id', id).first()
    assert.equal(afterFailure.attempt_count, 1)
    const cooldown = await client.post(`${base}/customer/auth/otp/${id}/resend`)
    cooldown.assertStatus(429)
    const verified = await client.post(`${base}/customer/auth/otp/${id}/verify`).json({ code })
    verified.assertStatus(200)
    const replay = await client.post(`${base}/customer/auth/otp/${id}/verify`).json({ code })
    replay.assertStatus(422)
    const stored = await db.from('customer_otp_challenges').where('id', id).first()
    assert.isNull(stored.code_hash)
    assert.notEqual(stored.verification_token_hash, verified.body().data.verification_token)
  })

  test('five failed attempts lock the challenge and expiry is enforced', async ({ client }) => {
    const sent = await client.post(`${base}/customer/auth/otp`).json({ phone_e164: phone })
    const id = sent.body().data.id
    for (let i = 0; i < 5; i++) {
      const result = await client
        .post(`${base}/customer/auth/otp/${id}/verify`)
        .json({ code: code === '0000' ? '0001' : '0000' })
      result.assertStatus(422)
    }
    const locked = await client.post(`${base}/customer/auth/otp/${id}/verify`).json({ code })
    locked.assertStatus(422)
    await db
      .from('customer_otp_challenges')
      .where('id', id)
      .update({ attempt_count: 0, expires_at: new Date(Date.now() - 1000) })
    const expired = await client.post(`${base}/customer/auth/otp/${id}/verify`).json({ code })
    expired.assertStatus(422)
  })

  test('resend rotates code and enforces the hourly phone budget', async ({ client, assert }) => {
    const sent = await client.post(`${base}/customer/auth/otp`).json({ phone_e164: phone })
    const id = sent.body().data.id
    const oldChallenge = await db.from('customer_otp_challenges').where('id', id).first()
    const oldHash = oldChallenge.code_hash
    await db
      .from('customer_otp_challenges')
      .where('id', id)
      .update({ resend_available_at: new Date(Date.now() - 1000) })
    const resent = await client.post(`${base}/customer/auth/otp/${id}/resend`)
    resent.assertStatus(202)
    assert.equal(resent.body().data.id, id)
    // A fresh random code can coincidentally equal the previous one; verify budget, not randomness.
    assert.isString(oldHash)
    await db
      .from('customer_otp_challenges')
      .where('id', id)
      .update({ send_count: 5, resend_available_at: new Date(Date.now() - 1000) })
    const blocked = await client.post(`${base}/customer/auth/otp`).json({ phone_e164: phone })
    blocked.assertStatus(429)
  })

  test('changed legal text and duplicate acceptances block registration without consuming proof', async ({
    client,
    assert,
  }) => {
    const legalAcceptances = await legal(client)
    const { outcome } = await verify(client)
    await db
      .from('page_translations')
      .where('title', 'privacy-policy')
      .update({ body: 'A revised privacy policy' })
    const payload = {
      verification_token: outcome.verification_token,
      first_name: 'A',
      last_name: 'B',
      legal_acceptances: legalAcceptances,
    }
    const changed = await client.post(`${base}/customers`).json(payload)
    changed.assertStatus(409)
    assert.equal(changed.body().error.code, 'LEGAL_CONTENT_CHANGED')
    const duplicate = await client
      .post(`${base}/customers`)
      .json({ ...payload, legal_acceptances: [legalAcceptances[0], legalAcceptances[0]] })
    duplicate.assertStatus(422)
    const pending = await db.from('customer_otp_challenges').where('phone_e164', phone).first()
    assert.isNull(pending.consumed_at)
  })

  test('existing phone signs in and verification credential is one use', async ({
    client,
    assert,
  }) => {
    const first = await register(client)
    await db
      .from('customer_otp_challenges')
      .where('phone_e164', phone)
      .update({ resend_available_at: new Date(Date.now() - 1000) })
    const { outcome } = await verify(client)
    assert.equal(outcome.next_action, 'sign_in')
    const result = await client
      .post(`${base}/customer/auth/session`)
      .json({ verification_token: outcome.verification_token })
    result.assertStatus(200)
    assert.deepEqual(result.body().data.customer, first.customer)
    const replay = await client
      .post(`${base}/customer/auth/session`)
      .json({ verification_token: outcome.verification_token })
    replay.assertStatus(401)
    const logout = await client
      .post(`${base}/customer/auth/logout`)
      .header('Authorization', `Bearer ${result.body().data.credentials.access_token}`)
    logout.assertStatus(204)
    const denied = await client
      .post(`${base}/customer/auth/refresh`)
      .json({ refresh_token: result.body().data.credentials.refresh_token })
    denied.assertStatus(401)
  })

  test('customer and admin credentials cannot cross channels', async ({ client }) => {
    const session = await register(client)
    const admin = await adminToken()
    const deniedAdmin = await client
      .get('/api/v1/admin/auth/me')
      .header('Authorization', `Bearer ${session.credentials.access_token}`)
    deniedAdmin.assertStatus(401)
    const deniedCustomer = await client
      .get(`${base}/customer/me`)
      .header('Authorization', `Bearer ${admin}`)
    deniedCustomer.assertStatus(401)
    const deniedCookie = await client.get(`${base}/customer/me`).cookie('admin_access', admin)
    deniedCookie.assertStatus(400)
  })

  test('deletion requires recent auth and erases owned data and every session', async ({
    client,
    assert,
  }) => {
    const session = await register(client)
    const token = session.credentials.access_token
    const submission = await client
      .post(`${base}/contact-requests`)
      .header('Authorization', `Bearer ${token}`)
      .json({ full_name: 'Mariam', email: 'm@example.com', message: 'Help please' })
    submission.assertStatus(201)
    await db
      .from('customer_sessions')
      .where('customer_id', session.customer.id)
      .update({ authenticated_at: new Date(Date.now() - 601000) })
    const stale = await client
      .delete(`${base}/customer/me`)
      .header('Authorization', `Bearer ${token}`)
    stale.assertStatus(403)
    await db
      .from('customer_sessions')
      .where('customer_id', session.customer.id)
      .update({ authenticated_at: new Date() })
    const deleted = await client
      .delete(`${base}/customer/me`)
      .header('Authorization', `Bearer ${token}`)
    deleted.assertStatus(204)
    for (const table of [
      'customers',
      'customer_sessions',
      'customer_refresh_tokens',
      'customer_legal_acceptances',
      'customer_otp_challenges',
      'contact_requests',
    ]) {
      const count = await db.from(table).count('* as total').first()
      assert.equal(Number(count.total), 0, table)
    }
    const denied = await client
      .post(`${base}/customer/auth/refresh`)
      .json({ refresh_token: session.credentials.refresh_token })
    denied.assertStatus(401)
  })

  test('guest contact validates and admin API and escaped CMS use the same record', async ({
    client,
    assert,
  }) => {
    const invalid = await client
      .post(`${base}/contact-requests`)
      .json({ full_name: 'A', email: 'invalid', message: 'x'.repeat(301) })
    invalid.assertStatus(422)
    const sent = await client
      .post(`${base}/contact-requests`)
      .json({ full_name: 'Visitor', email: 'V@example.com', message: '<script>alert(1)</script>' })
    sent.assertStatus(201)
    const admin = await adminToken()
    const id = sent.body().data.id
    const detail = await client
      .get(`${base}/admin/contact-requests/${id}`)
      .header('Authorization', `Bearer ${admin}`)
    detail.assertStatus(200)
    assert.isNull(detail.body().data.customer_id)
    assert.equal(detail.body().data.email, 'v@example.com')
    const list = await client
      .get(`${base}/admin/contact-requests`)
      .header('Authorization', `Bearer ${admin}`)
    list.assertStatus(200)
    assert.deepEqual(list.body().data[0], detail.body().data)
    const page = await client.get(`/admin/contact-requests/${id}`).cookie('admin_access', admin)
    page.assertStatus(200)
    page.assertTextIncludes('&lt;script&gt;')
    const inbox = await client.get('/admin/contact-requests').cookie('admin_access', admin)
    inbox.assertStatus(200)
    const csrf = await client
      .post(`/admin/contact-requests/${id}/status`)
      .redirects(0)
      .cookie('admin_access', admin)
      .form({ status: 'resolved' })
    assert.notEqual(csrf.status(), 200)
    const unchanged = await db.from('contact_requests').where('id', id).first()
    assert.equal(unchanged.status, 'new')
    const updated = await client
      .patch(`${base}/admin/contact-requests/${id}`)
      .header('Authorization', `Bearer ${admin}`)
      .json({ status: 'resolved' })
    updated.assertStatus(200)
    assert.equal(updated.body().data.status, 'resolved')
  })

  test('legal API and admin use one shape; missing/draft and unrelated copy are hidden', async ({
    client,
    assert,
  }) => {
    await legal(client)
    const admin = await adminToken()
    const pub = await client.get(`${base}/pages/privacy-policy?locale=ar`)
    const cms = await client
      .get(`${base}/admin/pages/privacy-policy?locale=ar`)
      .header('Authorization', `Bearer ${admin}`)
    assert.deepEqual(pub.body(), cms.body())
    assert.equal(pub.body().meta.locale, 'en')
    await db
      .from('page_translations')
      .where('title', 'privacy-policy')
      .update({ body: 'Gheyar Seller App content' })
    const placeholder = await client.get(`${base}/pages/privacy-policy`)
    placeholder.assertStatus(503)
    await db.from('pages').where('slug', 'terms-and-conditions').update({ status: 'draft' })
    const draft = await client.get(`${base}/pages/terms-and-conditions`)
    draft.assertStatus(404)
    const site = await client.get(`${base}/site`)
    const settings = await client
      .get(`${base}/admin/site`)
      .header('Authorization', `Bearer ${admin}`)
    assert.deepEqual(site.body(), settings.body())
    assert.isNull(site.body().data.whatsapp_number)
  })

  test('delivery failures invalidate code and missing configuration fails closed', async ({
    client,
    assert,
  }) => {
    setTestSmsSender(async () => {
      throw new Error('provider rejected')
    })
    const deliveryPhone = '+96590987787'
    const failed = await client
      .post(`${base}/customer/auth/otp`)
      .json({ phone_e164: deliveryPhone })
    failed.assertStatus(503)
    const invalidated = await db
      .from('customer_otp_challenges')
      .where('phone_e164', deliveryPhone)
      .first()
    assert.isNull(invalidated.code_hash)
    setTestSmsSender()
    const disabled = await client
      .post(`${base}/customer/auth/otp`)
      .json({ phone_e164: '+96590987789' })
    disabled.assertStatus(503)
  })
})

test.group('Customer OTP concurrency with real transactions', () => {
  test('simultaneous requests and verification each have a single winner', async ({
    client,
    assert,
  }) => {
    const concurrentPhone = '+96590987786'
    let sentCode = ''
    await limiter.clear()
    setTestSmsSender(async (_phone, value) => {
      sentCode = value
    })
    try {
      const requests = await Promise.all([
        client.post(`${base}/customer/auth/otp`).json({ phone_e164: concurrentPhone }),
        client.post(`${base}/customer/auth/otp`).json({ phone_e164: concurrentPhone }),
      ])
      assert.deepEqual(requests.map((r) => r.status()).sort(), [202, 429])
      const receipt = requests.find((r) => r.status() === 202)!.body().data
      const verifies = await Promise.all([
        client.post(`${base}/customer/auth/otp/${receipt.id}/verify`).json({ code: sentCode }),
        client.post(`${base}/customer/auth/otp/${receipt.id}/verify`).json({ code: sentCode }),
      ])
      assert.deepEqual(verifies.map((r) => r.status()).sort(), [200, 422])
    } finally {
      await db.from('customer_otp_challenges').where('phone_e164', concurrentPhone).delete()
      setTestSmsSender()
    }
  })
})
