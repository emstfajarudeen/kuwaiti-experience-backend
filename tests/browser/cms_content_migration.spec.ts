import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import sharp from 'sharp'

async function admin() {
  await db.table('users').insert({
    full_name: 'Content Browser Admin',
    email: 'content-browser@example.com',
    password: await hash.make('a-very-long-test-password'),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
}

test.group('CMS migrated content browser', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('creates, filters, edits and deletes a category through the React forms', async ({
    visit,
    assert,
  }) => {
    await admin()
    await db
      .table('category_types')
      .insert({ code: 'attraction', name_en: 'Attractions', sort_order: 0 })
      .onConflict('code')
      .ignore()
    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill('content-browser@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.goto(new URL('/admin/categories/new', page.url()).toString())
    await page.getByLabel('English name').fill('Browser Landmarks')
    await page.getByLabel('Arabic name').fill('معالم')
    await page.getByLabel('URL slug').fill('browser-landmarks')
    await page.getByRole('button', { name: 'Save category' }).click()
    await page.waitForURL('**/admin/categories')
    await page.getByText('Browser Landmarks').waitFor({ state: 'visible' })
    await page.getByLabel('Category type:').selectOption('attraction')
    await page.waitForURL('**/admin/categories?type=attraction')
    const row = page.locator('tbody tr').filter({ hasText: 'Browser Landmarks' })
    await row.getByRole('link', { name: 'Edit Browser Landmarks' }).click()
    await page.getByLabel('English name').fill('Browser Sights')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForURL('**/admin/categories')
    await page.getByText('Browser Sights').waitFor({ state: 'visible' })
    const saved = await db.from('categories').where('slug', 'browser-landmarks').first()
    assert.isTrue(Boolean(saved))
    await page.getByRole('button', { name: 'More actions for Browser Sights' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    assert.equal(await page.getByText('Browser Sights').count(), 1)
    await page.getByRole('button', { name: 'More actions for Browser Sights' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await page.getByText('Browser Sights').waitFor({ state: 'hidden' })
    assert.isNull(await db.from('categories').where('id', saved.id).first())
  })

  test('edits a category type and saves a formatted bilingual page', async ({ visit, assert }) => {
    await admin()
    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill('content-browser@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.goto(new URL('/admin/category-types/new', page.url()).toString())
    await page.getByLabel('Code').fill('browser_type')
    await page.getByLabel('English name').fill('Browser Type')
    await page.getByRole('button', { name: 'Save category type' }).click()
    await page.waitForURL('**/admin/category-types')
    await page.getByRole('link', { name: 'Edit Browser Type' }).click()
    await page.getByLabel('Arabic name').fill('نوع المتصفح')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForURL('**/admin/category-types')
    const savedType = await db.from('category_types').where('code', 'browser_type').first()
    assert.equal(savedType.name_ar, 'نوع المتصفح')

    await page.goto(new URL('/admin/pages/new', page.url()).toString())
    await page.getByLabel('Page title').fill('Browser About')
    await page.getByLabel('URL slug').fill('browser-about')
    await page.locator('.rich-field').first().locator('.ql-editor').waitFor({ state: 'visible' })
    await page.locator('.rich-field').first().locator('.ql-editor').fill('Browser English content')
    await page.getByLabel('Arabic title').fill('عن المتصفح')
    await page.locator('.rich-field').nth(1).locator('.ql-editor').fill('محتوى عربي')
    await page.getByRole('button', { name: 'Save page' }).click()
    await page.waitForURL(/\/admin\/pages\/\d+\/edit/)
    const record = await db.from('pages').where('slug', 'browser-about').first()
    assert.isTrue(Boolean(record))
    const translations = await db
      .from('page_translations')
      .where('page_id', record.id)
      .orderBy('locale')
    assert.equal(translations.length, 2)
    assert.isTrue(translations.every((translation) => translation.body_format === 'html'))
    await page.getByRole('button', { name: 'Publish page' }).click()
    await page
      .locator('.ant-notification-notice')
      .filter({ hasText: 'Page published.' })
      .waitFor({ state: 'visible' })
    const publishedPage = await db.from('pages').where('id', record.id).first()
    assert.equal(publishedPage.status, 'published')
  })

  test('saves a place with FilePond images and structured Explore hours', async ({
    visit,
    assert,
  }) => {
    await admin()
    await db
      .table('category_types')
      .insert({ code: 'attraction', name_en: 'Attractions', sort_order: 0 })
      .onConflict('code')
      .ignore()
    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill('content-browser@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.goto(new URL('/admin/places/new', page.url()).toString())
    await page.getByLabel('Place type').selectOption('attraction')
    await page.getByLabel('English title').fill('Browser Towers')
    await page.getByLabel('URL slug').fill('browser-towers')
    await page.getByLabel('About this place').fill('A browser tested venue')
    await page.getByLabel('Address', { exact: true }).fill('Kuwait City')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.waitForURL('**/admin/places')
    const place = await db.from('places').where('slug', 'browser-towers').first()
    assert.isTrue(Boolean(place))
    await page.goto(new URL(`/admin/places/${place.id}/edit`, page.url()).toString())
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: 'navy' },
    })
      .png()
      .toBuffer()
    await page
      .locator('input[name="coverImage"]')
      .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: image })
    await page
      .locator('input[name="galleryImages[]"]')
      .setInputFiles({ name: 'gallery.png', mimeType: 'image/png', buffer: image })
    await page.getByLabel('Alt text for new images').fill('Browser image')
    await page.locator('.filepond--item').nth(1).waitFor({ state: 'attached' })
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForURL('**/admin/places')
    const savedPlace = await db.from('places').where('id', place.id).first()
    assert.isString(savedPlace.cover_image_key)
    const galleryImages = await db.from('place_images').where('place_id', place.id)
    assert.equal(galleryImages.length, 1)

    await page.goto(new URL(`/admin/places/${place.id}/explore`, page.url()).toString())
    const sunday = page.locator('[data-weekday="0"]')
    await sunday.getByRole('button', { name: 'Open', exact: true }).click()
    await sunday.getByRole('button', { name: '+ Add split interval for Sunday' }).click()
    await sunday.locator('input[name$="[opens_at]"]').nth(1).fill('23:00')
    await sunday.locator('input[name$="[closes_at]"]').nth(1).fill('01:00')
    await sunday.getByLabel('Closes next day (overnight)').nth(1).check()
    const monday = page.locator('[data-weekday="1"]')
    await monday.getByRole('button', { name: 'Closed', exact: true }).click()
    await page.getByRole('button', { name: 'Save Explore details' }).click()
    await page
      .locator('.ant-notification-notice')
      .filter({ hasText: 'Changes saved.' })
      .waitFor({ state: 'visible' })
    const hours = await db
      .from('place_hours')
      .where('place_id', place.id)
      .orderBy('weekday')
      .orderBy('interval_index')
    assert.equal(hours.length, 3)
    assert.equal(hours[1].closes_next_day, 1)
    assert.equal(hours[2].closed, 1)
  })

  test('manages movie and theater showtime forms', async ({ visit, assert }) => {
    await admin()
    await db
      .table('category_types')
      .insert({ code: 'theater', name_en: 'Theaters', sort_order: 0 })
      .onConflict('code')
      .ignore()
    const [theaterId] = await db.table('places').insert({
      type: 'theater',
      slug: 'browser-cinema',
      status: 'published',
      created_at: new Date(),
      updated_at: new Date(),
      published_at: new Date(),
    })
    await db.table('place_translations').insert({
      place_id: theaterId,
      locale: 'en',
      title: 'Browser Cinema',
      summary: 'Cinema',
      address: 'Kuwait City',
    })
    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill('content-browser@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.goto(new URL('/admin/movies/new', page.url()).toString())
    await page.getByLabel('English title').fill('Browser Film')
    await page.getByLabel('Duration (minutes)').fill('120')
    await page.getByRole('button', { name: 'Save movie' }).click()
    await page.waitForURL('**/admin/movies')
    const movie = await db.from('movies').where('title_en', 'Browser Film').first()
    assert.isTrue(Boolean(movie))
    await page.getByRole('link', { name: 'Edit Browser Film' }).click()
    await page.getByLabel('Arabic title').fill('فيلم المتصفح')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page
      .locator('.ant-notification-notice')
      .filter({ hasText: 'Changes saved.' })
      .waitFor({ state: 'visible' })
    const translatedMovie = await db.from('movies').where('id', movie.id).first()
    assert.equal(translatedMovie.title_ar, 'فيلم المتصفح')

    await page.goto(new URL('/admin/showtimes', page.url()).toString())
    await page.getByLabel('Theater venue').click()
    await page.getByText('browser-cinema (published)', { exact: true }).click()
    await page.getByLabel('Movie').click()
    await page.getByText('Browser Film (draft)', { exact: true }).click()
    await page.getByLabel('Starts at (Kuwait time)').fill('2030-05-20T18:30')
    await page.getByLabel('Presentation format').fill('Standard')
    await page.getByRole('button', { name: 'Save showtime' }).click()
    await page
      .locator('.ant-notification-notice')
      .filter({ hasText: 'Changes saved.' })
      .waitFor({ state: 'visible' })
    const showtime = await db
      .from('theater_showtimes')
      .where('place_id', theaterId)
      .where('movie_id', movie.id)
      .first()
    assert.isTrue(Boolean(showtime))
    await page.getByRole('link', { name: 'Edit showtime' }).click()
    await page.getByLabel('Presentation format').fill('IMAX')
    await page.getByRole('button', { name: 'Update showtime' }).click()
    await page
      .locator('.ant-notification-notice')
      .filter({ hasText: 'Changes saved.' })
      .waitFor({ state: 'visible' })
    const updatedShowtime = await db.from('theater_showtimes').where('id', showtime.id).first()
    assert.equal(updatedShowtime.format, 'IMAX')
  })

  test('updates homepage and site settings', async ({ visit, assert }) => {
    await admin()
    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill('content-browser@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.goto(new URL('/admin/home', page.url()).toString())
    await page.getByLabel('Hero headline').fill('Browser Kuwait')
    await page.getByRole('button', { name: 'Save homepage' }).click()
    await page
      .locator('.ant-notification-notice')
      .filter({ hasText: 'Homepage content saved.' })
      .waitFor({ state: 'visible' })
    const homeContent = await db.from('home_content').where('locale', 'en').first()
    assert.equal(homeContent.hero_title, 'Browser Kuwait')
    await page.goto(new URL('/admin/settings', page.url()).toString())
    await page.getByLabel('Contact email').fill('browser@example.com')
    await page.getByRole('button', { name: 'Save settings' }).click()
    await page
      .locator('.ant-notification-notice')
      .filter({ hasText: 'Site settings saved.' })
      .waitFor({ state: 'visible' })
    const settings = await db.from('site_settings').where('id', 1).first()
    assert.equal(settings.brand_name, 'Browser Brand')
    assert.equal(settings.contact_email, 'browser@example.com')
  })
})
