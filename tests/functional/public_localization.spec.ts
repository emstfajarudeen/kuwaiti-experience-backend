import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import { localizePublicData } from '../../app/services/public_localization.js'

test.group('Localized public discovery responses', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('home, categories and places return one locale with English field fallback', async ({
    client,
    assert,
  }) => {
    await db
      .table('category_types')
      .insert({
        code: 'attraction',
        name_en: 'Attractions',
        name_ar: 'معالم الجذب',
      })
      .onConflict('code')
      .merge({ name_en: 'Attractions', name_ar: 'معالم الجذب' })
    const [categoryId] = await db.table('categories').insert({
      type: 'attraction',
      slug: `landmarks-${randomUUID()}`,
      active: true,
      created_at: new Date(),
    })
    await db.table('category_translations').insert([
      { category_id: categoryId, locale: 'en', name: 'Landmarks' },
      { category_id: categoryId, locale: 'ar', name: 'معالم' },
    ])
    const [placeId] = await db.table('places').insert({
      type: 'attraction',
      category_id: categoryId,
      slug: `kuwait-towers-${randomUUID()}`,
      status: 'published',
      price_mode: 'unknown',
      price_currency: 'KWD',
      featured_order: 0,
      published_at: new Date(Date.now() - 1000),
      created_at: new Date(),
    })
    await db.table('place_translations').insert([
      {
        place_id: placeId,
        locale: 'en',
        title: 'Kuwait Towers',
        summary: 'English summary',
        address: 'Kuwait City',
      },
      {
        place_id: placeId,
        locale: 'ar',
        title: 'أبراج الكويت',
        summary: '',
        address: '',
      },
    ])
    const [featureId] = await db.table('place_features').insert({
      type: 'attraction',
      code: `family-friendly-${randomUUID()}`,
      kind: 'highlight',
      name_en: 'Family friendly',
      name_ar: null,
      active: true,
      created_at: new Date(),
    })
    await db.table('place_feature_assignments').insert({ place_id: placeId, feature_id: featureId })
    await db.table('place_images').insert({
      place_id: placeId,
      storage_key: `${randomUUID()}.webp`,
      alt_en: 'Tower at sunset',
      alt_ar: '',
      caption_en: 'Sunset view',
      caption_ar: 'منظر الغروب',
      created_at: new Date(),
    })
    await db
      .table('home_content')
      .insert({
        locale: 'en',
        hero_title: 'Explore Kuwait',
        discovery_title: 'What to do?',
      })
      .onConflict('locale')
      .merge({ hero_title: 'Explore Kuwait', discovery_title: 'What to do?' })
    await db
      .table('home_content')
      .insert({
        locale: 'ar',
        hero_title: 'اكتشف الكويت',
        discovery_title: '',
      })
      .onConflict('locale')
      .merge({ hero_title: 'اكتشف الكويت', discovery_title: '' })
    await db.table('home_explore_cards').insert({
      place_id: placeId,
      caption_en: 'Featured landmark',
      caption_ar: null,
      created_at: new Date(),
    })

    const home = await client.get('/api/v2/home').header('Accept-Language', 'ar-KW, en;q=0.8')
    home.assertStatus(200)
    const attraction = home
      .body()
      .data.category_types.find((row: { code: string }) => row.code === 'attraction')
    assert.equal(attraction.name, 'معالم الجذب')
    assert.notProperty(attraction, 'name_en')
    assert.notProperty(attraction, 'name_ar')
    assert.lengthOf(home.body().data.home_content, 1)
    assert.equal(home.body().data.home_content[0].hero_title, 'اكتشف الكويت')
    assert.equal(home.body().data.home_content[0].discovery_title, 'What to do?')
    const card = home
      .body()
      .data.home_explore_cards.find((row: { place_id: number }) => row.place_id === placeId)
    assert.equal(card.caption, 'Featured landmark')
    assert.notProperty(card, 'caption_en')

    const categories = await client
      .get('/api/v2/categories?type=attraction')
      .header('Accept-Language', 'ar')
    categories.assertStatus(200)
    const category = categories.body().data.find((row: { id: number }) => row.id === categoryId)
    assert.lengthOf(category.category_translations, 1)
    assert.equal(category.category_translations[0].name, 'معالم')

    const places = await client
      .get('/api/v2/places?type=attraction&category=all')
      .header('Accept-Language', 'en;q=0.5, ar;q=0.9')
    places.assertStatus(200)
    const place = places.body().data.find((row: { id: number }) => row.id === placeId)
    assert.lengthOf(place.place_translations, 1)
    assert.equal(place.place_translations[0].title, 'أبراج الكويت')
    assert.equal(place.place_translations[0].summary, 'English summary')
    assert.equal(place.place_translations[0].address, 'Kuwait City')
    assert.equal(place.place_features[0].name, 'Family friendly')
    assert.notProperty(place.place_features[0], 'name_en')
    assert.equal(place.place_images[0].alt, 'Tower at sunset')
    assert.equal(place.place_images[0].caption, 'منظر الغروب')
    assert.notProperty(place.place_images[0], 'alt_en')

    const english = await client.get('/api/v2/home')
    english.assertStatus(200)
    assert.equal(
      english.body().data.category_types.find((row: { code: string }) => row.code === 'attraction')
        .name,
      'Attractions'
    )
    assert.equal(english.body().data.home_content[0].hero_title, 'Explore Kuwait')
    const unsupported = await client
      .get('/api/v2/places?type=attraction')
      .header('Accept-Language', 'fr')
    unsupported.assertStatus(200)
    assert.equal(
      unsupported.body().data.find((row: { id: number }) => row.id === placeId)
        .place_translations[0].title,
      'Kuwait Towers'
    )
  })

  test('uses the English row when an Arabic translation row is absent', ({ assert }) => {
    const result = localizePublicData(
      {
        category_translations: [{ locale: 'en', name: 'Markets' }],
        name_en: 'Markets',
        name_ar: '   ',
      },
      'ar'
    ) as { category_translations: { locale: string; name: string }[]; name: string }
    assert.deepEqual(result.category_translations, [{ locale: 'en', name: 'Markets' }])
    assert.equal(result.name, 'Markets')
  })
})
