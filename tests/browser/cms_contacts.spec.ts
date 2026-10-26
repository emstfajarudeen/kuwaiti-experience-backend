import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'

test.group('CMS contact requests browser', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('opens an inquiry and saves its status with feedback', async ({ visit, assert }) => {
    await db.table('users').insert({
      full_name: 'Browser Admin',
      email: 'browser-contacts@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const [id] = await db.table('contact_requests').insert({
      full_name: 'Browser Visitor',
      email: 'visitor@example.com',
      phone_number: '+96512345678',
      inquiry_type: 'Partnership',
      message: '<script>alert(1)</script>\nSecond line',
      status: 'new',
      created_at: new Date(),
    })

    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill('browser-contacts@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.goto(new URL('/admin/contact-requests', page.url()).toString())
    await page.getByRole('heading', { name: 'Contact requests' }).waitFor({ state: 'visible' })
    assert.equal(await page.getByRole('heading', { name: 'Messages (1)' }).count(), 1)
    const menu = page.getByRole('button', { name: 'More actions for request from Browser Visitor' })
    await menu.click()
    assert.equal(await menu.getAttribute('aria-expanded'), 'true')
    await page.getByRole('menuitem', { name: 'View inquiry' }).click()
    await page.waitForURL(`**/admin/contact-requests/${id}`)
    await page.getByRole('heading', { name: 'Browser Visitor' }).waitFor({ state: 'visible' })
    assert.equal(await page.getByText('<script>alert(1)</script>').count(), 1)
    assert.equal(
      await page.getByRole('link', { name: 'visitor@example.com' }).getAttribute('href'),
      'mailto:visitor@example.com'
    )

    await page.getByLabel('Workflow status').click()
    await page.locator('.ant-select-item-option').filter({ hasText: 'resolved' }).click()
    const statusResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/admin/contact-requests/${id}/status`) &&
        response.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Save status' }).click()
    const response = await statusResponse
    assert.equal(response.status(), 302, response.headers().location)
    const updated = await db.from('contact_requests').where('id', id).first()
    assert.equal(updated.status, 'resolved', response.headers().location)
    await page.getByText('Contact request updated').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.page-head .status').innerText(), 'Resolved')
  })

  test('shows paginated inquiries and retains the status filter in links', async ({
    visit,
    assert,
  }) => {
    await db.table('users').insert({
      full_name: 'Paging Admin',
      email: 'paging-contacts@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    await db.table('contact_requests').insert(
      Array.from({ length: 21 }, (_, index) => ({
        full_name: `Visitor ${index + 1}`,
        email: `paging${index + 1}@example.com`,
        message: `Message ${index + 1}`,
        status: 'new',
        created_at: new Date(),
      }))
    )

    const page = await visit('/admin/login')
    await page.getByLabel('Email address').fill('paging-contacts@example.com')
    await page.getByLabel('Password', { exact: true }).fill('a-very-long-test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/admin')
    await page.goto(new URL('/admin/contact-requests?status=new', page.url()).toString())
    await page.getByRole('heading', { name: 'Messages (21)' }).waitFor({ state: 'visible' })
    await page.locator('.ant-pagination-next button').click()
    await page.getByText('Page 2 of 2').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.ant-table-row').count(), 1)
    assert.equal(new URL(page.url()).searchParams.get('status'), 'new')
    assert.equal(new URL(page.url()).searchParams.get('page'), '2')
    await page.locator('.ant-pagination-prev button').click()
    await page.getByText('Page 1 of 2').waitFor({ state: 'visible' })
    assert.equal(new URL(page.url()).searchParams.get('status'), 'new')
    await page.setViewportSize({ width: 390, height: 844 })
    const rowActions = page.getByRole('button', {
      name: 'More actions for request from Visitor 21',
    })
    await rowActions.waitFor({ state: 'visible' })
    await rowActions.click()
    assert.equal(await page.getByRole('menuitem', { name: 'View inquiry' }).count(), 1)
  })
})
