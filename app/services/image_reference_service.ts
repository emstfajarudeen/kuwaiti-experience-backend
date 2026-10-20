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
] as const

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

/** True when the key belongs to content that visitors are allowed to see. */
export async function isPublicImage(key: string) {
  return Boolean(
    (await db
      .from('places')
      .where('cover_image_key', key)
      .where('status', 'published')
      .where('published_at', '<=', db.raw('CURRENT_TIMESTAMP'))
      .first()) ||
    (await db
      .from('place_images as pi')
      .join('places as p', 'p.id', 'pi.place_id')
      .where('pi.storage_key', key)
      .where('p.status', 'published')
      .where('p.published_at', '<=', db.raw('CURRENT_TIMESTAMP'))
      .first()) ||
    (await db.from('category_types').where('image_key', key).first()) ||
    (await db.from('home_content').where('hero_image_key', key).first()) ||
    (await db.from('site_settings').where('logo_image_key', key).first()) ||
    (await db
      .from('movies')
      .where('poster_image_key', key)
      .where('status', 'published')
      .where('published_at', '<=', db.raw('CURRENT_TIMESTAMP'))
      .first())
  )
}
