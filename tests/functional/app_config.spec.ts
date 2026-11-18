import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import env from '#start/env'
import Tokens from 'csrf'
import { appConfigDefaults, matchBaseUrlRule } from '#services/app_config_service'
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

  test('matches the most specific version rule', ({ assert }) => {
    const rules = [
      { platform: 'ios' as const, version: '1.1', api_base_url: 'https://minor.example.com' },
      { platform: 'ios' as const, version: '1.1.2', api_base_url: 'https://exact.example.com' },
      { platform: 'android' as const, version: '1.1', api_base_url: 'https://droid.example.com' },
    ]
    const pick = (platform: unknown, version: unknown) =>
      matchBaseUrlRule(rules, platform, version)?.api_base_url ?? null
    assert.equal(pick('ios', '1.1.0'), 'https://minor.example.com')
    assert.equal(pick('ios', '1.1'), 'https://minor.example.com')
    assert.equal(pick('ios', '1.1.7'), 'https://minor.example.com')
    assert.equal(pick('ios', '1.1.2'), 'https://exact.example.com')
    assert.equal(pick('android', '1.1.2'), 'https://droid.example.com')
    assert.isNull(pick('ios', '1.10.0'))
    assert.isNull(pick('ios', '1.2.0'))
    assert.isNull(pick('ios', undefined))
    assert.isNull(pick('web', '1.1.0'))
    assert.isNull(pick('ios', '1.1.0-beta'))
  })

  test('staff send one app version to another server', async ({ client, assert }) => {
    const previous = env.get('APP_CONFIG_ENVIRONMENT')
    try {
      env.set('APP_CONFIG_ENVIRONMENT', 'qa')
      await db.from('app_config').where('environment', 'qa').delete()
      await db.from('app_base_url_rules').where('environment', 'qa').delete()
      await db.table('users').insert({
        full_name: 'Rules Admin',
        email: 'rules-admin@example.com',
        password: await hash.make('a-very-long-test-password'),
        role: 'admin',
        active: true,
        created_at: new Date(),
      })
      const login = await loginAdmin('rules-admin@example.com', 'a-very-long-test-password')
      const normal = await client.get('/api/v2/config')
      const defaultUrl = normal.body().data.api_base_url

      const duplicate = await cmsPost(client, login.accessToken, {
        ...appConfigDefaults,
        base_url_rules: [
          { platform: 'ios', version: '1.1', api_base_url: 'https://a.example.com' },
          { platform: 'ios', version: '1.1', api_base_url: 'https://b.example.com' },
        ],
      })
      duplicate.assertStatus(302)
      assert.isNull(await db.from('app_base_url_rules').first())

      const saved = await cmsPost(client, login.accessToken, {
        ...appConfigDefaults,
        base_url_rules: [
          {
            platform: 'ios',
            version: '1.1',
            api_base_url: 'https://review.example.com/api/v2',
            image_base_url: '',
            note: 'App Store review build',
          },
        ],
      })
      saved.assertStatus(302)
      const rows = await db.from('app_base_url_rules').where('environment', 'qa')
      assert.lengthOf(rows, 1)
      assert.equal(rows[0].api_base_url, 'https://review.example.com')
      assert.isNull(rows[0].image_base_url)

      const ios11 = await client.get('/api/v2/config').qs({ platform: 'ios', version: '1.1.0' })
      ios11.assertStatus(200)
      assert.equal(ios11.body().data.api_base_url, 'https://review.example.com')
      assert.equal(ios11.body().data.image_base_url, 'https://review.example.com')
      assert.deepEqual(ios11.body().data.base_url_rule, { platform: 'ios', version: '1.1' })

      for (const query of [
        {},
        { platform: 'ios', version: '1.2.0' },
        { platform: 'android', version: '1.1.0' },
      ]) {
        const other = await client.get('/api/v2/config').qs(query)
        assert.equal(other.body().data.api_base_url, defaultUrl)
        assert.isNull(other.body().data.base_url_rule)
      }

      const cleared = await cmsPost(client, login.accessToken, {
        ...appConfigDefaults,
        base_url_rules: [],
      })
      cleared.assertStatus(302)
      assert.isNull(await db.from('app_base_url_rules').first())
    } finally {
      env.set('APP_CONFIG_ENVIRONMENT', previous)
      if (previous === undefined) delete process.env.APP_CONFIG_ENVIRONMENT
    }
  })
})
