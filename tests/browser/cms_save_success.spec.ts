import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { prepareAdminAuthorization } from '../helpers/admin_auth.js'

test.group('CMS success notifications', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('create and repeated updates show one toast without a banner or saved screen', async ({
    visit,
    assert,
  }) => {
    const email = 'saved-browser@example.com'
    await db.table('users').insert({
      full_name: 'Saved Admin',
      email,
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    await prepareAdminAuthorization(email)
    await db
      .table('category_types')
      .insert({ code: 'attraction', name_en: 'Attractions', sort_order: 0 })
      .onConflict('code')
      .ignore()
    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.goto(new URL('/admin/categories/new', page.url()).toString())
    await page.getByLabel('English name').fill('Toast landmarks')
    await page.getByLabel('URL slug').fill('toast-landmarks')
    await page.getByRole('button', { name: 'Save category' }).click()
    await page.waitForURL('**/admin/categories')
    await page
      .locator('.ant-notification-notice')
      .getByText('Category saved.', { exact: true })
      .waitFor({ state: 'visible' })
    assert.equal(await page.locator('.ant-notification-notice').count(), 1)
    assert.equal(await page.locator('.notice.success, .save-success').count(), 0)

    let currentName = 'Toast landmarks'
    for (const name of ['Toast sights', 'Toast highlights']) {
      await page.getByRole('link', { name: `Edit ${currentName}`, exact: true }).click()
      await page.getByLabel('English name').fill(name)
      await page.getByRole('button', { name: 'Save changes' }).click()
      await page.waitForURL('**/admin/categories')
      await page.getByText(name, { exact: true }).waitFor({ state: 'visible' })
      await page
        .locator('.ant-notification-notice')
        .getByText('Category saved.', { exact: true })
        .waitFor({ state: 'visible' })
      assert.equal(await page.locator('.ant-notification-notice').count(), 1)
      assert.equal(await page.locator('.notice.success, .save-success').count(), 0)
      currentName = name
    }

    await page.goto(new URL('/admin/category-types/new', page.url()).toString())
    await page.getByLabel('Code', { exact: true }).fill('toast_type')
    await page.getByLabel('English name').fill('Toast Type')
    await page.getByRole('button', { name: 'Save category type' }).click()
    await page.waitForURL('**/admin/category-types')
    await page
      .locator('.ant-notification-notice')
      .getByText('Category type created.', { exact: true })
      .waitFor({ state: 'visible' })
    assert.equal(await page.locator('.ant-notification-notice').count(), 1)
    assert.equal(await page.locator('.notice.success, .save-success').count(), 0)
  })
})
