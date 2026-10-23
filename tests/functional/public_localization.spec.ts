import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
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
        body: 'English body',
      },
      {
        place_id: placeId,
        locale: 'ar',
        title: 'أبراج الكويت',
        summary: '',
        address: '',
        body: '',
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

    const hub = await client.get('/api/v2/explore').header('Accept-Language', 'ar')
    hub.assertStatus(200)
    assert.equal(
      hub.body().data.category_types.find((row: { code: string }) => row.code === 'attraction')
        .name,
      'معالم الجذب'
    )
    const features = await client
      .get('/api/v2/place-features?type=attraction')
      .header('Accept-Language', 'ar')
    features.assertStatus(200)
    const selectedFeature = features.body().data.find((row: { id: number }) => row.id === featureId)
    assert.equal(selectedFeature.name, 'Family friendly')
    assert.notProperty(selectedFeature, 'name_en')

    const detail = await client.get(`/api/v2/places/${place.slug}`).header('Accept-Language', 'ar')
    detail.assertStatus(200)
    assert.equal(detail.body().data.place_translations[0].title, 'أبراج الكويت')
    assert.equal(detail.body().data.place_images[0].caption, 'منظر الغروب')
    assert.deepEqual(
      Object.keys(detail.body().meta).sort(),
      Object.keys(places.body().meta)
        .filter((key: string) => !['page', 'per_page', 'total', 'last_page'].includes(key))
        .sort()
    )

    const legacyHome = await client.get('/api/v1/home?locale=en').header('Accept-Language', 'ar')
    legacyHome.assertStatus(200)
    assert.equal(legacyHome.body().data.hero.title, 'اكتشف الكويت')
    assert.equal(legacyHome.body().data.discoveryTitle, 'What to do?')
    const legacyCategories = await client
      .get('/api/v1/categories?type=attraction&locale=en')
      .header('Accept-Language', 'ar')
    legacyCategories.assertStatus(200)
    assert.equal(
      legacyCategories.body().data.find((row: { id: number }) => row.id === categoryId).name,
      'معالم'
    )
    const legacyPlaces = await client
      .get('/api/v1/places?type=attraction')
      .header('Accept-Language', 'ar')
    legacyPlaces.assertStatus(200)
    const legacyPlace = legacyPlaces.body().data.find((row: { id: number }) => row.id === placeId)
    assert.equal(legacyPlace.title, 'أبراج الكويت')
    assert.equal(legacyPlace.summary, 'English summary')
    const legacyDetail = await client
      .get(`/api/v1/places/${place.slug}`)
      .header('Accept-Language', 'ar')
    legacyDetail.assertStatus(200)
    assert.equal(legacyDetail.body().data.body, 'English body')
    assert.equal(legacyDetail.body().data.gallery[0].alt, 'Tower at sunset')

    const [locationId] = await db.table('transport_locations').insert({
      code: `airport-${randomUUID()}`,
      active: true,
    })
    await db.table('transport_location_translations').insert([
      { location_id: locationId, locale: 'en', name: 'Airport' },
      { location_id: locationId, locale: 'ar', name: '   ' },
    ])
    const locations = await client
      .get('/api/v1/transport/locations')
      .header('Accept-Language', 'ar')
    locations.assertStatus(200)
    assert.equal(
      locations.body().data.find((row: { id: number }) => row.id === locationId).name,
      'Airport'
    )

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

  test('pages and showtime movies use the header and preserve their response containers', async ({
    client,
    assert,
  }) => {
    const [pageId] = await db.table('pages').insert({
      slug: 'about-us',
      status: 'published',
      published_at: new Date(Date.now() - 1000),
      created_at: new Date(),
    })
    await db.table('page_translations').insert([
      {
        page_id: pageId,
        locale: 'en',
        title: 'About us',
        body: 'English page',
        body_format: 'plain_text',
      },
      { page_id: pageId, locale: 'ar', title: 'من نحن', body: '', body_format: 'html' },
    ])
    const page = await client.get('/api/v2/pages/about-us').header('Accept-Language', 'ar')
    page.assertStatus(200)
    assert.lengthOf(page.body().data.page_translations, 1)
    assert.equal(page.body().data.page_translations[0].title, 'من نحن')
    assert.equal(page.body().data.page_translations[0].body, 'English page')
    assert.equal(page.body().data.page_translations[0].body_format, 'plain_text')
    assert.property(page.body().meta, 'locale')
    assert.property(page.body().meta, 'content_hash')
    const legacyPage = await client.get('/api/v1/pages/about-us').header('Accept-Language', 'ar')
    legacyPage.assertStatus(200)
    assert.equal(legacyPage.body().data.title, 'من نحن')
    assert.equal(legacyPage.body().data.body, 'English page')

    await db
      .table('category_types')
      .insert({ code: 'theater', name_en: 'Theaters' })
      .onConflict('code')
      .ignore()
    const [theaterId] = await db.table('places').insert({
      type: 'theater',
      slug: `theater-${randomUUID()}`,
      status: 'published',
      price_mode: 'unknown',
      price_currency: 'KWD',
      published_at: new Date(Date.now() - 1000),
      created_at: new Date(),
    })
    await db.table('place_translations').insert({
      place_id: theaterId,
      locale: 'en',
      title: 'Cinema',
      summary: '',
      address: '',
    })
    const [movieId] = await db.table('movies').insert({
      title_en: 'Film',
      title_ar: 'فيلم',
      synopsis_en: 'English synopsis',
      synopsis_ar: '',
      status: 'published',
      published_at: new Date(Date.now() - 1000),
      created_at: new Date(),
    })
    const starts = DateTime.now()
      .setZone('Asia/Kuwait')
      .plus({ days: 1 })
      .startOf('day')
      .plus({ hours: 12 })
    await db.table('theater_showtimes').insert({
      place_id: theaterId,
      movie_id: movieId,
      starts_at: starts.toUTC().toJSDate(),
      format: '2D',
      status: 'published',
      created_at: new Date(),
    })
    const slug = (await db.from('places').where('id', theaterId).first())!.slug
    const showtimes = await client
      .get(`/api/v2/places/${slug}/showtimes?date=${starts.toISODate()}`)
      .header('Accept-Language', 'ar')
    showtimes.assertStatus(200)
    assert.lengthOf(showtimes.body().data, 1)
    assert.lengthOf(showtimes.body().included.movies, 1)
    assert.equal(showtimes.body().included.movies[0].title, 'فيلم')
    assert.equal(showtimes.body().included.movies[0].synopsis, 'English synopsis')
    assert.notProperty(showtimes.body().included.movies[0], 'title_en')
    for (const key of ['date', 'page', 'per_page', 'total']) {
      assert.property(showtimes.body().meta, key)
    }
  })
})
