import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import sharp from 'sharp'

const attractions: Array<[string, string, string]> = [
  ['Kuwait Towers', 'landmarks', 'Arabian Gulf Street, Kuwait City'],
  ['The Grand Mosque', 'landmarks', 'Mubarak Al Kabeer Street'],
  ['Al Shaheed Park', 'parks', 'Soor Street, Kuwait City'],
  ['Souq Al-Mubarakiya', 'markets', 'Mubarak Al Kabeer Street'],
  ['Sadu House', 'museums', 'Arabian Gulf Street'],
  ['Green Island', 'parks', 'Arabian Gulf Street'],
  ['Liberation Tower', 'landmarks', 'Abdullah Al Salem Street'],
  ['Tareq Rajab Museum', 'museums', 'Jabriya, Kuwait'],
  ['Friday Market', 'markets', 'Al Rai, Kuwait'],
  ['The Mirror House', 'museums', 'Qadsiya, Kuwait'],
  ['Boulevard Park', 'parks', 'Salmiya, Kuwait'],
]

const otherPlaces: Array<[string, string, string]> = [
  ['Dar Hamad', 'restaurant', 'Arabian Gulf Street, Salmiya'],
  ['Freej Swaileh', 'restaurant', 'Al Mubarakiya'],
  ['The Breakfast Club', 'restaurant', 'Kuwait City'],
  ['Seaside Table', 'restaurant', 'Marina Crescent'],
  ['Waldorf Astoria Kuwait', 'hotel_resort', 'The Avenues, Kuwait'],
  ['Four Seasons Kuwait', 'hotel_resort', 'Burj Alshaya, Kuwait City'],
  ['The Palms Beach Hotel', 'hotel_resort', 'Al Taawoun Street'],
  ['City View Suites', 'hotel_resort', 'Kuwait City'],
  ['Sheikh Jaber Al-Ahmad', 'theater', 'Kuwait City'],
  ['VOX Cinemas Kuwait', 'theater', 'The Avenues, Kuwait'],
  ['Cinescape 360', 'theater', '360 Mall, Zahra'],
  ['The Arena Kuwait', 'theater', '360 Mall, Zahra'],
]

function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function demoImage(name: string, hue: string) {
  const key = `demo/${slug(name)}.webp`
  const existing = await db.from('media').where('storage_key', key).first()
  if (existing && (await drive.use('local').exists(key))) return existing.id as number
  const title = name.replace(/[&<>"']/g, '')
  const svg = `<svg width="1200" height="720" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="720" fill="${hue}"/>
    <circle cx="940" cy="120" r="420" fill="#ffffff" opacity=".055"/>
    <path d="M0 550 Q280 430 560 560 T1200 540 V720 H0Z" fill="#ffffff" opacity=".08"/>
    <text x="70" y="100" fill="#e7bc65" font-size="20" letter-spacing="5" font-family="Arial">THE KUWAITI EXPERIENCE · DEMO</text>
    <text x="70" y="620" fill="white" font-size="58" font-family="Arial">${title}</text>
  </svg>`
  const buffer = await sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer()
  await drive.use('local').put(key, buffer)
  if (existing) return existing.id as number
  const [id] = await db.table('media').insert({
    disk: 'local',
    storage_key: key,
    original_name: `${slug(name)}.webp`,
    mime: 'image/webp',
    bytes: buffer.length,
    width: 1200,
    height: 720,
    alt_en: `${name} demo placeholder`,
    created_at: new Date(),
  })
  return id as number
}

export default class DemoSeeder extends BaseSeeder {
  async run() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DemoSeeder is disabled in production')
    }
    await db
      .table('category_types')
      .insert([
        { code: 'attraction', name_en: 'Attractions', sort_order: 0 },
        { code: 'restaurant', name_en: 'Restaurants', sort_order: 1 },
        { code: 'hotel_resort', name_en: 'Hotels & Resorts', sort_order: 2 },
        { code: 'theater', name_en: 'Theaters', sort_order: 3 },
      ])
      .onConflict('code')
      .ignore()
    const categoryIds = new Map<string, number>()
    for (const [type, categorySlug, name] of [
      ['attraction', 'landmarks', 'Landmarks'],
      ['attraction', 'museums', 'Museums'],
      ['attraction', 'parks', 'Parks'],
      ['attraction', 'markets', 'Markets'],
      ['restaurant', 'dining', 'Dining'],
      ['hotel_resort', 'stays', 'Stays'],
      ['theater', 'shows', 'Shows'],
    ]) {
      let row = await db.from('categories').where('type', type).where('slug', categorySlug).first()
      if (!row) {
        const [id] = await db.table('categories').insert({
          type,
          slug: categorySlug,
          sort_order: categoryIds.size,
          active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        await db.table('category_translations').insert({ category_id: id, locale: 'en', name })
        row = { id }
      }
      categoryIds.set(`${type}:${categorySlug}`, row.id)
    }

    const allPlaces: Array<[string, string, string, string]> = [
      ...attractions.map(([title, category, address]): [string, string, string, string] => [
        title,
        'attraction',
        category,
        address,
      ]),
      ...otherPlaces.map(([title, type, address]): [string, string, string, string] => [
        title,
        type,
        type === 'restaurant' ? 'dining' : type === 'hotel_resort' ? 'stays' : 'shows',
        address,
      ]),
    ]
    for (const [index, [title, type, category, address]] of allPlaces.entries()) {
      if (await db.from('places').where('slug', slug(title)).first()) continue
      const imageId = await demoImage(
        title,
        type === 'attraction'
          ? '#123c5b'
          : type === 'restaurant'
            ? '#4b3a29'
            : type === 'hotel_resort'
              ? '#39616b'
              : '#2d3658'
      )
      await db.transaction(async (trx) => {
        const [id] = await trx.table('places').insert({
          type,
          category_id: categoryIds.get(`${type}:${category}`),
          slug: slug(title),
          status: 'published',
          cover_media_id: imageId,
          price_mode: title === 'Kuwait Towers' ? 'fixed' : 'unknown',
          price_amount: title === 'Kuwait Towers' ? '3.000' : null,
          price_currency: 'KWD',
          featured_order: index < 4 || (index >= 11 && (index - 11) % 4 < 4) ? index % 4 : null,
          published_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        await trx.table('place_translations').insert({
          place_id: id,
          locale: 'en',
          title,
          summary: `Demo listing for ${title}. Verify this content before publication.`,
          body: `Explore ${title}. This is sample copy only; confirm visitor information with the venue.`,
          address,
          hours_note: title === 'Kuwait Towers' ? '9:00 AM – 11:00 PM (demo; verify)' : null,
          price_unit: title === 'Kuwait Towers' ? 'per person (demo; verify)' : null,
        })
        if (title === 'Kuwait Towers') {
          await trx.table('place_media').insert({
            place_id: id,
            media_id: imageId,
            sort_order: 0,
            caption_en: 'Demo gallery placeholder',
          })
        }
      })
    }

    for (const [code, name] of [
      ['tijariya-tower', 'Tijariya Tower, Seef Street'],
      ['kuwait-airport-t1', 'Kuwait International Airport T1'],
      ['kuwait-towers', 'Kuwait Towers'],
    ]) {
      if (await db.from('transport_locations').where('code', code).first()) continue
      const [id] = await db
        .table('transport_locations')
        .insert({ code, active: true, pickup_enabled: true, dropoff_enabled: true, sort_order: 0 })
      await db
        .table('transport_location_translations')
        .insert({ location_id: id, locale: 'en', name })
    }

    if (!(await db.from('site_settings').where('id', 1).first())) {
      await db
        .table('site_settings')
        .insert({ id: 1, brand_name: 'The Kuwaiti Experience', updated_at: new Date() })
    }
    if (!(await db.from('home_content').where('locale', 'en').first())) {
      const hero = await demoImage('Kuwait skyline', '#00264b')
      await db.table('home_content').insert({
        locale: 'en',
        hero_eyebrow: 'WELCOME TO KUWAIT',
        hero_title: 'Explore Kuwait',
        discovery_title: 'What would you like to do?',
        hero_media_id: hero,
        updated_at: new Date(),
      })
    }
    for (const [pageSlug, title] of [
      ['about-us', 'About Us'],
      ['contact-us', 'Contact Us'],
      ['terms-and-conditions', 'Terms and Conditions'],
      ['privacy-policy', 'Privacy Policy'],
    ]) {
      if (await db.from('pages').where('slug', pageSlug).first()) continue
      const [id] = await db
        .table('pages')
        .insert({ slug: pageSlug, status: 'draft', created_at: new Date(), updated_at: new Date() })
      await db.table('page_translations').insert({
        page_id: id,
        locale: 'en',
        title,
        body: 'Draft demo content. Replace with approved copy before publishing.',
      })
    }
  }
}
