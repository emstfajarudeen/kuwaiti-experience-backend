import { test } from '@japa/runner'
import hash from '@adonisjs/core/services/hash'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { authenticateAdmin, loginAdmin } from '../helpers/admin_auth.js'

const password = 'a-very-long-test-password'

function initialPage(response: { text(): string }) {
  const match = response
    .text()
    .match(/<script data-page="[^"]+" type="application\/json">([^<]+)<\/script>/)
  if (!match) throw new Error('Expected an Inertia page object in the initial HTML response')
  return JSON.parse(match[1]) as { component: string; props: Record<string, unknown> }
}

async function createAdmin(name: string, email: string) {
  const ids = await db.table('users').insert({
    full_name: name,
    email,
    password: await hash.make(password),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  return Number(ids[0])
}

test.group('CMS user management', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('lists filtered users and creates an administrator', async ({ client, assert }) => {
    await createAdmin('Active Admin', 'active@example.com')
    const inactiveId = await createAdmin('Inactive Admin', 'inactive@example.com')
    await db.from('users').where('id', inactiveId).update({ active: false })
    const activeLogin = await loginAdmin('active@example.com', password)
    const access = activeLogin.accessToken
    const administrator = await db.from('roles').where('slug', 'administrator').firstOrFail()

    const filtered = await client
      .get('/admin/users?status=inactive&q=inactive')
      .cookie('admin_access', access)
    filtered.assertStatus(200)
    const page = initialPage(filtered)
    assert.equal(page.component, 'users/index')
    assert.equal((page.props.filters as { status: string }).status, 'inactive')
    assert.lengthOf(page.props.rows as unknown[], 1)

    const created = await client
      .post('/admin/users')
      .cookie('admin_access', access)
      .withCsrfToken()
      .redirects(0)
      .form({
        fullName: 'New CMS Admin',
        email: 'new-admin@example.com',
        password,
        roleIds: [String(administrator.id)],
      })
    created.assertStatus(302)
    assert.match(created.header('location') ?? '', /^\/admin\/users\/\d+\/edit$/)
    const user = await db.from('users').where('email', 'new-admin@example.com').first()
    assert.equal(user?.full_name, 'New CMS Admin')
    assert.equal(user?.active, 1)
  })

  test('prevents self-removal and revokes sessions when an administrator is deactivated', async ({
    client,
    assert,
  }) => {
    const ownerId = await createAdmin('Owner Admin', 'owner@example.com')
    const memberId = await createAdmin('Member Admin', 'member@example.com')
    const ownerLogin = await loginAdmin('owner@example.com', password)
    const memberLogin = await loginAdmin('member@example.com', password)
    const ownerAccess = ownerLogin.accessToken
    const memberAccess = memberLogin.accessToken
    const memberRoles = await db.from('user_roles').where('user_id', memberId).select('role_id')
    const roleIds = memberRoles.map((role) => String(role.role_id))

    const selfDelete = await client
      .post('/admin/users/' + ownerId + '/delete')
      .cookie('admin_access', ownerAccess)
      .withCsrfToken()
      .redirects(0)
      .form({})
    selfDelete.assertStatus(302)
    const owner = await db.from('users').where('id', ownerId).first()
    assert.equal(owner?.email, 'owner@example.com')

    const deactivate = await client
      .post('/admin/users/' + memberId + '/save')
      .cookie('admin_access', ownerAccess)
      .withCsrfToken()
      .redirects(0)
      .form({ fullName: 'Member Admin', email: 'member@example.com', active: '', roleIds })
    deactivate.assertStatus(302)
    const deactivatedMember = await db.from('users').where('id', memberId).first()
    assert.equal(deactivatedMember?.active, 0)
    await assert.rejects(() => authenticateAdmin(memberAccess))
  })
})
