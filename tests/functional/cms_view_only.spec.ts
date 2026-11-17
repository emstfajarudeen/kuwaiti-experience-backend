import { test } from '@japa/runner'
import hash from '@adonisjs/core/services/hash'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { loginAdmin } from '../helpers/admin_auth.js'
import { permissionOptions, updateRole } from '../../app/services/role_management_service.js'

const password = 'a-very-long-test-password'

async function staff(email: string) {
  const [id] = await db.table('users').insert({
    full_name: email,
    email,
    password: await hash.make(password),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  return Number(id)
}

/** Signs in a staff member who has only the default Viewer role. */
async function viewer() {
  await staff('owner@example.com')
  await loginAdmin('owner@example.com', password)
  const id = await staff('viewer@example.com')
  const role = await db.from('roles').where('slug', 'viewer').firstOrFail()
  await db.table('user_roles').insert({ user_id: id, role_id: role.id, created_at: new Date() })
  return loginAdmin('viewer@example.com', password)
}

test.group('CMS view-only access', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('view-only staff open edit pages read-only but cannot save', async ({ client, assert }) => {
    const tokens = await viewer()
    for (const path of [
      '/admin/places/1/edit',
      '/admin/categories/1/edit',
      '/admin/category-types/sights/edit',
      '/admin/countries/KW/edit',
      '/admin/pages/1/edit',
    ]) {
      const page = await client.get(path).cookie('admin_access', tokens.accessToken).redirects(0)
      assert.notEqual(page.status(), 403, path)
    }
    for (const path of [
      '/admin/places/1/save',
      '/admin/categories/1/save',
      '/admin/countries/KW/save',
    ]) {
      const saved = await client
        .post(path)
        .withCsrfToken()
        .cookie('admin_access', tokens.accessToken)
        .redirects(0)
      assert.equal(saved.status(), 403, path)
    }
  })

  test('the roles page leaves out permissions with no CMS screen, and saving keeps them', async ({
    assert,
  }) => {
    const options = await permissionOptions()
    const keys = options.map((option) => option.key)
    for (const hidden of ['movies.view', 'showtimes.view', 'pages.publish', 'pages.archive'])
      assert.notInclude(keys, hidden)
    assert.equal(
      options.find((option) => option.key === 'places.archive')?.label,
      'Turn places off (inactive)'
    )

    await staff('owner@example.com')
    await loginAdmin('owner@example.com', password)
    const owner = await db.from('users').where('email', 'owner@example.com').firstOrFail()
    const session = await db
      .from('auth_sessions')
      .where('user_id', owner.id)
      .orderBy('created_at', 'desc')
      .firstOrFail()
    const viewerRole = await db.from('roles').where('slug', 'viewer').firstOrFail()
    await updateRole({ id: owner.id, sessionId: String(session.id) }, viewerRole.id, {
      name: 'Viewer',
      permissionKeys: ['dashboard.view', 'places.view'],
    })
    const granted = await db
      .from('role_permissions as rp')
      .join('permissions as p', 'p.id', 'rp.permission_id')
      .where('rp.role_id', viewerRole.id)
      .select('p.key')
    const grantedKeys = granted.map((row) => row.key)
    assert.includeMembers(grantedKeys, ['dashboard.view', 'places.view', 'movies.view'])
    assert.notInclude(grantedKeys, 'categories.view')
  })
})
