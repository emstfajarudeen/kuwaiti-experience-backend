import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import env from '#start/env'
import Tokens from 'csrf'
import { appConfigDefaults } from '#services/app_config_service'
import { loginAdmin } from '../helpers/admin_auth.js'

function cmsPost(client: ApiClient, token: string, fields: Record<string, unknown>) {
  const tokens = new Tokens()
  const secret = tokens.secretSync()
  return client
    .post('/admin/app-config')
    .cookie('admin_access', token)
    .withSession({ 'csrf-secret': secret })
    .json({ ...fields, _csrf: tokens.create(secret) })
    .redirects(0)
}

test.group('App configuration', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns public defaults and localized settings independently for QA and live', async ({
    client,
    assert,
  }) => {
    const previous = env.get('APP_CONFIG_ENVIRONMENT')
    try {
      env.set('APP_CONFIG_ENVIRONMENT', 'qa')
      await db.from('app_config').whereIn('environment', ['qa', 'live']).delete()
      const defaults = await client.get('/api/v2/config').header('Accept-Language', 'en')
      defaults.assertStatus(200)
      assert.equal(defaults.body().data.environment, 'qa')
      assert.equal(defaults.body().data.update.title, appConfigDefaults.update_title_en)
      assert.isNull(defaults.body().data.update.ios.version)
      assert.isFalse(defaults.body().data.update.android.force)
      assert.equal(defaults.header('cache-control'), 'no-store')

      await db.table('app_config').insert([
        {
          ...appConfigDefaults,
          environment: 'qa',
          ios_version: '2.1.0',
          ios_force: true,
          ios_store_url: 'https://apps.example.com/ios',
          android_version: '1.4.0',
          update_title_ar: 'عنوان التحديث',
          update_message_ar: null,
          maintenance_enabled: true,
        },
        { ...appConfigDefaults, environment: 'live', ios_version: '1.0.0' },
      ])
      const arabic = await client.get('/api/v2/config').header('Accept-Language', 'ar')
      arabic.assertStatus(200)
      assert.equal(arabic.body().data.update.title, 'عنوان التحديث')
      assert.equal(arabic.body().data.update.message, appConfigDefaults.update_message_en)
      assert.deepEqual(arabic.body().data.update.ios, {
        version: '2.1.0',
        force: true,
        store_url: 'https://apps.example.com/ios',
      })
      assert.equal(arabic.body().data.update.android.version, '1.4.0')
      assert.isTrue(arabic.body().data.maintenance.enabled)
      assert.notInclude(JSON.stringify(arabic.body().data), 'title_ar')

      env.set('APP_CONFIG_ENVIRONMENT', 'live')
      const live = await client.get('/api/v2/config')
      live.assertStatus(200)
      assert.equal(live.body().data.environment, 'live')
      assert.equal(live.body().data.update.ios.version, '1.0.0')
      assert.isFalse(live.body().data.maintenance.enabled)
    } finally {
      env.set('APP_CONFIG_ENVIRONMENT', previous)
      if (previous === undefined) delete process.env.APP_CONFIG_ENVIRONMENT
    }
  })

  test('requires an administrator and saves only valid configuration', async ({
    client,
    assert,
  }) => {
    const previous = env.get('APP_CONFIG_ENVIRONMENT')
    try {
      env.set('APP_CONFIG_ENVIRONMENT', 'qa')
      await db.from('app_config').where('environment', 'qa').delete()
      const guest = await client.get('/admin/app-config').redirects(0)
      guest.assertStatus(302)

      await db.table('users').insert({
        full_name: 'Config Admin',
        email: 'config-admin@example.com',
        password: await hash.make('a-very-long-test-password'),
        role: 'admin',
        active: true,
        created_at: new Date(),
      })
      const login = await loginAdmin('config-admin@example.com', 'a-very-long-test-password')
      const page = await client.get('/admin/app-config').cookie('admin_access', login.accessToken)
      page.assertStatus(200)

      const invalid = await cmsPost(client, login.accessToken, {
        ...appConfigDefaults,
        ios_force: true,
        ios_version: '2.0.0',
      })
      invalid.assertStatus(302)
      assert.isNull(await db.from('app_config').where('environment', 'qa').first())

      const saved = await cmsPost(client, login.accessToken, {
        ...appConfigDefaults,
        ios_force: true,
        ios_version: '2.0.0',
        ios_store_url: 'https://apps.example.com/ios',
        android_version: '1.2.0',
        update_title_ar: '',
        maintenance_enabled: true,
      })
      saved.assertStatus(302)
      const row = await db.from('app_config').where('environment', 'qa').first()
      assert.equal(row.ios_version, '2.0.0')
      assert.isNull(row.update_title_ar)
      assert.equal(Number(row.maintenance_enabled), 1)
      const response = await client.get('/api/v2/config').header('Accept-Language', 'ar')
      response.assertStatus(200)
      assert.equal(response.body().data.update.title, appConfigDefaults.update_title_en)
      assert.isTrue(response.body().data.maintenance.enabled)
    } finally {
      env.set('APP_CONFIG_ENVIRONMENT', previous)
      if (previous === undefined) delete process.env.APP_CONFIG_ENVIRONMENT
    }
  })
})
