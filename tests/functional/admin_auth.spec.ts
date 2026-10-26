import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import jwt from 'jsonwebtoken'
import env from '#start/env'
import { authenticateAdmin, loginAdmin } from '../../app/services/auth_service.js'

test.group('Admin JWT authentication', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('login, bearer access, logout and revocation', async ({ client, assert }) => {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'test@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const login = await client.post('/api/v1/admin/auth/login').json({
      email: 'test@example.com',
      password: 'a-very-long-test-password',
    })
    login.assertStatus(200)
    const token = login.body().data.accessToken as string
    assert.isString(token)
    const me = await client.get('/api/v1/admin/auth/me').header('Authorization', `Bearer ${token}`)
    me.assertStatus(200)
    assert.equal(me.body().data.email, 'test@example.com')

    const logout = await client
      .post('/api/v1/admin/auth/logout')
      .header('Authorization', `Bearer ${token}`)
    logout.assertStatus(204)
    const denied = await client
      .get('/api/v1/admin/auth/me')
      .header('Authorization', `Bearer ${token}`)
    denied.assertStatus(401)
  })

  test('rotates refresh tokens and revokes the session on reuse', async ({ client }) => {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'test@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const login = await client.post('/api/v1/admin/auth/login').json({
      email: 'test@example.com',
      password: 'a-very-long-test-password',
    })
    login.assertStatus(200)
    const oldRefresh = login.body().data.refreshToken as string
    const rotated = await client
      .post('/api/v1/admin/auth/refresh')
      .json({ refreshToken: oldRefresh })
    rotated.assertStatus(200)
    const reused = await client
      .post('/api/v1/admin/auth/refresh')
      .json({ refreshToken: oldRefresh })
    reused.assertStatus(401)
    const denied = await client
      .get('/api/v1/admin/auth/me')
      .header('Authorization', `Bearer ${rotated.body().data.accessToken}`)
    denied.assertStatus(401)
  })

  test('renews an expired CMS access cookie while opening the editor', async ({
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
    await db
      .table('category_types')
      .insert({ code: 'attraction', name_en: 'Attractions', sort_order: 0 })
      .onConflict('code')
      .ignore()
    const tokens = await loginAdmin('test@example.com', 'a-very-long-test-password')
    const payload = jwt.decode(tokens.accessToken) as jwt.JwtPayload
    const expiredAccess = jwt.sign({ sid: payload.sid }, env.get('JWT_SECRET').release(), {
      algorithm: 'HS256',
      subject: payload.sub,
      issuer: env.get('JWT_ISSUER'),
      audience: env.get('JWT_AUDIENCE'),
      expiresIn: -1,
    })

    const editor = await client
      .get('/admin/places/new')
      .cookie('admin_access', expiredAccess)
      .cookie('admin_refresh', tokens.refreshToken)
    editor.assertStatus(200)
    assert.equal(
      JSON.parse(
        editor
          .text()
          .match(/<script data-page="[^"]+" type="application\/json">([^<]+)<\/script>/)![1]
      ).component,
      'places/edit'
    )
    assert.isString(editor.cookie('admin_access')?.value)
    assert.isString(editor.cookie('admin_refresh')?.value)
    await authenticateAdmin(editor.cookie('admin_access')!.value)
  })

  test('saves a place after the short lived CMS access cookie disappears', async ({
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
    await db
      .table('category_types')
      .insert({ code: 'attraction', name_en: 'Attractions', sort_order: 0 })
      .onConflict('code')
      .ignore()
    const tokens = await loginAdmin('test@example.com', 'a-very-long-test-password')
    const result = await client
      .post('/admin/places')
      .cookie('admin_refresh', tokens.refreshToken)
      .withCsrfToken()
      .redirects(0)
      .form({
        type: 'attraction',
        slug: 'long-form-place',
        titleEn: 'Long form place',
        summaryEn: 'Details typed over a long editing session',
        addressEn: 'Kuwait',
        intent: 'save',
      })
    result.assertStatus(302)
    assert.equal(result.header('location'), '/admin/places/saved')
    const renewedAccess = result.cookie('admin_access')?.value
    assert.isString(renewedAccess)
    assert.isNotNull(await db.from('places').where('slug', 'long-form-place').first())
    const saved = await client.get('/admin/places/saved').cookie('admin_access', renewedAccess!)
    saved.assertStatus(200)
    saved.assertTextIncludes('data-page="app"')
  })
})
