import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import drive from '@adonisjs/drive/services/main'
import limiter from '@adonisjs/limiter/services/main'
import sharp from 'sharp'
import { loginAdmin } from '../../app/services/auth_service.js'
import { allImageKeys } from '../../app/services/image_reference_service.js'
import { deleteImages } from '../../app/services/image_storage_service.js'

test.group('Category type master', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    const truncate = await testUtils.db().truncate()
    return async () => {
      await deleteImages(await allImageKeys())
      await truncate()
    }
  })

  test('admin edits feed the ordered public tiles and CMS', async ({ client, assert }) => {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'types@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    await db
      .table('category_types')
      .insert([
        { code: 'attraction', name_en: 'Attractions', sort_order: 0 },
        { code: 'restaurant', name_en: 'Restaurants', sort_order: 1 },
      ])
      .onConflict('code')
      .merge()
    const login = await loginAdmin('types@example.com', 'a-very-long-test-password')
    const token = login.accessToken
    const updated = await client
      .put('/api/v1/admin/category-types/restaurant')
      .header('Authorization', `Bearer ${token}`)
      .json({ nameEn: 'Dining', nameAr: 'مطاعم', sortOrder: -1 })
    updated.assertStatus(200)
    const tileImage = await sharp({
      create: { width: 16, height: 16, channels: 3, background: 'teal' },
    })
      .jpeg()
      .toBuffer()
    const uploaded = await client
      .put('/api/v1/admin/category-types/restaurant/image')
      .header('Authorization', `Bearer ${token}`)
      .file('file', tileImage, { filename: 'dining.jpg', contentType: 'image/jpeg' })
    uploaded.assertStatus(200)
    const imageKey = uploaded.body().data.image_url.split('/').pop()

    const tiles = await client.get('/api/v1/home?locale=ar')
    tiles.assertStatus(200)
    assert.deepEqual(
      tiles
        .body()
        .data.categoryTypes.slice(0, 2)
        .map((tile: { type: string; name: string }) => [tile.type, tile.name]),
      [
        ['restaurant', 'مطاعم'],
        ['attraction', 'Attractions'],
      ]
    )
    const home = await client.get('/api/v1/home?locale=en')
    home.assertStatus(200)
    assert.equal(home.body().data.categoryTypes[0].name, 'Dining')
    assert.equal(home.body().data.categoryTypes[0].image, `/api/v1/images/${imageKey}`)
    const publicImage = await client.get(`/api/v1/images/${imageKey}`)
    publicImage.assertStatus(200)
    const listed = await client
      .get('/api/v1/admin/category-types')
      .header('Authorization', `Bearer ${token}`)
    assert.equal(listed.body().data[0].image_url, `/api/v1/admin/images/${imageKey}`)
    assert.notProperty(listed.body().data[0], 'image_key')
    const removed = await client
      .delete('/api/v1/admin/category-types/restaurant/image')
      .header('Authorization', `Bearer ${token}`)
    removed.assertStatus(204)
    assert.isFalse(await drive.use('local').exists(imageKey))
    const withoutImage = await client.get('/api/v1/home?locale=en')
    assert.isNull(withoutImage.body().data.categoryTypes[0].image)
    const cms = await client.get('/admin/category-types').cookie('admin_access', token)
    cms.assertStatus(200)
    assert.include(cms.text(), 'Dining')
  })

  test('new types work throughout the API and in-use types cannot be deleted', async ({
    client,
    assert,
  }) => {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'newtypes@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const login = await loginAdmin('newtypes@example.com', 'a-very-long-test-password')
    const auth = `Bearer ${login.accessToken}`
    const created = await client
      .post('/api/v1/admin/category-types')
      .header('Authorization', auth)
      .json({ code: 'museum', nameEn: 'Museums', sortOrder: 2 })
    created.assertStatus(201)
    const tile = await client.get('/api/v1/home')
    tile.assertStatus(200)
    assert.equal(tile.body().data.categoryTypes[0].type, 'museum')
    const category = await client
      .post('/api/v1/admin/categories')
      .header('Authorization', auth)
      .json({ type: 'museum', slug: 'art', nameEn: 'Art', sortOrder: 0 })
    category.assertStatus(201)
    const place = await client.post('/api/v1/admin/places').header('Authorization', auth).json({
      type: 'museum',
      slug: 'test-museum',
      titleEn: 'Test Museum',
      summaryEn: 'A museum to test new types',
      addressEn: 'Kuwait City',
    })
    place.assertStatus(201)
    await db.table('site_settings').insert({
      id: 1,
      brand_name: 'The Kuwaiti Experience',
      app_store_url: 'https://apps.apple.com/app/example',
      play_store_url: 'https://play.google.com/store/apps/details?id=example.app',
    })
    const home = await client.get('/api/v1/home')
    home.assertStatus(200)
    assert.equal(home.body().data.categoryTypes[0].type, 'museum')
    assert.deepEqual(home.body().data.featured, [{ type: 'museum', places: [] }])
    assert.notProperty(home.body().data, 'categories')
    assert.deepEqual(home.body().data.app, {
      appStoreUrl: 'https://apps.apple.com/app/example',
      playStoreUrl: 'https://play.google.com/store/apps/details?id=example.app',
    })
    const blocked = await client
      .delete('/api/v1/admin/category-types/museum')
      .header('Authorization', auth)
    blocked.assertStatus(409)
    await client
      .delete(`/api/v1/admin/places/${place.body().data.id}`)
      .header('Authorization', auth)
    await client
      .delete(`/api/v1/admin/categories/${category.body().data.id}`)
      .header('Authorization', auth)
    const deleted = await client
      .delete('/api/v1/admin/category-types/museum')
      .header('Authorization', auth)
    deleted.assertStatus(204)
    const missing = await client.get('/api/v1/places?type=museum')
    missing.assertStatus(422)
  })
})
