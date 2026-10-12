import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import sharp from 'sharp'
import { loginAdmin } from '../../app/services/auth_service.js'
import { savePlace } from '../../app/services/content_write_service.js'

test.group('Content lifecycle', (group) => {
  group.each.setup(async () => {
    await testUtils.db().truncate()
    await db
      .table('category_types')
      .insert({ code: 'attraction', name_en: 'Attractions' })
      .onConflict('code')
      .ignore()
  })

  test('upload, draft preview, publish, archive and safe media removal', async ({
    client,
    assert,
  }) => {
    await db.table('users').insert({
      full_name: 'Content Admin',
      email: 'content@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const login = await loginAdmin('content@example.com', 'a-very-long-test-password')
    const auth = `Bearer ${login.accessToken}`
    const image = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="navy"/></svg>'
      )
    )
      .png()
      .toBuffer()
    const upload = await client
      .post('/api/v1/admin/media')
      .header('Authorization', auth)
      .field('alt_en', 'A test image')
      .file('file', image, { filename: 'sample.png', contentType: 'image/png' })
    upload.assertStatus(201)
    const mediaId = upload.body().data.id as number

    const payload = {
      type: 'attraction',
      slug: 'test-landmark',
      titleEn: 'Test Landmark',
      summaryEn: 'A place for integration testing',
      addressEn: 'Kuwait City',
      coverMediaId: mediaId,
      featured: true,
    }
    const created = await client
      .post('/api/v1/admin/places')
      .header('Authorization', auth)
      .json(payload)
    created.assertStatus(201)
    const placeId = created.body().data.id as number

    const hidden = await client.get('/api/v1/places/test-landmark')
    hidden.assertStatus(404)
    const draftHome = await client.get('/api/v1/home')
    assert.deepEqual(draftHome.body().data.featured[0].places, [])
    const preview = await client
      .get(`/api/v1/admin/places/${placeId}/preview`)
      .header('Authorization', auth)
    preview.assertStatus(200)
    assert.equal(preview.body().data.title, 'Test Landmark')
    const htmlPreview = await client
      .get(`/admin/places/${placeId}/preview`)
      .cookie('admin_access', login.accessToken)
    htmlPreview.assertStatus(200)

    const duplicate = await client
      .put(`/api/v1/admin/places/${placeId}`)
      .header('Authorization', auth)
      .json({ ...payload, galleryIds: [mediaId, mediaId] })
    duplicate.assertStatus(422)
    assert.equal(duplicate.body().error.code, 'INVALID_MEDIA')

    const published = await client
      .post(`/api/v1/admin/places/${placeId}/publish`)
      .header('Authorization', auth)
    published.assertStatus(200)
    const visible = await client.get('/api/v1/places/test-landmark')
    visible.assertStatus(200)
    const featuredHome = await client.get('/api/v1/home')
    featuredHome.assertStatus(200)
    assert.equal(featuredHome.body().data.featured[0].type, 'attraction')
    assert.equal(featuredHome.body().data.featured[0].places[0].slug, 'test-landmark')
    const unfeatured = await client
      .put(`/api/v1/admin/places/${placeId}`)
      .header('Authorization', auth)
      .json({ ...payload, featured: false })
    unfeatured.assertStatus(200)
    const homeWithoutFeatured = await client.get('/api/v1/home')
    assert.deepEqual(homeWithoutFeatured.body().data.featured[0].places, [])
    const imageResponse = await client.get(`/api/v1/media/${mediaId}`)
    imageResponse.assertStatus(200)
    const inUse = await client
      .delete(`/api/v1/admin/media/${mediaId}`)
      .header('Authorization', auth)
    inUse.assertStatus(409)

    const archived = await client
      .post(`/api/v1/admin/places/${placeId}/archive`)
      .header('Authorization', auth)
    archived.assertStatus(200)
    const hiddenAgain = await client.get('/api/v1/places/test-landmark')
    hiddenAgain.assertStatus(404)
    const deleted = await client
      .delete(`/api/v1/admin/places/${placeId}`)
      .header('Authorization', auth)
    deleted.assertStatus(204)
    const mediaRemoved = await client
      .delete(`/api/v1/admin/media/${mediaId}`)
      .header('Authorization', auth)
    mediaRemoved.assertStatus(204)
  })

  test('saves and publishes a new place together, rolling back if its cover is missing', async ({
    assert,
  }) => {
    await db.table('category_types').insert({ code: 'publish_test', name_en: 'Publish test' })
    const [adminId] = await db.table('users').insert({
      full_name: 'Content Admin',
      email: 'publish@example.com',
      password: 'unused-for-this-test',
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const [mediaId] = await db.table('media').insert({
      storage_key: 'test/publish-cover.png',
      original_name: 'publish-cover.png',
      mime: 'image/png',
      bytes: 1,
      created_at: new Date(),
    })
    const input = {
      type: 'publish_test',
      slug: 'publish-from-form',
      titleEn: 'Publish from form',
      summaryEn: 'A complete place',
      addressEn: 'Kuwait City',
    }
    await savePlace(input, adminId, undefined, { publish: true }).then(
      () => assert.fail('Publishing without a cover should fail'),
      (error) => assert.equal(error.code, 'INCOMPLETE_PLACE')
    )
    assert.isNull(await db.from('places').where('slug', input.slug).first())

    const id = await savePlace({ ...input, coverMediaId: mediaId }, adminId, undefined, {
      publish: true,
    })
    const place = await db.from('places').where('id', id).first()
    assert.equal(place?.status, 'published')
    assert.isNotNull(place?.published_at)
    const actions = await db.from('audit_logs').where('entity_type', 'place').where('entity_id', id)
    assert.sameMembers(
      actions.map((row) => row.action),
      ['place.created', 'place.published']
    )
  })
})
