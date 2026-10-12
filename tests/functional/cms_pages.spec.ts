import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import { loginAdmin } from '../../app/services/auth_service.js'

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
    await db.table('category_types').insert({
      code: 'attraction',
      name_en: 'Attractions',
      sort_order: 0,
    })
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
      '/admin/media',
      '/admin/home',
      '/admin/transport',
      '/admin/settings',
      '/admin/account',
    ]
    for (const path of pages) {
      const response = await client.get(path).cookie('admin_access', token)
      response.assertStatus(200)
    }
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
})
