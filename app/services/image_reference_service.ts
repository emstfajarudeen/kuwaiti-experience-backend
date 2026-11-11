import db from '@adonisjs/lucid/services/db'

/**
 * Every column that owns an image file. Each key is unique across its column,
 * and a stored file belongs to exactly one of these slots.
 */
const imageColumns = [
  { table: 'places', column: 'cover_image_key' },
  { table: 'place_images', column: 'storage_key' },
  { table: 'category_types', column: 'image_key' },
  { table: 'home_content', column: 'hero_image_key' },
  { table: 'site_settings', column: 'logo_image_key' },
  { table: 'movies', column: 'poster_image_key' },
  { table: 'videos', column: 'thumbnail_key' },
  { table: 'rental_providers', column: 'logo_image_key' },
  { table: 'rental_vehicles', column: 'cover_image_key' },
  { table: 'rental_vehicle_images', column: 'storage_key' },
  { table: 'rental_drivers', column: 'photo_image_key' },
] as const

const imagePermissionModules: Record<(typeof imageColumns)[number]['table'], string> = {
  places: 'places',
  place_images: 'places',
  category_types: 'category_types',
  home_content: 'home',
  site_settings: 'settings',
  movies: 'movies',
  videos: 'videos',
  rental_providers: 'rentals',
  rental_vehicles: 'rentals',
  rental_vehicle_images: 'rentals',
  rental_drivers: 'rentals',
}

export async function allImageKeys() {
  const rows = await Promise.all(
    imageColumns.map(({ table, column }) =>
      db.from(table).whereNotNull(column).select(`${column} as key`)
    )
  )
  return new Set<string>(rows.flat().map((row) => String(row.key)))
}

/** True when any record owns the key, regardless of publication state. */
export async function isReferencedImage(key: string) {
  for (const { table, column } of imageColumns) {
    if (await db.from(table).where(column, key).first()) return true
  }
  return false
}

/** Return the permission modules that actually own this private image key. */
export async function referencedImageModules(key: string) {
  const modules = new Set<string>()
  for (const { table, column } of imageColumns) {
    if (await db.from(table).where(column, key).first()) {
      modules.add(imagePermissionModules[table])
    }
  }
  return modules
}

/** True when the key belongs to content that visitors are allowed to see. */
export async function isPublicImage(key: string) {
  return Boolean(
    (await db
      .from('places')
      .where('cover_image_key', key)
      .where('status', 'published')
      .where('published_at', '<=', new Date())
      .first()) ||
    (await db
      .from('place_images as pi')
      .join('places as p', 'p.id', 'pi.place_id')
      .where('pi.storage_key', key)
      .where('p.status', 'published')
      .where('p.published_at', '<=', new Date())
      .first()) ||
    (await db.from('category_types').where('image_key', key).first()) ||
    (await db.from('home_content').where('hero_image_key', key).first()) ||
    (await db.from('site_settings').where('logo_image_key', key).first()) ||
    (await db
      .from('videos')
      .where('thumbnail_key', key)
      .where('status', 'published')
      .where('published_at', '<=', new Date())
      .first()) ||
    (await db
      .from('rental_providers')
      .where('logo_image_key', key)
      .where('active', true)
      .first()) ||
    (await db
      .from('rental_vehicles')
      .where('cover_image_key', key)
      .where('status', 'published')
      .where('published_at', '<=', new Date())
      .first()) ||
    (await db
      .from('rental_vehicle_images as ri')
      .join('rental_vehicles as rv', 'rv.id', 'ri.vehicle_id')
      .where('ri.storage_key', key)
      .where('rv.status', 'published')
      .where('rv.published_at', '<=', new Date())
      .first()) ||
    // A driver's photo is shown to customers once the driver is assigned to a booking.
    (await db
      .from('rental_drivers as d')
      .join('rental_bookings as b', 'b.driver_id', 'd.id')
      .where('d.photo_image_key', key)
      .whereIn('b.status', ['confirmed', 'completed'])
      .first()) ||
    (await db
      .from('movies')
      .where('poster_image_key', key)
      .where('status', 'published')
      .where('published_at', '<=', new Date())
      .first())
  )
}
