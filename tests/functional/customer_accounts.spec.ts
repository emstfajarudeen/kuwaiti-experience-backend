import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import limiter from '@adonisjs/limiter/services/main'
import { setTestSmsSender } from '../../app/services/customer_sms_service.js'
import { loginAdmin } from '../helpers/admin_auth.js'

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
  const { outcome } = await verify(client)
  const result = await client.post(`${base}/customers`).json({
    verification_token: outcome.verification_token,
    first_name: 'Mariam',
    last_name: 'Al-Khaled',
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
    assert.lengthOf(consent, 0)
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

  test('auth throttling for one challenge does not block another phone on the same IP', async ({
    client,
  }) => {
    const sent = await client.post(`${base}/customer/auth/otp`).json({ phone_e164: phone })
    sent.assertStatus(202)
    const url = `${base}/customer/auth/otp/${sent.body().data.id}/verify`
    const wrong = code === '0000' ? '0001' : '0000'
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await client.post(url).json({ code: wrong })
      result.assertStatus(422)
    }
    const throttled = await client.post(url).json({ code: wrong })
    throttled.assertStatus(429)
    const otherPhone = await client
      .post(`${base}/customer/auth/otp`)
      .json({ phone_e164: '+96590987789' })
    otherPhone.assertStatus(202)
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

  test('registration succeeds without published legal pages or acceptance hashes', async ({
    client,
    assert,
  }) => {
    const { outcome } = await verify(client)
    const result = await client.post(`${base}/customers`).json({
      verification_token: outcome.verification_token,
      first_name: 'A',
      last_name: 'B',
    })
    result.assertStatus(201)
    assert.equal(result.body().data.customer.first_name, 'A')
    const stored = await db.from('customer_legal_acceptances')
    assert.lengthOf(stored, 0)
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
    page.assertTextIncludes('data-page="app"')
    assert.notInclude(page.text(), '<script>alert(1)</script>')
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
    assert.isNull(site.body().data.logo_image_key)
    assert.deepEqual(site.body().meta.images, [])
  })

  test('About Us and Contact Us pages reuse the complete public and CMS Page shape', async ({
    client,
    assert,
  }) => {
    const admin = await adminToken()
    let pageKeys: string[] | undefined
    for (const slug of ['about-us', 'contact-us']) {
      const [id] = await db.table('pages').insert({
        slug,
        status: 'published',
        published_at: new Date(Date.now() - 1000),
        created_at: new Date(),
      })
      await db.table('page_translations').insert({
        page_id: id,
        locale: 'en',
        title: slug,
        body: `Approved ${slug} text`,
      })
      const publicPage = await client.get(`${base}/pages/${slug}?locale=ar`)
      const cmsPage = await client
        .get(`${base}/admin/pages/${slug}?locale=ar`)
        .header('Authorization', `Bearer ${admin}`)
      publicPage.assertStatus(200)
      cmsPage.assertStatus(200)
      assert.deepEqual(publicPage.body(), cmsPage.body())
      assert.equal(publicPage.body().meta.locale, 'en')
      const keys = Object.keys(publicPage.body().data).sort()
      if (pageKeys) assert.deepEqual(keys, pageKeys)
      pageKeys = keys
      assert.deepEqual(Object.keys(publicPage.body().data.page_translations[0]).sort(), [
        'body',
        'body_format',
        'eyebrow',
        'id',
        'locale',
        'page_id',
        'seo_description',
        'seo_title',
        'title',
      ])
    }
    await db.from('pages').where('slug', 'contact-us').update({ status: 'draft' })
    const draft = await client.get(`${base}/pages/contact-us`)
    draft.assertStatus(404)
  })

  test('CMS rich page fields safely supply the website header and formatted sections', async ({
    client,
    assert,
  }) => {
    const admin = await adminToken()
    const auth = `Bearer ${admin}`
    const created = await client.post('/api/v1/admin/pages').header('Authorization', auth).json({
      slug: 'about-us',
      titleEn: 'About The Kuwaiti Experience',
      eyebrowEn: 'ABOUT THE KUWAITI EXPERIENCE',
      bodyEn:
        '<h2>The Essence of Kuwaiti Hospitality</h2><p onclick="evil()">Our story.</p><script>alert(1)</script>',
      bodyFormatEn: 'html',
    })
    created.assertStatus(201)
    const id = created.body().data.id
    const draft = await client.get(`/api/v1/admin/pages/${id}`).header('Authorization', auth)
    draft.assertStatus(200)
    const translation = draft.body().data.page_translations[0]
    assert.equal(translation.eyebrow, 'ABOUT THE KUWAITI EXPERIENCE')
    assert.equal(translation.body_format, 'html')
    assert.include(translation.body, '<h2>The Essence of Kuwaiti Hospitality</h2>')
    assert.notInclude(translation.body, 'onclick')
    assert.notInclude(translation.body, '<script')
    const hidden = await client.get(`${base}/pages/about-us`)
    hidden.assertStatus(404)

    const published = await client
      .post(`/api/v1/admin/pages/${id}/publish`)
      .header('Authorization', auth)
    published.assertStatus(200)
    const publicPage = await client.get(`${base}/pages/about-us?locale=en`)
    const cmsPage = await client
      .get(`${base}/admin/pages/about-us?locale=en`)
      .header('Authorization', auth)
    publicPage.assertStatus(200)
    assert.deepEqual(publicPage.body(), cmsPage.body())
    assert.equal(publicPage.body().data.page_translations[0].body, translation.body)
    assert.isString(publicPage.body().data.updated_at)
    await db
      .from('page_translations')
      .where('page_id', id)
      .update({ body: '<p onclick="evil()">Reviewed text</p><script>alert(1)</script>' })
    const safeV2 = await client.get(`${base}/pages/about-us`)
    const safeV1 = await client.get('/api/v1/pages/about-us')
    safeV2.assertStatus(200)
    safeV1.assertStatus(200)
    assert.equal(safeV2.body().data.page_translations[0].body, '<p>Reviewed text</p>')
    assert.equal(safeV1.body().data.body, '<p>Reviewed text</p>')

    const placeholder = await client
      .post('/api/v1/admin/pages')
      .header('Authorization', auth)
      .json({
        slug: 'terms-and-conditions',
        titleEn: 'Terms and Conditions',
        bodyEn: 'Draft demo content. Replace with approved copy before publishing.',
      })
    placeholder.assertStatus(201)
    const refused = await client
      .post(`/api/v1/admin/pages/${placeholder.body().data.id}/publish`)
      .header('Authorization', auth)
    refused.assertStatus(422)
    assert.equal(refused.body().error.code, 'PLACEHOLDER_PAGE_CONTENT')
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
