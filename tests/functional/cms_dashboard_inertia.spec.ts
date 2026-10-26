import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { loginAdmin } from '../../app/services/auth_service.js'

const email = 'dashboard-admin@example.com'
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
    full_name: 'Dashboard Admin',
    email,
    password: await hash.make(password),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  const login = await loginAdmin(email, password)
  return login.accessToken
}

test.group('CMS React dashboard', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('requires admin access and renders the empty dashboard', async ({ client, assert }) => {
    const privatePage = await client.get('/admin').redirects(0)
    privatePage.assertStatus(302)
    assert.equal(privatePage.header('location'), '/admin/login')

    const access = await createAdmin()
    const page = await client.get('/admin').cookie('admin_access', access)
    page.assertStatus(200)
    const initial = initialPage(page)
    assert.equal(initial.component, 'dashboard/overview')
    assert.equal(initial.props.adminName, 'Dashboard Admin')
    assert.isString(initial.props.csrfToken)
    assert.equal(initial.props.totalPlaces, 0)
    assert.equal(initial.props.publishedCount, 0)
    assert.equal(initial.props.draftCount, 0)
    assert.equal(initial.props.archivedCount, 0)
    assert.equal(initial.props.newContactsCount, 0)
    assert.deepEqual(initial.props.recent, [])
    assert.notInclude(JSON.stringify(initial.props), access)

    const inertiaPage = await client
      .get('/admin')
      .cookie('admin_access', access)
      .header('X-Inertia', 'true')
      .header('X-Inertia-Version', initial.version)
    inertiaPage.assertStatus(200)
    assert.equal(inertiaPage.body().component, 'dashboard/overview')
  })

  test('preserves counts, type ordering, and linked and deleted activity', async ({
    client,
    assert,
  }) => {
    const access = await createAdmin()
    await db.table('category_types').insert([
      { code: 'restaurant', name_en: 'Restaurants', sort_order: 1 },
      { code: 'attraction', name_en: 'Attractions', sort_order: 0 },
    ])
    const now = new Date()
    const placeIds = await db.table('places').insert([
      { type: 'attraction', slug: 'dashboard-published', status: 'published', created_at: now },
      { type: 'restaurant', slug: 'dashboard-draft', status: 'draft', created_at: now },
      { type: 'attraction', slug: 'dashboard-archived', status: 'archived', created_at: now },
    ])
    await db.table('place_translations').insert({
      place_id: placeIds[0],
      locale: 'en',
      title: 'Dashboard Landmark',
      summary: 'Summary',
      address: 'Kuwait City',
    })
    await db.table('contact_requests').insert([
      {
        full_name: 'A',
        email: 'a@example.com',
        message: 'Question',
        status: 'new',
        created_at: now,
      },
      {
        full_name: 'B',
        email: 'b@example.com',
        message: 'Answered',
        status: 'resolved',
        created_at: now,
      },
    ])
    await db.table('audit_logs').insert([
      {
        action: 'place.create',
        entity_type: 'place',
        entity_id: String(placeIds[0]),
        created_at: now,
      },
      { action: 'place.delete', entity_type: 'place', entity_id: '99999', created_at: now },
    ])

    const page = await client.get('/admin').cookie('admin_access', access)
    page.assertStatus(200)
    const { props } = initialPage(page)
    assert.equal(props.totalPlaces, 3)
    assert.equal(props.publishedCount, 1)
    assert.equal(props.draftCount, 1)
    assert.equal(props.archivedCount, 1)
    assert.equal(props.newContactsCount, 1)
    assert.deepInclude(props.typeBreakdown as object[], {
      code: 'attraction',
      name: 'Attractions',
      count: 2,
    })
    assert.deepInclude(props.typeBreakdown as object[], {
      code: 'restaurant',
      name: 'Restaurants',
      count: 1,
    })
    const recent = props.recent as Array<Record<string, unknown>>
    assert.lengthOf(recent, 2)
    assert.equal(recent[0].actionLabel, 'Deleted place')
    assert.equal(recent[0].isDeleted, true)
    assert.equal(recent[0].editUrl, null)
    assert.equal(recent[1].actionLabel, 'Created place')
    assert.equal(recent[1].entityName, 'Dashboard Landmark')
    assert.equal(recent[1].editUrl, `/admin/places/${placeIds[0]}/edit`)
    assert.isString(recent[1].created_at)
    assert.notProperty(recent[1], 'entity_type')
  })
})
