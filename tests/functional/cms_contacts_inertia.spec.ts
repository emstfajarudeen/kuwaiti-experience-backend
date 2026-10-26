import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { loginAdmin } from '../../app/services/auth_service.js'

const email = 'contacts-admin@example.com'
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
    full_name: 'Contacts Admin',
    email,
    password: await hash.make(password),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  const login = await loginAdmin(email, password)
  return login.accessToken
}

test.group('CMS React contact requests', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('keeps inbox access, order, paging, and status filtering', async ({ client, assert }) => {
    const denied = await client.get('/admin/contact-requests').redirects(0)
    denied.assertStatus(302)
    assert.equal(denied.header('location'), '/admin/login')

    const access = await createAdmin()
    const empty = await client.get('/admin/contact-requests').cookie('admin_access', access)
    empty.assertStatus(200)
    assert.equal(initialPage(empty).component, 'contacts/index')
    assert.deepEqual(initialPage(empty).props.contacts, [])

    const now = new Date()
    await db.table('contact_requests').insert(
      Array.from({ length: 21 }, (_, index) => ({
        full_name: `Visitor ${index + 1}`,
        email: `visitor${index + 1}@example.com`,
        message: `Message ${index + 1}`,
        status: index === 20 ? 'resolved' : 'new',
        created_at: now,
      }))
    )
    const first = await client.get('/admin/contact-requests').cookie('admin_access', access)
    first.assertStatus(200)
    const firstProps = initialPage(first).props
    assert.equal((firstProps.meta as Record<string, number>).total, 21)
    assert.equal((firstProps.meta as Record<string, number>).last_page, 2)
    assert.lengthOf(firstProps.contacts as object[], 20)
    assert.equal((firstProps.contacts as Array<Record<string, unknown>>)[0].full_name, 'Visitor 21')

    const second = await client.get('/admin/contact-requests?page=2').cookie('admin_access', access)
    second.assertStatus(200)
    assert.equal((initialPage(second).props.meta as Record<string, number>).page, 2)
    assert.lengthOf(initialPage(second).props.contacts as object[], 1)

    const filtered = await client
      .get('/admin/contact-requests?status=resolved')
      .cookie('admin_access', access)
    filtered.assertStatus(200)
    assert.equal(initialPage(filtered).props.status, 'resolved')
    assert.lengthOf(initialPage(filtered).props.contacts as object[], 1)

    const invalid = await client
      .get('/admin/contact-requests?status=invalid')
      .cookie('admin_access', access)
    invalid.assertStatus(422)
  })

  test('shows safe detail and preserves CSRF, redirect, and audit on status update', async ({
    client,
    assert,
  }) => {
    const access = await createAdmin()
    const [id] = await db.table('contact_requests').insert({
      full_name: 'Mariam',
      email: 'mariam@example.com',
      phone_number: '+96512345678',
      inquiry_type: 'Partnership',
      message: '<script>alert(1)</script>\nSecond line',
      status: 'new',
      created_at: new Date(),
    })

    const detail = await client.get(`/admin/contact-requests/${id}`).cookie('admin_access', access)
    detail.assertStatus(200)
    const page = initialPage(detail)
    assert.equal(page.component, 'contacts/show')
    assert.isString(page.props.csrfToken)
    assert.equal(
      (page.props.contact as Record<string, unknown>).message,
      '<script>alert(1)</script>\nSecond line'
    )
    assert.notInclude(detail.text(), '<script>alert(1)</script>')
    assert.notProperty(page.props.contact as object, 'customer_id')

    const rejected = await client
      .post(`/admin/contact-requests/${id}/status`)
      .cookie('admin_access', access)
      .redirects(0)
      .form({ status: 'resolved' })
    assert.notEqual(rejected.status(), 200)
    const unchanged = await db.from('contact_requests').where('id', id).first()
    assert.equal(unchanged.status, 'new')

    const changed = await client
      .post(`/admin/contact-requests/${id}/status`)
      .cookie('admin_access', access)
      .withCsrfToken()
      .redirects(0)
      .form({ status: 'resolved' })
    changed.assertStatus(302)
    assert.equal(changed.header('location'), `/admin/contact-requests/${id}`)
    const updated = await db.from('contact_requests').where('id', id).first()
    assert.equal(updated.status, 'resolved')
    const audit = await db
      .from('audit_logs')
      .where('entity_type', 'contact_request')
      .where('entity_id', String(id))
      .first()
    assert.equal(audit.action, 'contact.status.updated')

    const refreshed = await client
      .get(`/admin/contact-requests/${id}`)
      .cookie('admin_access', access)
      .withSession(changed.session())
    refreshed.assertStatus(200)
    assert.equal(
      (initialPage(refreshed).props.contact as Record<string, unknown>).status,
      'resolved'
    )
  })
})
