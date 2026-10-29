import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { loginAdmin } from '../helpers/admin_auth.js'

test.group('CMS React save success', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('requires admin access and redirects old saved URLs directly to their lists', async ({
    client,
    assert,
  }) => {
    const denied = await client.get('/admin/places/saved').redirects(0)
    denied.assertStatus(302)
    assert.equal(denied.header('location'), '/admin/login')

    await db.table('users').insert({
      full_name: 'Saved Admin',
      email: 'saved@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const login = await loginAdmin('saved@example.com', 'a-very-long-test-password')
    const access = login.accessToken

    const destinations = {
      'places': { path: '/admin/places', label: 'places', active: 'places' },
      'categories': { path: '/admin/categories', label: 'categories', active: 'categories' },
      'category-types': {
        path: '/admin/category-types',
        label: 'category types',
        active: 'category-types',
      },
    }
    for (const [resource, destination] of Object.entries(destinations)) {
      const response = await client
        .get(`/admin/${resource}/saved`)
        .cookie('admin_access', access)
        .redirects(0)
      response.assertStatus(302)
      assert.equal(response.header('location'), destination.path)
    }

    const unknown = await client
      .get('/admin/unknown/saved')
      .cookie('admin_access', access)
      .redirects(0)
    unknown.assertStatus(404)
  })
})
