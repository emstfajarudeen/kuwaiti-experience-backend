import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import limiter from '@adonisjs/limiter/services/main'
import sharp from 'sharp'
import { setTestSmsSender } from '../../app/services/customer_sms_service.js'
import { profilePhotoKey } from '../../app/services/customer_photo_service.js'

const base = '/api/v2/customer'
const codes = new Map<string, string>()
const files = new Set<string>()
const originalPhone = '+96590987111'
const nextPhone = '+96590987222'

async function signIn(client: ApiClient, phone = originalPhone) {
  if (!(await db.from('customers').where('phone_e164', phone).first())) {
    await db.table('customers').insert({
      phone_e164: phone,
      first_name: 'Mariam',
      last_name: 'Al-Khaled',
      email: `old-${phone.slice(-4)}@example.com`,
      phone_verified_at: new Date(),
      created_at: new Date(),
    })
  }
  await db
    .from('customer_otp_challenges')
    .where('phone_e164', phone)
    .update({ resend_available_at: new Date(Date.now() - 2000) })
  const request = await client.post(`${base}/auth/otp`).json({ phone_e164: phone })
  request.assertStatus(202)
  const verified = await client
    .post(`${base}/auth/otp/${request.body().data.id}/verify`)
    .json({ code: codes.get(phone) })
  verified.assertStatus(200)
  const session = await client
    .post(`${base}/auth/session`)
    .json({ verification_token: verified.body().data.verification_token })
  session.assertStatus(200)
  return session.body().data
}

async function phoneProof(client: ApiClient, token: string) {
  const request = await client
    .post(`${base}/me/phone/otp`)
    .header('Authorization', `Bearer ${token}`)
    .json({ phone_e164: nextPhone })
  request.assertStatus(202)
  const id = request.body().data.id
  const verified = await client
    .post(`${base}/me/phone/otp/${id}/verify`)
    .header('Authorization', `Bearer ${token}`)
    .json({ code: codes.get(nextPhone) })
  verified.assertStatus(200)
  return { id, proof: verified.body().data.verification_token }
}

test.group('Customer edit profile', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    codes.clear()
    setTestSmsSender(async (phone, code) => {
      codes.set(phone, code)
    })
    return testUtils.db().withGlobalTransaction()
  })
  group.each.teardown(async () => {
    setTestSmsSender()
    for (const id of files) await drive.use('local').delete(profilePhotoKey(id))
    files.clear()
  })

  test('saves nullable email and names with the same Customer shape in me and refresh', async ({
    client,
    assert,
  }) => {
    const session = await signIn(client)
    const token = session.credentials.access_token
    const updated = await client
      .patch(`${base}/me`)
      .header('Authorization', `Bearer ${token}`)
      .json({ first_name: ' Zia ', last_name: ' Ali ', email: null })
    updated.assertStatus(200)
    assert.equal(updated.body().data.first_name, 'Zia')
    assert.equal(updated.body().data.last_name, 'Ali')
    assert.isNull(updated.body().data.email)
    assert.isNull(updated.body().data.profile_photo_id)
    assert.deepEqual(Object.keys(updated.body().data).sort(), Object.keys(session.customer).sort())
    const me = await client.get(`${base}/me`).header('Authorization', `Bearer ${token}`)
    assert.deepEqual(me.body().data, updated.body().data)
    const refreshed = await client
      .post(`${base}/auth/refresh`)
      .json({ refresh_token: session.credentials.refresh_token })
    refreshed.assertStatus(200)
    assert.deepEqual(refreshed.body().data.customer, updated.body().data)
    const email = await client
      .patch(`${base}/me`)
      .header('Authorization', `Bearer ${refreshed.body().data.credentials.access_token}`)
      .json({ email: 'NEW@EXAMPLE.COM' })
    email.assertStatus(200)
    assert.equal(email.body().data.email, 'new@example.com')
    assert.equal(email.body().data.first_name, 'Zia')
  })

  test('rejects invalid or empty edits and raw phone changes atomically', async ({
    client,
    assert,
  }) => {
    const session = await signIn(client)
    const token = session.credentials.access_token
    for (const input of [
      {},
      { first_name: ' ' },
      { email: 'invalid' },
      { phone_e164: '965 123' },
    ]) {
      const result = await client
        .patch(`${base}/me`)
        .header('Authorization', `Bearer ${token}`)
        .json(input)
      result.assertStatus(422)
    }
    const result = await client
      .patch(`${base}/me`)
      .header('Authorization', `Bearer ${token}`)
      .json({ first_name: 'Changed', phone_e164: nextPhone })
    result.assertStatus(422)
    assert.equal(result.body().error.code, 'PHONE_VERIFICATION_REQUIRED')
    const me = await client.get(`${base}/me`).header('Authorization', `Bearer ${token}`)
    assert.equal(me.body().data.first_name, 'Mariam')
    assert.equal(me.body().data.phone_e164, originalPhone)
    const denied = await client.patch(`${base}/me`).json({ first_name: 'Intruder' })
    denied.assertStatus(401)
  })

  test('updates verified phone, consumes proof and revokes every other session', async ({
    client,
    assert,
  }) => {
    const first = await signIn(client)
    const second = await signIn(client)
    const token = first.credentials.access_token
    const { proof } = await phoneProof(client, token)
    const updated = await client
      .patch(`${base}/me`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phone_e164: nextPhone, phone_verification_token: proof, first_name: 'Zia' })
    updated.assertStatus(200)
    assert.equal(updated.body().data.phone_e164, nextPhone)
    assert.equal(updated.body().data.id, first.customer.id)
    assert.equal(updated.body().data.first_name, 'Zia')
    const other = await client
      .get(`${base}/me`)
      .header('Authorization', `Bearer ${second.credentials.access_token}`)
    other.assertStatus(401)
    const otherRefresh = await client
      .post(`${base}/auth/refresh`)
      .json({ refresh_token: second.credentials.refresh_token })
    otherRefresh.assertStatus(401)
    const replay = await client
      .patch(`${base}/me`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phone_e164: nextPhone, phone_verification_token: proof })
    replay.assertStatus(401)
    const refreshed = await client
      .post(`${base}/auth/refresh`)
      .json({ refresh_token: first.credentials.refresh_token })
    refreshed.assertStatus(200)
    assert.deepEqual(refreshed.body().data.customer, updated.body().data)
  })

  test('binds phone proofs to customer/session/purpose and rejects login exchanges', async ({
    client,
    assert,
  }) => {
    const first = await signIn(client)
    const second = await signIn(client)
    const intruder = await signIn(client, '+96590987333')
    const token = first.credentials.access_token
    const request = await client
      .post(`${base}/me/phone/otp`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phone_e164: nextPhone })
    const id = request.body().data.id
    const publicVerify = await client
      .post(`${base}/auth/otp/${id}/verify`)
      .json({ code: codes.get(nextPhone) })
    publicVerify.assertStatus(422)
    const publicResend = await client.post(`${base}/auth/otp/${id}/resend`)
    publicResend.assertStatus(422)
    const foreign = await client
      .post(`${base}/me/phone/otp/${id}/verify`)
      .header('Authorization', `Bearer ${intruder.credentials.access_token}`)
      .json({ code: codes.get(nextPhone) })
    foreign.assertStatus(422)
    const verified = await client
      .post(`${base}/me/phone/otp/${id}/verify`)
      .header('Authorization', `Bearer ${token}`)
      .json({ code: codes.get(nextPhone) })
    verified.assertStatus(200)
    assert.equal(verified.body().data.next_action, 'update_phone')
    const proof = verified.body().data.verification_token
    const loginExchange = await client
      .post(`${base}/auth/session`)
      .json({ verification_token: proof })
    loginExchange.assertStatus(401)
    const otherSession = await client
      .patch(`${base}/me`)
      .header('Authorization', `Bearer ${second.credentials.access_token}`)
      .json({ phone_e164: nextPhone, phone_verification_token: proof })
    otherSession.assertStatus(401)
    const mismatch = await client
      .patch(`${base}/me`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phone_e164: '+96590987444', phone_verification_token: proof })
    mismatch.assertStatus(422)
  })

  test('cannot use a login proof to change phone; stale phone proof expires', async ({
    client,
  }) => {
    const session = await signIn(client)
    const token = session.credentials.access_token
    const requested = await client.post(`${base}/auth/otp`).json({ phone_e164: nextPhone })
    const loginProof = await client
      .post(`${base}/auth/otp/${requested.body().data.id}/verify`)
      .json({ code: codes.get(nextPhone) })
    const denied = await client
      .patch(`${base}/me`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        phone_e164: nextPhone,
        phone_verification_token: loginProof.body().data.verification_token,
      })
    denied.assertStatus(401)
    await db
      .from('customer_otp_challenges')
      .where('phone_e164', nextPhone)
      .update({ resend_available_at: new Date(Date.now() - 2000) })
    const { id, proof } = await phoneProof(client, token)
    await db
      .from('customer_otp_challenges')
      .where('id', id)
      .update({ verification_expires_at: new Date(Date.now() - 2000) })
    const expired = await client
      .patch(`${base}/me`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phone_e164: nextPhone, phone_verification_token: proof })
    expired.assertStatus(401)
  })

  test('rejects taken phones and stale current authentication; resends keep limits', async ({
    client,
  }) => {
    const session = await signIn(client)
    const token = session.credentials.access_token
    await signIn(client, nextPhone)
    const taken = await client
      .post(`${base}/me/phone/otp`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phone_e164: nextPhone })
    taken.assertStatus(409)
    await db.from('customers').where('phone_e164', nextPhone).delete()
    await db
      .from('customer_otp_challenges')
      .where('phone_e164', nextPhone)
      .update({ resend_available_at: new Date(Date.now() - 2000) })
    const request = await client
      .post(`${base}/me/phone/otp`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phone_e164: nextPhone })
    request.assertStatus(202)
    const id = request.body().data.id
    const cooldown = await client
      .post(`${base}/me/phone/otp/${id}/resend`)
      .header('Authorization', `Bearer ${token}`)
    cooldown.assertStatus(429)
    await db
      .from('customer_otp_challenges')
      .where('id', id)
      .update({ resend_available_at: new Date(Date.now() - 2000) })
    const resent = await client
      .post(`${base}/me/phone/otp/${id}/resend`)
      .header('Authorization', `Bearer ${token}`)
    resent.assertStatus(202)
    await db
      .from('customer_sessions')
      .where('customer_id', session.customer.id)
      .update({ authenticated_at: new Date(Date.now() - 601000) })
    const stale = await client
      .post(`${base}/me/phone/otp`)
      .header('Authorization', `Bearer ${token}`)
      .json({ phone_e164: '+96590987444' })
    stale.assertStatus(403)
  })

  test('private photos upload, replace and remove; all responses retain Customer shape', async ({
    client,
    assert,
  }) => {
    const session = await signIn(client)
    const token = session.credentials.access_token
    const image = await sharp({
      create: { width: 12, height: 10, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer()
    const uploaded = await client
      .post(`${base}/me/photo`)
      .header('Authorization', `Bearer ${token}`)
      .file('file', image, { filename: 'profile.png', contentType: 'image/png' })
    assert.equal(uploaded.status(), 200, JSON.stringify(uploaded.body()))
    const firstId = uploaded.body().data.profile_photo_id
    files.add(firstId)
    assert.isTrue(await drive.use('local').exists(profilePhotoKey(firstId)))
    const photo = await client.get(`${base}/me/photo`).header('Authorization', `Bearer ${token}`)
    photo.assertStatus(200)
    photo.assertHeader('content-type', 'image/webp')
    photo.assertHeader('cache-control', 'no-store')
    const stranger = await signIn(client, '+96590987333')
    const foreign = await client
      .get(`${base}/me/photo`)
      .header('Authorization', `Bearer ${stranger.credentials.access_token}`)
    foreign.assertStatus(404)
    const guest = await client.get(`${base}/me/photo`)
    guest.assertStatus(401)
    const replaced = await client
      .post(`${base}/me/photo`)
      .header('Authorization', `Bearer ${token}`)
      .file('file', image, { filename: 'profile.png', contentType: 'image/png' })
    replaced.assertStatus(200)
    const secondId = replaced.body().data.profile_photo_id
    files.add(secondId)
    assert.notEqual(secondId, firstId)
    assert.isFalse(await drive.use('local').exists(profilePhotoKey(firstId)))
    const refreshed = await client
      .post(`${base}/auth/refresh`)
      .json({ refresh_token: session.credentials.refresh_token })
    refreshed.assertStatus(200)
    assert.deepEqual(refreshed.body().data.customer, replaced.body().data)
    const removed = await client
      .delete(`${base}/me/photo`)
      .header('Authorization', `Bearer ${refreshed.body().data.credentials.access_token}`)
    removed.assertStatus(200)
    assert.isNull(removed.body().data.profile_photo_id)
    assert.isFalse(await drive.use('local').exists(profilePhotoKey(secondId)))
  })

  test('rejects corrupt photos and account deletion also erases the private file', async ({
    client,
    assert,
  }) => {
    const session = await signIn(client)
    const token = session.credentials.access_token
    const invalid = await client
      .post(`${base}/me/photo`)
      .header('Authorization', `Bearer ${token}`)
      .file('file', Buffer.from('not a PNG'), { filename: 'profile.png', contentType: 'image/png' })
    invalid.assertStatus(422)
    const image = await sharp({
      create: { width: 5, height: 5, channels: 3, background: '#00ff00' },
    })
      .png()
      .toBuffer()
    const uploaded = await client
      .post(`${base}/me/photo`)
      .header('Authorization', `Bearer ${token}`)
      .file('file', image, { filename: 'profile.png', contentType: 'image/png' })
    assert.equal(uploaded.status(), 200, JSON.stringify(uploaded.body()))
    const id = uploaded.body().data.profile_photo_id
    files.add(id)
    const deleted = await client.delete(`${base}/me`).header('Authorization', `Bearer ${token}`)
    deleted.assertStatus(204)
    assert.isFalse(await drive.use('local').exists(profilePhotoKey(id)))
  })
})
