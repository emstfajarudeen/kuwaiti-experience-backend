import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import drive from '@adonisjs/drive/services/main'
import limiter from '@adonisjs/limiter/services/main'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import sharp from 'sharp'
import { loginAdmin } from '../../app/services/auth_service.js'

const expectStatus = (response: { assertStatus: (status: number) => void }, status: number) =>
  response.assertStatus(status)
const base = '/api/v2'
const files = new Set<string>()
let auth: string
let adminId: number

async function place(type = 'attraction', status = 'published') {
  const slug = `explore-${randomUUID()}`
  const [id] = await db.table('places').insert({
    type,
    slug,
    status,
    cover_image_key: null,
    price_mode: 'from',
    price_amount: '3.000',
    price_currency: 'KWD',
    published_at: status === 'published' ? new Date(Date.now() - 1000) : null,
    created_at: new Date(),
  })
  await db.table('place_translations').insert({
    place_id: id,
    locale: 'en',
    title: 'Test venue',
    summary: 'A visitor guide',
    address: 'Kuwait City',
    body: 'About this venue',
  })
  return { id: Number(id), slug }
}
async function customer() {
  const [id] = await db.table('customers').insert({
    phone_e164: `+965${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`,
    first_name: 'Test',
    last_name: 'Customer',
    phone_verified_at: new Date(),
    created_at: new Date(),
  })
  const token = `ca_${randomBytes(48).toString('base64url')}`
  await db.table('customer_sessions').insert({
    id: randomUUID(),
    customer_id: id,
    access_token_hash: createHash('sha256').update(token).digest('hex'),
    access_expires_at: new Date(Date.now() + 900000),
    authenticated_at: new Date(),
    expires_at: new Date(Date.now() + 86400000),
    created_at: new Date(),
  })
  return { id: Number(id), token: `Bearer ${token}` }
}
const featurePayload = (type = 'attraction') => ({
  type,
  code: 'family-friendly',
  kind: 'highlight',
  name_en: 'Family friendly',
  name_ar: null,
  active: true,
  sort_order: 0,
})

test.group('Explore and CMS extensions', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    const rollback = await testUtils.db().withGlobalTransaction()
    for (const code of ['attraction', 'restaurant', 'hotel_resort', 'theater'])
      await db.table('category_types').insert({ code, name_en: code }).onConflict('code').ignore()
    const [id] = await db.table('users').insert({
      full_name: 'Explore Admin',
      email: 'explore-admin@example.com',
      password: await hash.make('explore-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    adminId = Number(id)
    const login = await loginAdmin('explore-admin@example.com', 'explore-test-password')
    auth = `Bearer ${login.accessToken}`
    return rollback
  })
  group.each.teardown(async () => {
    for (const key of files) await drive.use('local').delete(key)
    files.clear()
  })

  test('lists, details, saved lists and CMS share exactly the same Place shape and types', async ({
    client,
    assert,
  }) => {
    const p = await place()
    const user = await customer()
    const feature = await client
      .post(`${base}/admin/place-features`)
      .header('Authorization', auth)
      .json(featurePayload())
    feature.assertStatus(201)
    const update = await client
      .patch(`${base}/admin/places/${p.id}/explore`)
      .header('Authorization', auth)
      .json({ phone_e164: '+96590987788', feature_ids: [feature.body().data.id] })
    update.assertStatus(200)
    const detail = await client.get(`${base}/places/${p.slug}`)
    const list = await client.get(`${base}/places?type=attraction`)
    detail.assertStatus(200)
    list.assertStatus(200)
    const expected = detail.body().data
    assert.deepEqual(
      list.body().data.find((row: { id: number }) => row.id === p.id),
      expected
    )
    assert.deepEqual(update.body().data, expected)
    assert.strictEqual(expected.price_amount, '3.000')
    assert.isNull(expected.check_in_time)
    assert.isNull(expected.screen_count)
    assert.isArray(expected.place_hours)
    assert.isArray(expected.place_images)
    assert.isBoolean(expected.place_features[0].active)
    assert.notProperty(expected, 'hoursNote')
    assert.notProperty(expected, 'price')
    const first = await client
      .put(`${base}/customer/me/saved-places/${p.id}`)
      .header('Authorization', user.token)
    first.assertStatus(200)
    const again = await client
      .put(`${base}/customer/me/saved-places/${p.id}`)
      .header('Authorization', user.token)
    assert.deepEqual(first.body(), again.body())
    const saved = await client
      .get(`${base}/customer/me/saved-places`)
      .header('Authorization', user.token)
    saved.assertStatus(200)
    assert.deepEqual(saved.body().data[0], expected)
    assert.isTrue(saved.body().meta.viewer[0].saved)
    assert.isFalse(detail.body().meta.viewer[0].saved)
    const personal = await client
      .get(`${base}/places/${p.slug}`)
      .header('Authorization', user.token)
    assert.isTrue(personal.body().meta.viewer[0].saved)
    assert.equal(personal.header('cache-control'), 'no-store')
  })

  test('protects bookmarks by account, hides unpublished saves and cascades account deletion', async ({
    client,
    assert,
  }) => {
    const p = await place()
    const draft = await place('attraction', 'draft')
    const a = await customer()
    const b = await customer()
    expectStatus(await client.put(`${base}/customer/me/saved-places/${p.id}`), 401)
    expectStatus(
      await client
        .put(`${base}/customer/me/saved-places/${draft.id}`)
        .header('Authorization', a.token),
      404
    )
    expectStatus(
      await client.put(`${base}/customer/me/saved-places/${p.id}`).header('Authorization', a.token),
      200
    )
    const other = await client
      .get(`${base}/customer/me/saved-places`)
      .header('Authorization', b.token)
    assert.equal(other.body().meta.total, 0)
    expectStatus(
      await client
        .delete(`${base}/customer/me/saved-places/${p.id}`)
        .header('Authorization', b.token),
      204
    )
    assert.isNotNull(await db.from('customer_saved_places').where('customer_id', a.id).first())
    await db.from('places').where('id', p.id).update({ status: 'archived' })
    const hidden = await client
      .get(`${base}/customer/me/saved-places`)
      .header('Authorization', a.token)
    assert.equal(hidden.body().meta.total, 0)
    expectStatus(await client.delete(`${base}/customer/me`).header('Authorization', a.token), 204)
    assert.isNull(await db.from('customer_saved_places').where('customer_id', a.id).first())
  })

  test('calculates Open Now before pagination and preserves unknown schedules', async ({
    client,
    assert,
  }) => {
    const open = await place()
    const unknown = await place()
    const closed = await place()
    const today = DateTime.now().setZone('Asia/Kuwait').weekday % 7
    for (const p of [open, closed]) {
      const response = await client
        .patch(`${base}/admin/places/${p.id}/explore`)
        .header('Authorization', auth)
        .json({
          place_hours: [
            {
              weekday: today,
              interval_index: 0,
              opens_at: p === open ? '00:00' : null,
              closes_at: p === open ? '00:00' : null,
              closes_next_day: p === open,
              closed: p === closed,
            },
          ],
        })
      response.assertStatus(200)
    }
    const filtered = await client.get(`${base}/places?type=attraction&open_now=true&per_page=1`)
    filtered.assertStatus(200)
    assert.equal(filtered.body().meta.total, 1)
    assert.equal(filtered.body().data[0].id, open.id)
    assert.isTrue(filtered.body().meta.viewer[0].open_now)
    const detail = await client.get(`${base}/places/${unknown.slug}`)
    assert.isNull(detail.body().meta.viewer[0].open_now)
    expectStatus(await client.get(`${base}/places?type=attraction&open_now=yes`), 422)
    expectStatus(await client.get(`${base}/places?type=attraction&per_page=999`), 422)
  })

  test('validates type-specific fields, features and structured hours atomically', async ({
    client,
    assert,
  }) => {
    const p = await place()
    const stay = await place('hotel_resort')
    const theater = await place('theater')
    const feature = await client
      .post(`${base}/admin/place-features`)
      .header('Authorization', auth)
      .json(featurePayload('restaurant'))
    feature.assertStatus(201)
    for (const body of [
      { screen_count: 2 },
      { check_in_time: '14:00' },
      { phone_e164: 'bad' },
      { feature_ids: [feature.body().data.id] },
      {
        place_hours: [
          {
            weekday: 1,
            interval_index: 0,
            opens_at: '10:00',
            closes_at: '09:00',
            closes_next_day: false,
            closed: false,
          },
        ],
      },
    ]) {
      expectStatus(
        await client
          .patch(`${base}/admin/places/${p.id}/explore`)
          .header('Authorization', auth)
          .json(body),
        422
      )
    }
    const unchanged = await db.from('places').where('id', p.id).first()
    assert.isNull(unchanged.phone_e164)
    const checked = await client
      .patch(`${base}/admin/places/${stay.id}/explore`)
      .header('Authorization', auth)
      .json({ check_in_time: '14:00', check_out_time: '12:00' })
    checked.assertStatus(200)
    assert.equal(checked.body().data.check_in_time, '14:00:00')
    const screens = await client
      .patch(`${base}/admin/places/${theater.id}/explore`)
      .header('Authorization', auth)
      .json({ screen_count: 12 })
    screens.assertStatus(200)
    assert.strictEqual(screens.body().data.screen_count, 12)
    expectStatus(
      await client.patch(`${base}/admin/places/${p.id}/explore`).json({ phone_e164: null }),
      401
    )
  })

  test('filters capabilities, hides inactive features and searches Arabic without aliases', async ({
    client,
    assert,
  }) => {
    const p = await place('theater')
    const other = await place('theater')
    const f = await client
      .post(`${base}/admin/place-features`)
      .header('Authorization', auth)
      .json({ ...featurePayload('theater'), code: 'imax', kind: 'capability', name_en: 'IMAX' })
    f.assertStatus(201)
    expectStatus(
      await client
        .patch(`${base}/admin/places/${p.id}/explore`)
        .header('Authorization', auth)
        .json({ feature_ids: [f.body().data.id] }),
      200
    )
    const filtered = await client.get(`${base}/places?type=theater&feature=imax`)
    assert.deepEqual(
      filtered.body().data.map((r: { id: number }) => r.id),
      [p.id]
    )
    expectStatus(
      await client
        .delete(`${base}/admin/place-features/${f.body().data.id}`)
        .header('Authorization', auth),
      409
    )
    await db.table('place_translations').insert({
      place_id: other.id,
      locale: 'ar',
      title: 'سينما',
      summary: 'فيلم',
      address: 'الكويت',
    })
    const arabic = await client
      .get(`${base}/places`)
      .qs({ type: 'theater', q: 'سينما', locale: 'ar' })
    arabic.assertStatus(200)
    assert.equal(arabic.body().meta.total, 1)
    await db.from('place_features').where('id', f.body().data.id).update({ active: false })
    const hidden = await client.get(`${base}/place-features?type=theater`)
    assert.deepEqual(hidden.body().data, [])
  })

  test('manages movie posters and published dated showtimes with canonical schemas', async ({
    client,
    assert,
  }) => {
    const theater = await place('theater')
    const created = await client
      .post(`${base}/admin/movies`)
      .header('Authorization', auth)
      .json({ title_en: 'Test movie', status: 'draft' })
    created.assertStatus(201)
    const id = created.body().data.id
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer()
    const upload = await client
      .put(`${base}/admin/movies/${id}/poster`)
      .header('Authorization', auth)
      .file('file', image, { filename: 'poster.png', contentType: 'image/png' })
    upload.assertStatus(200)
    files.add(upload.body().data.poster_image_key)
    expectStatus(await client.get(`/api/v1/images/${upload.body().data.poster_image_key}`), 404)
    const published = await client
      .put(`${base}/admin/movies/${id}`)
      .header('Authorization', auth)
      .json({ title_en: 'Test movie', status: 'published' })
    published.assertStatus(200)
    expectStatus(await client.get(`/api/v1/images/${upload.body().data.poster_image_key}`), 200)
    const starts = DateTime.now()
      .plus({ days: 1 })
      .setZone('Asia/Kuwait')
      .startOf('day')
      .plus({ hours: 12 })
    const body = {
      place_id: theater.id,
      movie_id: id,
      starts_at: starts.toISO(),
      format: 'IMAX',
      status: 'published',
    }
    const session = await client
      .post(`${base}/admin/showtimes`)
      .header('Authorization', auth)
      .json(body)
    session.assertStatus(201)
    expectStatus(
      await client.post(`${base}/admin/showtimes`).header('Authorization', auth).json(body),
      409
    )
    const listed = await client.get(
      `${base}/places/${theater.slug}/showtimes?date=${starts.toISODate()}`
    )
    listed.assertStatus(200)
    assert.equal(
      listed.body().data.length,
      1,
      JSON.stringify({
        listed: listed.body(),
        session: session.body(),
        rawMovie: await db.from('movies').where('id', id).first(),
      })
    )
    assert.deepEqual(listed.body().data[0], session.body().data)
    assert.deepEqual(listed.body().included.movies[0], published.body().data)
    const invalidDate = await client.get(`${base}/places/${theater.slug}/showtimes?date=2026-02-30`)
    invalidDate.assertStatus(422)
    expectStatus(
      await client.delete(`${base}/admin/movies/${id}`).header('Authorization', auth),
      409
    )
    expectStatus(
      await client.delete(`${base}/admin/movies/${id}/poster`).header('Authorization', auth),
      422
    )
    await client
      .put(`${base}/admin/showtimes/${session.body().data.id}`)
      .header('Authorization', auth)
      .json({ ...body, status: 'cancelled' })
    const cancelled = await client.get(
      `${base}/places/${theater.slug}/showtimes?date=${starts.toISODate()}`
    )
    assert.equal(cancelled.body().meta.total, 0)
    await client
      .delete(`${base}/admin/showtimes/${session.body().data.id}`)
      .header('Authorization', auth)
    expectStatus(
      await client.delete(`${base}/admin/movies/${id}`).header('Authorization', auth),
      204
    )
    assert.isFalse(await drive.use('local').exists(upload.body().data.poster_image_key))
  })

  test('rejects invalid movie/showtime data and hides drafts, future publication and archived venues', async ({
    client,
    assert,
  }) => {
    const p = await place()
    const draft = await place('theater', 'draft')
    const future = await place('theater')
    await db
      .from('places')
      .where('id', future.id)
      .update({ published_at: new Date(Date.now() + 86400000) })
    expectStatus(await client.get(`${base}/places/${draft.slug}`), 404)
    expectStatus(await client.get(`${base}/places/${future.slug}`), 404)
    expectStatus(
      await client.get(`${base}/places?type=attraction`).header('Authorization', 'Bearer invalid'),
      401
    )
    expectStatus(
      await client
        .post(`${base}/admin/movies`)
        .header('Authorization', auth)
        .json({ title_en: 'Missing poster', status: 'published' }),
      422
    )
    const m = await client
      .post(`${base}/admin/movies`)
      .header('Authorization', auth)
      .json({ title_en: 'Draft', status: 'draft' })
    const invalid = await client
      .post(`${base}/admin/showtimes`)
      .header('Authorization', auth)
      .json({
        place_id: p.id,
        movie_id: m.body().data.id,
        starts_at: '2026-10-21T12:00:00+03:00',
        format: '2D',
        status: 'draft',
      })
    invalid.assertStatus(422)
    assert.isNotNull(
      await db
        .from('audit_logs')
        .where('actor_id', adminId)
        .where('action', 'movie.created')
        .first()
    )
  })

  test('renders and saves actual CMS forms with CSRF protection', async ({ client, assert }) => {
    const p = await place('hotel_resort')
    const token = auth.replace('Bearer ', '')
    for (const path of [
      '/admin/place-features',
      '/admin/movies',
      '/admin/movies/new',
      '/admin/showtimes',
      `/admin/places/${p.id}/explore`,
    ]) {
      const page = await client.get(path).cookie('admin_access', token)
      assert.equal(page.status(), 200, `${path}: ${page.text().slice(0, 400)}`)
    }
    const save = await client
      .post(`/admin/places/${p.id}/explore`)
      .cookie('admin_access', token)
      .withCsrfToken()
      .form({ phone_e164: '+96590987788', check_in_time: '15:00', check_out_time: '11:00' })
    save.assertStatus(200)
    const row = await db.from('places').where('id', p.id).first()
    assert.equal(row.phone_e164, '+96590987788')
    assert.equal(row.check_in_time, '15:00:00')
    await client
      .post('/admin/place-features')
      .cookie('admin_access', token)
      .withCsrfToken()
      .form({ ...featurePayload('hotel_resort'), active: 'on' })
    assert.isNotNull(await db.from('place_features').where('type', 'hotel_resort').first())
    await client
      .post('/admin/movies')
      .cookie('admin_access', token)
      .withCsrfToken()
      .form({ title_en: 'CMS movie', status: 'draft' })
    assert.isNotNull(await db.from('movies').where('title_en', 'CMS movie').first())
    const theater = await place('theater')
    const poster = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#abcdef' },
    })
      .png()
      .toBuffer()
    const movieSave = await client
      .post('/admin/movies')
      .cookie('admin_access', token)
      .withCsrfToken()
      .fields({ title_en: 'CMS published movie', status: 'published' })
      .file('poster', poster, { filename: 'poster.png', contentType: 'image/png' })
    movieSave.assertStatus(200)
    const movie = await db.from('movies').where('title_en', 'CMS published movie').first()
    assert.isNotNull(movie)
    files.add(movie.poster_image_key)
    const starts = DateTime.now()
      .setZone('Asia/Kuwait')
      .plus({ days: 1 })
      .toFormat("yyyy-MM-dd'T'HH:mm")
    const showtimeSave = await client
      .post('/admin/showtimes')
      .cookie('admin_access', token)
      .withCsrfToken()
      .form({
        place_id: theater.id,
        movie_id: movie.id,
        starts_at: starts,
        format: 'IMAX',
        status: 'published',
      })
    showtimeSave.assertStatus(200)
    const showtime = await db.from('theater_showtimes').where('movie_id', movie.id).first()
    assert.isNotNull(showtime)
    for (const path of [
      `/admin/movies/${movie.id}/edit`,
      `/admin/showtimes/${showtime.id}/edit`,
      `/admin/places/${theater.id}/explore`,
    ]) {
      const page = await client.get(path).cookie('admin_access', token)
      assert.equal(page.status(), 200, path)
    }
    await client
      .post(`/admin/places/${p.id}/explore`)
      .cookie('admin_access', token)
      .form({ phone_e164: '+96590987999' })
    const protectedRow = await db.from('places').where('id', p.id).first()
    assert.equal(protectedRow.phone_e164, '+96590987788')
  })
})
