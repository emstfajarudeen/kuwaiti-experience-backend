/// <reference lib="dom" />
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'

test.group('CMS layout transitions', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('switches from the centered login layout after signing in', async ({ visit, assert }) => {
    await db.table('users').insert({
      full_name: 'Layout Test Admin',
      email: 'layout-admin@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })

    const page = await visit('/admin/login')
    assert.equal(await page.locator('body').getAttribute('class'), 'login-body')
    await page.evaluate(() => {
      document.documentElement.dataset.loginDocument = 'true'
    })

    await page.getByLabel('Email address').fill('layout-admin@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.waitForURL('**/admin/account')
    await page.locator('.cms-shell').waitFor({ state: 'visible' })
    assert.equal(await page.locator('body').getAttribute('class'), 'cms-body')
    const layout = await page.evaluate(() => {
      const shell = document.querySelector('.cms-shell')!.getBoundingClientRect()
      return {
        oldDocument: document.documentElement.dataset.loginDocument,
        left: shell.left,
        width: shell.width,
        viewport: document.documentElement.clientWidth,
        padding: getComputedStyle(document.body).padding,
      }
    })
    assert.isUndefined(layout.oldDocument)
    assert.equal(layout.left, 0)
    assert.equal(layout.width, layout.viewport)
    assert.equal(layout.padding, '0px')
  })
})
