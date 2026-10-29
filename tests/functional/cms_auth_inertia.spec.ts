import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { authenticateAdmin, loginAdmin, prepareAdminAuthorization } from '../helpers/admin_auth.js'

const email = 'cms-react-admin@example.com'
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
    full_name: 'CMS React Admin',
    email,
    password: await hash.make(password),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  await prepareAdminAuthorization(email)
}

test.group('CMS React authentication', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('login HTML and public assets provide CMS branding for link previews', async ({
    client,
    assert,
  }) => {
    const page = await client.get('/admin/login')
    page.assertStatus(200)
    const html = page.text()
    const socialImage = new URL('/cms-social-card.png', env.get('APP_URL')).href
    const loginUrl = new URL('/admin/login', env.get('APP_URL')).href
    assert.include(html, 'href="/favicon.svg"')
    assert.include(html, 'property="og:title"')
    assert.include(html, `property="og:image" content="${socialImage}"`)
    assert.include(html, `property="og:url" content="${loginUrl}"`)

    const icon = await client.get('/favicon.svg')
    icon.assertStatus(200)
    assert.include(String(icon.header('content-type')), 'image/svg+xml')
    const image = await client.get('/cms-social-card.png')
    image.assertStatus(200)
    assert.include(String(image.header('content-type')), 'image/png')
  })

  test('login page retains failed input and offers refresh only with a refresh cookie', async ({
    client,
    assert,
  }) => {
    const loginPage = await client.get('/admin/login')
    loginPage.assertStatus(200)
    const loginProps = initialPage(loginPage)
    assert.equal(loginProps.component, 'auth/login')
    assert.isString(loginProps.props.csrfToken)
    assert.equal(loginProps.props.canRefresh, false)

    const failed = await client.post('/admin/login').withCsrfToken().form({
      email,
      password: 'incorrect-password',
    })
    failed.assertStatus(200)
    const failedProps = initialPage(failed)
    assert.equal(failedProps.props.loginError, 'Invalid email or password')
    assert.equal(failedProps.props.email, email)

    await createAdmin()
    const tokens = await loginAdmin(email, password)
    const continuing = await client.get('/admin/login').cookie('admin_refresh', tokens.refreshToken)
    continuing.assertStatus(200)
    assert.equal(initialPage(continuing).props.canRefresh, true)

    const refreshed = await client
      .post('/admin/refresh')
      .cookie('admin_refresh', tokens.refreshToken)
      .withCsrfToken()
      .redirects(0)
      .form({})
    refreshed.assertStatus(302)
    assert.equal(refreshed.header('location'), '/admin')
    assert.isString(refreshed.cookie('admin_access')?.value)
  })

  test('Inertia sign in loads a fresh authenticated document', async ({ client, assert }) => {
    await createAdmin()
    const login = await client
      .post('/admin/login')
      .header('X-Inertia', 'true')
      .withCsrfToken()
      .redirects(0)
      .form({ email, password })

    login.assertStatus(409)
    assert.equal(login.header('x-inertia-location'), '/admin')
    assert.isString(login.cookie('admin_access')?.value)
    assert.isString(login.cookie('admin_refresh')?.value)
  })

  test('logs in, renders account props, and revokes the session on logout', async ({
    client,
    assert,
  }) => {
    await createAdmin()
    const login = await client
      .post('/admin/login')
      .withCsrfToken()
      .redirects(0)
      .form({ email, password })
    login.assertStatus(302)
    assert.equal(login.header('location'), '/admin')
    const access = login.cookie('admin_access')?.value
    assert.isString(access)

    const firstAccount = await client.get('/admin/account').cookie('admin_access', access!)
    firstAccount.assertStatus(200)
    const initialAccount = initialPage(firstAccount)
    assert.equal(initialAccount.component, 'auth/account')

    const account = await client
      .get('/admin/account')
      .cookie('admin_access', access!)
      .header('X-Inertia', 'true')
      .header('X-Inertia-Version', initialAccount.version)
    account.assertStatus(200)
    assert.equal(account.body().component, 'auth/account')
    assert.equal(account.body().props.adminName, 'CMS React Admin')
    assert.isString(account.body().props.csrfToken)
    assert.notProperty(account.body().props, 'password')
    assert.notInclude(JSON.stringify(account.body().props), access!)

    const logout = await client
      .post('/admin/logout')
      .cookie('admin_access', access!)
      .withCsrfToken()
      .redirects(0)
      .form({})
    logout.assertStatus(302)
    assert.equal(logout.header('location'), '/admin/login')
    await assert.rejects(() => authenticateAdmin(access!))
  })

  test('password change keeps its redirect and revokes old credentials', async ({
    client,
    assert,
  }) => {
    await createAdmin()
    const tokens = await loginAdmin(email, password)
    const nextPassword = 'a-different-long-password'

    const changed = await client
      .post('/admin/account/password')
      .cookie('admin_access', tokens.accessToken)
      .withCsrfToken()
      .redirects(0)
      .form({ currentPassword: password, newPassword: nextPassword })
    changed.assertStatus(302)
    assert.equal(changed.header('location'), '/admin/login')
    await assert.rejects(() => authenticateAdmin(tokens.accessToken))

    const login = await client
      .post('/admin/login')
      .withCsrfToken()
      .redirects(0)
      .form({ email, password: nextPassword })
    login.assertStatus(302)
    assert.isString(login.cookie('admin_access')?.value)
  })
})
