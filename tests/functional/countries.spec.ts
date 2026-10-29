import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import Tokens from 'csrf'
import { loginAdmin } from '../helpers/admin_auth.js'

function cmsPost(client: ApiClient, path: string, token: string, fields: Record<string, string>) {
  const tokens = new Tokens()
  const secret = tokens.secretSync()
  return client
    .post(path)
    .cookie('admin_access', token)
    .withSession({ 'csrf-secret': secret })
    .redirects(0)
    .form({ ...fields, _csrf: tokens.create(secret) })
}

test.group('Country master', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('lists, creates, edits, filters status data, and deletes countries', async ({
    client,
    assert,
  }) => {
    await db.table('users').insert({
      full_name: 'Country Admin',
      email: 'countries@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const { accessToken } = await loginAdmin('countries@example.com', 'a-very-long-test-password')
    const list = await client.get('/admin/countries').cookie('admin_access', accessToken)
    list.assertStatus(200)
    const pageMatch = list
      .text()
      .match(/<script data-page="app" type="application\/json">([^<]+)<\/script>/)
    assert.isNotNull(pageMatch)
    assert.equal(JSON.parse(pageMatch![1]).component, 'countries/index')

    const created = await cmsPost(client, '/admin/countries', accessToken, {
      code: 'ae',
      nameEn: 'United Arab Emirates',
      nameAr: 'الإمارات العربية المتحدة',
      active: 'true',
      sortOrder: '2',
    })
    created.assertStatus(302)
    assert.equal(created.header('location'), '/admin/countries')
    const createdCountry = await db.from('countries').where('code', 'AE').first()
    assert.equal(createdCountry?.active, 1)

    const updated = await cmsPost(client, '/admin/countries/AE/save', accessToken, {
      nameEn: 'UAE',
      nameAr: '',
      active: 'false',
      sortOrder: '1',
    })
    updated.assertStatus(302)
    const country = await db.from('countries').where('code', 'AE').first()
    assert.equal(country?.name_en, 'UAE')
    assert.isFalse(Boolean(country?.active))

    const activated = await cmsPost(client, '/admin/countries/AE/status', accessToken, {
      active: 'true',
    })
    activated.assertStatus(302)
    const activatedCountry = await db.from('countries').where('code', 'AE').first()
    assert.isTrue(Boolean(activatedCountry?.active))
    assert.equal(activatedCountry?.name_en, 'UAE')

    await cmsPost(client, '/admin/countries/AE/status', accessToken, { active: 'invalid' })
    const unchangedCountry = await db.from('countries').where('code', 'AE').first()
    assert.isTrue(Boolean(unchangedCountry?.active))

    const deleted = await cmsPost(client, '/admin/countries/AE/delete', accessToken, {})
    deleted.assertStatus(302)
    const removedCountry = await db.from('countries').where('code', 'AE').first()
    assert.isNull(removedCountry)
    const auditRows = await db.from('audit_logs').where('entity_type', 'country')
    assert.equal(auditRows.length, 4)
  })
})
