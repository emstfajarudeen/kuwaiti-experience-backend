import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { loginAdmin } from '../../app/services/auth_service.js'

function initialPage(response: { text(): string }) {
  const match = response
    .text()
    .match(/<script data-page="[^"]+" type="application\/json">([^<]+)<\/script>/)
  if (!match) throw new Error('Expected an Inertia page object in the initial HTML response')
  return JSON.parse(match[1]) as {
    component: string
    version: string
    props: Record<string, unknown>
  }
}

test.group('CMS React save success', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('requires admin access and only allows the three existing destinations', async ({
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
      const response = await client.get(`/admin/${resource}/saved`).cookie('admin_access', access)
      response.assertStatus(200)
      const page = initialPage(response)
      assert.equal(page.component, 'save_success/show')
      assert.deepEqual(page.props.destination, destination)
      assert.equal(page.props.adminName, 'Saved Admin')
      assert.isString(page.props.csrfToken)
      assert.notInclude(JSON.stringify(page.props), access)
    }

    const unknown = await client
      .get('/admin/unknown/saved')
      .cookie('admin_access', access)
      .redirects(0)
    unknown.assertStatus(302)
    assert.equal(unknown.header('location'), '/admin')
  })
})
