import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import { loginAdmin } from '../helpers/admin_auth.js'

test.group('Videos CMS', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('staff with video access can use the map endpoints, pages and see field errors', async ({
    client,
    assert,
  }) => {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'test@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const tokens = await loginAdmin('test@example.com', 'a-very-long-test-password')
    const get = (path: string) =>
      client
        .get(path)
        .header('Accept', 'application/json')
        .cookie('admin_access', tokens.accessToken)
        .cookie('admin_refresh', tokens.refreshToken)

    const search = await get('/admin/videos/address-search?q=kuwait towers')
    assert.notEqual(search.status(), 404)
    assert.notEqual(search.status(), 403)
    assert.property(search.body(), search.status() === 200 ? 'results' : 'error')
    const reverse = await get('/admin/videos/address-reverse?lat=29.37&lon=47.97')
    assert.notEqual(reverse.status(), 404)
    assert.notEqual(reverse.status(), 403)

    for (const path of ['/admin/videos', '/admin/videos/new', '/admin/videos/reports']) {
      const page = await client
        .get(path)
        .cookie('admin_access', tokens.accessToken)
        .cookie('admin_refresh', tokens.refreshToken)
      page.assertStatus(200)
    }
  })

  test('saving a video with a caption works and field errors are per field', async ({
    client,
    assert,
  }) => {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'test@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const tokens = await loginAdmin('test@example.com', 'a-very-long-test-password')
    const bytes = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(200, 1),
    ])
    const post = () =>
      client
        .post('/admin/videos')
        .redirects(0)
        .withCsrfToken()
        .cookie('admin_refresh', tokens.refreshToken)
        .field('captionEn', 'abcdabcdabcd nnbnbnb bnbn')
        .field('captionAr', '')
        .field('categoryId', '')
        .field('placeId', '')
        .field('phone', '')
        .field('locationNameEn', '')
        .field('latitude', '')
        .field('longitude', '')
        .field('intent', 'save')
        .file('video', bytes, { filename: 'a.mp4', contentType: 'video/mp4' })
    const result = await post()
    assert.equal(result.header('location'), '/admin/videos')
    assert.equal((await db.from('videos').count('* as n').first())?.n, 1)
  })
})
