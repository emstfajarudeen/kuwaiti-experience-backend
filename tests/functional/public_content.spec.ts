import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'

test.group('Public content API', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('does not expose drafts and counts the filtered published places', async ({
    client,
    assert,
  }) => {
    await db
      .table('category_types')
      .insert({ code: 'attraction', name_en: 'Attractions' })
      .onConflict('code')
      .ignore()
    const [categoryId] = await db.table('categories').insert({
      type: 'attraction',
      slug: 'parks',
      active: true,
      sort_order: 0,
      created_at: new Date(),
    })
    await db
      .table('category_translations')
      .insert({ category_id: categoryId, locale: 'en', name: 'Parks' })
    const [placeId] = await db.table('places').insert({
      type: 'attraction',
      slug: 'test-park',
      category_id: categoryId,
      status: 'draft',
      price_mode: 'unknown',
      price_currency: 'KWD',
      created_at: new Date(),
    })
    await db.table('place_translations').insert({
      place_id: placeId,
      locale: 'en',
      title: 'Test Park',
      summary: 'Test description',
      address: 'Kuwait City',
    })

    const hidden = await client.get('/api/v1/places?type=attraction&category=parks')
    hidden.assertStatus(200)
    assert.equal(hidden.body().meta.total, 0)

    await db
      .from('places')
      .where('id', placeId)
      .update({ status: 'published', published_at: new Date(Date.now() - 1000) })
    const visible = await client.get('/api/v1/places?type=attraction&category=parks')
    visible.assertStatus(200)
    assert.equal(visible.body().meta.total, 1)
    assert.equal(visible.body().data[0].slug, 'test-park')
    assert.notProperty(visible.body().data[0], 'status')

    const [uncategorizedId] = await db.table('places').insert({
      type: 'attraction',
      slug: 'uncategorized-place',
      status: 'published',
      published_at: new Date(Date.now() - 1000),
      price_mode: 'unknown',
      price_currency: 'KWD',
      created_at: new Date(),
    })
    await db.table('place_translations').insert({
      place_id: uncategorizedId,
      locale: 'en',
      title: 'Uncategorized Place',
      summary: 'A second place',
      address: 'Kuwait City',
    })

    const categories = await client.get('/api/v1/categories?type=attraction')
    categories.assertStatus(200)
    assert.deepEqual(categories.body().data, [{ id: categoryId, slug: 'parks', name: 'Parks' }])

    const all = await client.get('/api/v1/places?type=attraction&category=all')
    all.assertStatus(200)
    assert.equal(all.body().meta.total, 2)
    assert.deepEqual(
      all.body().data.map((place: { slug: string }) => place.slug),
      ['test-park', 'uncategorized-place']
    )
    const omitted = await client.get('/api/v1/places?type=attraction')
    omitted.assertStatus(200)
    assert.deepEqual(omitted.body(), all.body())
    const filtered = await client.get('/api/v1/places?type=attraction&category=parks')
    filtered.assertStatus(200)
    assert.equal(filtered.body().meta.total, 1)
  })

  test('validates type and keeps CMS routes private', async ({ client }) => {
    const type = await client.get('/api/v1/places?type=other')
    type.assertStatus(422)
    const cms = await client.get('/api/v1/admin/places')
    cms.assertStatus(401)
    const retiredCategoryTypes = await client.get('/api/v1/category-types')
    retiredCategoryTypes.assertStatus(404)
  })

  test('renders the admin login view', async ({ client }) => {
    const page = await client.get('/admin/login')
    page.assertStatus(200)
    page.assertTextIncludes('Welcome back')
  })
})
