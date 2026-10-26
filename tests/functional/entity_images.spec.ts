import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import drive from '@adonisjs/drive/services/main'
import limiter from '@adonisjs/limiter/services/main'
import Tokens from 'csrf'
import sharp from 'sharp'
import { loginAdmin } from '../../app/services/auth_service.js'
import { allImageKeys } from '../../app/services/image_reference_service.js'
import { deleteImages } from '../../app/services/image_storage_service.js'

const placeFields = {
  type: 'attraction',
  slug: 'image-test',
  titleEn: 'Image Test',
  summaryEn: 'A place used to test image uploads',
  addressEn: 'Kuwait City',
}

function png(background = 'navy') {
  return sharp({ create: { width: 16, height: 12, channels: 3, background } })
    .png()
    .toBuffer()
}

function keyOf(url: string) {
  return url.split('/').pop()!
}

async function signIn() {
  await db.table('users').insert({
    full_name: 'Image Admin',
    email: 'images@example.com',
    password: await hash.make('a-very-long-test-password'),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  const login = await loginAdmin('images@example.com', 'a-very-long-test-password')
  return login.accessToken
}

/** A CMS form post carrying a real CSRF token in the multipart body. */
function cmsPost(client: ApiClient, path: string, token: string) {
  const tokens = new Tokens()
  const secret = tokens.secretSync()
  return client
    .post(path)
    .cookie('admin_access', token)
    .withSession({ 'csrf-secret': secret })
    .field('_csrf', tokens.create(secret))
}

async function createPlace(client: ApiClient, token: string) {
  const created = await client
    .post('/api/v1/admin/places')
    .header('Authorization', `Bearer ${token}`)
    .json(placeFields)
  created.assertStatus(201)
  return created.body().data.id as number
}

test.group('Entity images', (group) => {
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

  test('CMS place form uploads, replaces and removes cover and gallery images', async ({
    client,
    assert,
  }) => {
    const token = await signIn()
    const created = await cmsPost(client, '/admin/places', token)
      .fields({ ...placeFields, intent: 'publish', hoursJson: '[]' })
      .file('coverImage', await png(), { filename: 'cover.png', contentType: 'image/png' })
      .file('galleryImages[]', await png('teal'), { filename: 'a.png', contentType: 'image/png' })
      .file('galleryImages[]', await png('gold'), { filename: 'b.png', contentType: 'image/png' })
      .field('galleryAltEn', 'Kuwait skyline')
    created.assertStatus(200)
    const place = await db.from('places').where('slug', placeFields.slug).first()
    assert.equal(place.status, 'published')
    const gallery = await db.from('place_images').where('place_id', place.id).orderBy('sort_order')
    assert.lengthOf(gallery, 2)
    assert.deepEqual(
      gallery.map((image) => [image.alt_en, image.sort_order]),
      [
        ['Kuwait skyline', 0],
        ['Kuwait skyline', 1],
      ]
    )
    for (const key of [place.cover_image_key, ...gallery.map((image) => image.storage_key)]) {
      assert.isTrue(await drive.use('local').exists(key))
    }

    const edited = await cmsPost(client, `/admin/places/${place.id}/save`, token)
      .fields({ ...placeFields, intent: 'save', hoursJson: '[]' })
      .field('gallery[0][id]', String(gallery[0].id))
      .field('gallery[0][altEn]', 'Towers at dusk')
      .field('gallery[0][captionEn]', 'Seen from the corniche')
      .field('gallery[0][sortOrder]', '5')
      .field('gallery[1][id]', String(gallery[1].id))
      .field('gallery[1][remove]', 'on')
      .file('coverImage', await png('maroon'), { filename: 'new.png', contentType: 'image/png' })
    edited.assertStatus(200)
    const updated = await db.from('places').where('id', place.id).first()
    assert.notEqual(updated.cover_image_key, place.cover_image_key)
    assert.isFalse(await drive.use('local').exists(place.cover_image_key))
    assert.isFalse(await drive.use('local').exists(gallery[1].storage_key))
    const remaining = await db.from('place_images').where('place_id', place.id)
    assert.lengthOf(remaining, 1)
    assert.include(remaining[0], {
      alt_en: 'Towers at dusk',
      caption_en: 'Seen from the corniche',
      sort_order: 5,
    })

    const saved = await cmsPost(client, `/admin/places/${place.id}/save`, token).fields({
      ...placeFields,
      intent: 'save',
      hoursJson: '[]',
    })
    saved.assertStatus(200)
    const unchanged = await db.from('place_images').where('place_id', place.id).first()
    assert.equal(unchanged.caption_en, 'Seen from the corniche', 'text-only saves keep captions')

    const detail = await client.get(`/api/v1/places/${placeFields.slug}`)
    detail.assertStatus(200)
    assert.deepEqual(detail.body().data.gallery, [
      {
        id: remaining[0].id,
        url: `/api/v1/images/${remaining[0].storage_key}`,
        alt: 'Towers at dusk',
        caption: 'Seen from the corniche',
      },
    ])
    const preview = await client
      .get(`/admin/places/${place.id}/preview`)
      .cookie('admin_access', token)
    const page = JSON.parse(
      preview
        .text()
        .match(/<script data-page="[^"]+" type="application\/json">([^<]+)<\/script>/)![1]
    )
    assert.equal(page.component, 'places/preview')
    assert.equal(page.props.place.cover.url, `/admin/images/${updated.cover_image_key}`)
  })

  test('CMS uploads tile, hero and logo images', async ({ client, assert }) => {
    const token = await signIn()
    const tile = await cmsPost(client, '/admin/category-types/attraction/save', token)
      .fields({ nameEn: 'Attractions', sortOrder: '0' })
      .file('image', await png(), { filename: 'tile.png', contentType: 'image/png' })
    tile.assertStatus(200)
    const type = await db.from('category_types').where('code', 'attraction').first()
    assert.isTrue(await drive.use('local').exists(type.image_key))

    const hero = await cmsPost(client, '/admin/home', token)
      .fields({
        locale: 'ar',
        heroEyebrow: 'WELCOME',
        heroTitle: 'Explore Kuwait',
        discoveryTitle: 'What would you like to do?',
      })
      .file('heroImage', await png('teal'), { filename: 'hero.png', contentType: 'image/png' })
    hero.assertStatus(200)
    const home = await db.from('home_content').where('locale', 'ar').first()
    const publicHome = await client.get('/api/v1/home?locale=ar')
    assert.equal(publicHome.body().data.hero.image, `/api/v1/images/${home.hero_image_key}`)
    assert.equal(publicHome.body().data.categoryTypes[0].image, `/api/v1/images/${type.image_key}`)

    const logo = await cmsPost(client, '/admin/settings', token)
      .fields({ brandName: 'The Kuwaiti Experience' })
      .file('logoImage', await png('gold'), { filename: 'logo.png', contentType: 'image/png' })
    logo.assertStatus(200)
    const settings = await db.from('site_settings').where('id', 1).first()
    const site = await client.get('/api/v1/site')
    assert.equal(site.body().data.logo, `/api/v1/images/${settings.logo_image_key}`)
    const canonical = await client.get('/api/v2/site')
    assert.equal(canonical.body().data.logo_image_key, settings.logo_image_key)
    assert.notProperty(canonical.body().data, 'logo_media_id')
    const served = await client.get(`/api/v1/images/${settings.logo_image_key}`)
    served.assertStatus(200)

    const removed = await cmsPost(client, '/admin/settings', token).fields({
      brandName: 'The Kuwaiti Experience',
      removeLogo: 'on',
    })
    removed.assertStatus(200)
    const cleared = await db.from('site_settings').where('id', 1).first()
    assert.isNull(cleared.logo_image_key)
    assert.isFalse(await drive.use('local').exists(settings.logo_image_key))
    const gone = await client.get(`/api/v1/images/${settings.logo_image_key}`)
    gone.assertStatus(404)
  })

  test('admin API manages gallery images with limits and cleanup', async ({ client, assert }) => {
    const token = await signIn()
    const auth = `Bearer ${token}`
    const placeId = await createPlace(client, token)

    const added = await client
      .post(`/api/v1/admin/places/${placeId}/gallery`)
      .header('Authorization', auth)
      .field('altEn', 'Gallery image')
      .file('files', await png('teal'), { filename: 'a.png', contentType: 'image/png' })
      .file('files', await png('gold'), { filename: 'b.png', contentType: 'image/png' })
    added.assertStatus(201)
    const [first, second] = added.body().data.gallery
    assert.equal(first.altEn, 'Gallery image')
    const adminImage = await client.get(first.url).header('Authorization', auth)
    adminImage.assertStatus(200)
    const anonymous = await client.get(first.url)
    anonymous.assertStatus(401)
    const draftPublic = await client.get(`/api/v1/images/${keyOf(first.url)}`)
    draftPublic.assertStatus(404)

    const patched = await client
      .patch(`/api/v1/admin/places/${placeId}/gallery/${first.id}`)
      .header('Authorization', auth)
      .json({ captionEn: 'First caption', sortOrder: 9 })
    patched.assertStatus(200)
    const removed = await client
      .delete(`/api/v1/admin/places/${placeId}/gallery/${second.id}`)
      .header('Authorization', auth)
    removed.assertStatus(204)
    assert.isFalse(await drive.use('local').exists(keyOf(second.url)))
    const shown = await client.get(`/api/v1/admin/places/${placeId}`).header('Authorization', auth)
    assert.lengthOf(shown.body().data.gallery, 1)
    assert.include(shown.body().data.gallery[0], { captionEn: 'First caption', sortOrder: 9 })
    assert.notProperty(shown.body().data, 'cover_image_key')

    const otherPlace = await client
      .post('/api/v1/admin/places')
      .header('Authorization', auth)
      .json({ ...placeFields, slug: 'other-place' })
    const foreign = await client
      .delete(`/api/v1/admin/places/${otherPlace.body().data.id}/gallery/${first.id}`)
      .header('Authorization', auth)
    foreign.assertStatus(404)

    const tooMany = client
      .post(`/api/v1/admin/places/${placeId}/gallery`)
      .header('Authorization', auth)
    for (let index = 0; index < 6; index++) {
      tooMany.file('files', await png(), { filename: `${index}.png`, contentType: 'image/png' })
    }
    const rejected = await tooMany
    rejected.assertStatus(422)
    assert.equal(rejected.body().error.code, 'TOO_MANY_FILES')

    const invalid = await client
      .post(`/api/v1/admin/places/${placeId}/gallery`)
      .header('Authorization', auth)
      .file('files', Buffer.from('not an image'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
    invalid.assertStatus(422)
    assert.equal(invalid.body().error.code, 'INVALID_IMAGE')

    await db.table('place_images').insert(
      Array.from({ length: 19 }, (_, index) => ({
        place_id: placeId,
        storage_key: `${randomUUID()}.webp`,
        alt_en: 'Filler',
        sort_order: 10 + index,
        created_at: new Date(),
      }))
    )
    const keysBefore = await allImageKeys()
    const full = await client
      .post(`/api/v1/admin/places/${placeId}/gallery`)
      .header('Authorization', auth)
      .file('files', await png(), { filename: 'extra.png', contentType: 'image/png' })
    full.assertStatus(422)
    assert.equal(full.body().error.code, 'GALLERY_FULL')
    assert.deepEqual([...(await allImageKeys())].sort(), [...keysBefore].sort())

    const unmanaged = await client.get('/api/v1/images/not-a-key.txt')
    unmanaged.assertStatus(404)
    const removedRoutes = await client.get('/api/v1/admin/media').header('Authorization', auth)
    removedRoutes.assertStatus(404)

    const deleted = await client
      .delete(`/api/v1/admin/places/${placeId}`)
      .header('Authorization', auth)
    deleted.assertStatus(204)
    assert.isFalse(await drive.use('local').exists(keyOf(first.url)))
  })

  test('admin API uploads hero and logo images', async ({ client, assert }) => {
    const token = await signIn()
    const auth = `Bearer ${token}`
    const hero = await client
      .put('/api/v1/admin/home/hero-image?locale=en')
      .header('Authorization', auth)
      .file('file', await png(), { filename: 'hero.png', contentType: 'image/png' })
    hero.assertStatus(200)
    const heroKey = keyOf(hero.body().data.hero_image_url)
    const home = await client.get('/api/v1/home')
    assert.equal(home.body().data.hero.image, `/api/v1/images/${heroKey}`)

    const logo = await client
      .put('/api/v1/admin/settings/logo')
      .header('Authorization', auth)
      .file('file', await png('gold'), { filename: 'logo.png', contentType: 'image/png' })
    logo.assertStatus(200)
    const settings = await client
      .patch('/api/v1/admin/settings')
      .header('Authorization', auth)
      .json({ brandName: 'Renamed brand' })
    settings.assertStatus(200)
    assert.equal(settings.body().data.brand_name, 'Renamed brand')
    assert.equal(settings.body().data.logo_image_url, logo.body().data.logo_image_url)
    const site = await client.get('/api/v2/site')
    site.assertStatus(200)
    const logoKey = keyOf(logo.body().data.logo_image_url)
    assert.equal(site.body().data.logo_image_key, logoKey)
    assert.deepEqual(site.body().meta.images, [
      { storage_key: logoKey, url: `/api/v1/images/${logoKey}` },
    ])
    assert.notProperty(site.body().data, 'logo_image_url')

    const removedHero = await client
      .delete('/api/v1/admin/home/hero-image?locale=en')
      .header('Authorization', auth)
    removedHero.assertStatus(204)
    assert.isFalse(await drive.use('local').exists(heroKey))
    const missingFile = await client
      .put('/api/v1/admin/settings/logo')
      .header('Authorization', auth)
      .field('note', 'no file')
    missingFile.assertStatus(422)
  })
})
