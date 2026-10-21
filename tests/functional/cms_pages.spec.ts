import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import Tokens from 'csrf'
import { loginAdmin } from '../../app/services/auth_service.js'

function cmsPost(
  client: ApiClient,
  path: string,
  token: string,
  fields: Record<string, string> = {}
) {
  const tokens = new Tokens()
  const secret = tokens.secretSync()
  return client
    .post(path)
    .cookie('admin_access', token)
    .withSession({ 'csrf-secret': secret })
    .form({ ...fields, _csrf: tokens.create(secret) })
}

test.group('CMS pages', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('renders every CMS section for an admin', async ({ client }) => {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'admin@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    await db
      .table('category_types')
      .insert({
        code: 'attraction',
        name_en: 'Attractions',
        sort_order: 0,
      })
      .onConflict('code')
      .merge()
    const [categoryId] = await db.table('categories').insert({
      type: 'attraction',
      slug: 'landmarks',
      sort_order: 0,
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    })
    await db.table('category_translations').insert({
      category_id: categoryId,
      locale: 'en',
      name: 'Landmarks',
    })
    const login = await loginAdmin('admin@example.com', 'a-very-long-test-password')
    const token = login.accessToken
    const pages = [
      '/admin',
      '/admin/places',
      '/admin/places/new',
      '/admin/categories',
      '/admin/categories/new',
      `/admin/categories/${categoryId}/edit`,
      '/admin/category-types',
      '/admin/category-types/new',
      '/admin/category-types/attraction/edit',
      '/admin/pages',
      '/admin/pages/new',
      '/admin/home',
      '/admin/transport',
      '/admin/settings',
      '/admin/account',
    ]
    for (const path of pages) {
      const response = await client.get(path).cookie('admin_access', token)
      response.assertStatus(200)
    }
    const editor = await client.get('/admin/places/new').cookie('admin_access', token)
    editor.assertTextIncludes('name="coverImage"')
    editor.assertTextIncludes('name="galleryImages[]"')
    editor.assertTextIncludes('enctype="multipart/form-data"')
    const pageEditor = await client.get('/admin/pages/new').cookie('admin_access', token)
    pageEditor.assertTextIncludes('name="eyebrowEn"')
    pageEditor.assertTextIncludes('name="bodyFormatEn"')
    pageEditor.assertTextIncludes('data-rich-body')
    const library = await client.get('/admin/media').cookie('admin_access', token)
    library.assertStatus(404)
    const missingCategory = await client
      .get('/admin/categories/not-a-category/edit')
      .cookie('admin_access', token)
    missingCategory.assertStatus(200)
    missingCategory.assertTextIncludes('Categories')
    const missingCategoryType = await client
      .get('/admin/category-types/not-a-category-type/edit')
      .cookie('admin_access', token)
    missingCategoryType.assertStatus(200)
    missingCategoryType.assertTextIncludes('Category types')
  })

  test('does not create content without a CSRF token', async ({ client, assert }) => {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'admin@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const login = await loginAdmin('admin@example.com', 'a-very-long-test-password')
    const token = login.accessToken
    const response = await client.post('/admin/places').cookie('admin_access', token).form({
      type: 'attraction',
      slug: 'csrf-test',
      titleEn: 'CSRF Test',
      summaryEn: 'A test',
      addressEn: 'Kuwait',
    })
    response.assertStatus(200) // The browser client follows the CSRF failure redirect to login.
    assert.isNull(await db.from('places').where('slug', 'csrf-test').first())
  })

  test('CMS Quill form saves localized rich page fields and publishes immediately', async ({
    client,
    assert,
  }) => {
    await db.table('users').insert({
      full_name: 'Page Admin',
      email: 'page-admin@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const login = await loginAdmin('page-admin@example.com', 'a-very-long-test-password')
    const token = login.accessToken
    const saved = await cmsPost(client, '/admin/pages', token, {
      slug: 'about-us',
      titleEn: 'About The Kuwaiti Experience',
      eyebrowEn: 'ABOUT THE KUWAITI EXPERIENCE',
      bodyEn: '<h2>Our story</h2><p onclick="evil()">Welcome to Kuwait.</p>',
      bodyFormatEn: 'html',
    })
    saved.assertStatus(200)
    const page = await db.from('pages').where('slug', 'about-us').first()
    assert.equal(page.status, 'draft')
    const translation = await db
      .from('page_translations')
      .where('page_id', page.id)
      .where('locale', 'en')
      .first()
    assert.equal(translation.eyebrow, 'ABOUT THE KUWAITI EXPERIENCE')
    assert.equal(translation.body_format, 'html')
    assert.equal(translation.body, '<h2>Our story</h2><p>Welcome to Kuwait.</p>')
    const published = await cmsPost(client, `/admin/pages/${page.id}/publish`, token)
    published.assertStatus(200)
    const publicPage = await client.get('/api/v2/pages/about-us')
    publicPage.assertStatus(200)
    assert.equal(publicPage.body().data.page_translations[0].eyebrow, translation.eyebrow)
  })
})
