import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'

test.group('CMS save success browser', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('shows the manual return link and automatically returns to the list', async ({
    visit,
    assert,
  }) => {
    await db.table('users').insert({
      full_name: 'Saved Admin',
      email: 'saved-browser@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })

    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill('saved-browser@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.goto(new URL('/admin/categories/saved', page.url()).toString())
    await page
      .getByRole('heading', { name: 'Your changes have been saved.' })
      .waitFor({ state: 'visible' })
    assert.equal(
      await page.getByRole('link', { name: 'Return to categories' }).getAttribute('href'),
      '/admin/categories'
    )
    await page.waitForURL('**/admin/categories', { timeout: 5000 })
    await page
      .getByRole('heading', { name: 'Categories', exact: true })
      .waitFor({ state: 'visible' })
  })
})
