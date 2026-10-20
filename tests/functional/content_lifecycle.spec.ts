import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import drive from '@adonisjs/drive/services/main'
import limiter from '@adonisjs/limiter/services/main'
import sharp from 'sharp'
import { loginAdmin } from '../../app/services/auth_service.js'
import { savePlace } from '../../app/services/content_write_service.js'
import { allImageKeys } from '../../app/services/image_reference_service.js'
import { deleteImages } from '../../app/services/image_storage_service.js'

function keyOf(url: string) {
  return url.split('/').pop()!
}

test.group('Content lifecycle', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    const truncate = await testUtils.db().truncate()
    await db
      .table('category_types')
      .insert({ code: 'attraction', name_en: 'Attractions' })
      .onConflict('code')
      .ignore()
    return async () => {
      await deleteImages(await allImageKeys())
      await truncate()
    }
  })

  test('draft preview, cover upload, publish, archive and image cleanup', async ({
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

    const payload = {
      type: 'attraction',
      slug: 'test-landmark',
      titleEn: 'Test Landmark',
      summaryEn: 'A place for integration testing',
      addressEn: 'Kuwait City',
      featured: true,
    }
    const created = await client
      .post('/api/v1/admin/places')
      .header('Authorization', auth)
      .json(payload)
    created.assertStatus(201)
    const placeId = created.body().data.id as number
    const incomplete = await client
      .post(`/api/v1/admin/places/${placeId}/publish`)
      .header('Authorization', auth)
    incomplete.assertStatus(422)
    assert.equal(incomplete.body().error.code, 'INCOMPLETE_PLACE')
    const upload = await client
      .put(`/api/v1/admin/places/${placeId}/cover`)
      .header('Authorization', auth)
      .file('file', image, { filename: 'sample.png', contentType: 'image/png' })
    upload.assertStatus(200)
    const coverKey = keyOf(upload.body().data.coverUrl)
    assert.isTrue(await drive.use('local').exists(coverKey))
    const draftImage = await client.get(`/api/v1/images/${coverKey}`)
    draftImage.assertStatus(404)

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

    const published = await client
      .post(`/api/v1/admin/places/${placeId}/publish`)
      .header('Authorization', auth)
    published.assertStatus(200)
    const visible = await client.get('/api/v1/places/test-landmark')
    visible.assertStatus(200)
    assert.deepEqual(visible.body().data.cover, { url: `/api/v1/images/${coverKey}` })
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
    assert.equal(unfeatured.body().data.id, placeId)
    const stored = await db.from('places').where('id', placeId).first()
    assert.equal(stored.cover_image_key, coverKey, 'JSON place updates keep the uploaded cover')
    const imageResponse = await client.get(`/api/v1/images/${coverKey}`)
    imageResponse.assertStatus(200)
    imageResponse.assertHeader('content-type', 'image/webp')
    const coverRequired = await client
      .delete(`/api/v1/admin/places/${placeId}/cover`)
      .header('Authorization', auth)
    coverRequired.assertStatus(422)
    assert.equal(coverRequired.body().error.code, 'COVER_REQUIRED')

    const archived = await client
      .post(`/api/v1/admin/places/${placeId}/archive`)
      .header('Authorization', auth)
    archived.assertStatus(200)
    const hiddenAgain = await client.get('/api/v1/places/test-landmark')
    hiddenAgain.assertStatus(404)
    const archivedImage = await client.get(`/api/v1/images/${coverKey}`)
    archivedImage.assertStatus(404)
    const deleted = await client
      .delete(`/api/v1/admin/places/${placeId}`)
      .header('Authorization', auth)
    deleted.assertStatus(204)
    assert.isFalse(await drive.use('local').exists(coverKey))
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
    const cover = {
      buffer: await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#123c5b' },
      })
        .webp()
        .toBuffer(),
    }
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

    const id = await savePlace(input, adminId, undefined, {
      publish: true,
      images: { cover },
    })
    const place = await db.from('places').where('id', id).first()
    assert.isTrue(await drive.use('local').exists(place.cover_image_key))
    assert.equal(place?.status, 'published')
    assert.isNotNull(place?.published_at)
    const actions = await db.from('audit_logs').where('entity_type', 'place').where('entity_id', id)
    assert.sameMembers(
      actions.map((row) => row.action),
      ['place.created', 'place.published']
    )
  })
})
