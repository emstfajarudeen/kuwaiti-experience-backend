import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'

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
})
