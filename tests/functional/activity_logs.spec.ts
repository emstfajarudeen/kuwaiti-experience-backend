import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { loginAdmin } from '../helpers/admin_auth.js'

const email = 'audit-admin@example.com'
const password = 'a-very-long-test-password'

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

async function createAdmin() {
  await db.table('users').insert({
    full_name: 'Audit Admin',
    email,
    password: await hash.make(password),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  const login = await loginAdmin(email, password)
  return login.accessToken
}

test.group('CMS Activity Logs', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('requires admin access and renders activity logs page', async ({ client, assert }) => {
    const unauth = await client.get('/admin/activity-logs').redirects(0)
    unauth.assertStatus(302)
    assert.equal(unauth.header('location'), '/admin/login')

    const access = await createAdmin()
    const page = await client.get('/admin/activity-logs').cookie('admin_access', access)
    page.assertStatus(200)

    const initial = initialPage(page)
    assert.equal(initial.component, 'activity_logs/index')
    assert.equal(initial.props.adminName, 'Audit Admin')
    assert.isString(initial.props.csrfToken)
    assert.isArray(initial.props.logs)
    const meta = initial.props.meta as { page: number; total: number }
    assert.equal(meta.page, 1)
    assert.isNumber(meta.total)
  })
})
