import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'

test.group('CMS dashboard browser', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('signs in and reaches the migrated dashboard with working links and mobile navigation', async ({
    visit,
    assert,
  }) => {
    await db.table('users').insert({
      full_name: 'Browser Admin',
      email: 'browser-dashboard@example.com',
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
    await db.table('places').insert({
      type: 'attraction',
      slug: 'dashboard-browser-draft',
      status: 'draft',
      created_at: new Date(),
    })

    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill('browser-dashboard@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.getByRole('heading', { name: 'Overview' }).waitFor({ state: 'visible' })
    assert.equal(await page.getByRole('heading', { name: 'Overview' }).count(), 1)
    assert.equal(await page.locator('.stat-card.accent .stat-value').innerText(), '1')
    assert.equal(
      await page.getByRole('link', { name: 'Review drafts' }).getAttribute('href'),
      '/admin/places?status=draft'
    )
    assert.equal(
      await page.getByRole('link', { name: 'Attractions 1' }).getAttribute('href'),
      '/admin/places?type=attraction'
    )
    assert.equal(await page.getByText('No recent activity recorded.').count(), 1)

    await page.setViewportSize({ width: 390, height: 800 })
    const menu = page.getByRole('button', { name: 'Toggle navigation menu' })
    await menu.click()
    assert.equal(await menu.getAttribute('aria-expanded'), 'true')
    await page.keyboard.press('Escape')
    assert.equal(await menu.getAttribute('aria-expanded'), 'false')
  })
})
