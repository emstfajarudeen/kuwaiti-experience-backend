import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { ApiError } from './api_error.js'
import * as serialize from '../serializers/explore.js'
import type { Row } from '../serializers/customer.js'
import { publicImageUrl, adminApiImageUrl } from './image_storage_service.js'
import { assertPlaceType } from './category_type_service.js'
import { openNow, openNowSql } from './explore_hours.js'

export function positiveId(value: unknown) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(404, 'NOT_FOUND', 'Record not found')
  return id
}

export function pagination(input: Row) {
  const page = Number(input.page ?? 1)
  const perPage = Number(input.per_page ?? 12)
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !Number.isInteger(perPage) ||
    perPage < 1 ||
    perPage > 50
  ) {
    throw new ApiError(422, 'INVALID_PAGINATION', 'Invalid page or page size')
  }
  return { page, perPage }
}

function visibility(query: ReturnType<typeof db.from>, alias: string) {
  return query
    .where(`${alias}.status`, 'published')
    .where(`${alias}.published_at`, '<=', new Date())
}

export async function exploreHub() {
  const rows = await db.from('category_types').orderBy('sort_order').orderBy('code')
  return {
    data: { category_types: rows.map(serialize.categoryType) },
    meta: { images: imageLinks(rows.map((r) => r.image_key)) },
  }
}

export async function categories(type: unknown) {
  const code = await assertPlaceType(type)
  const rows = await db
    .from('categories')
    .where('type', code)
    .where('active', true)
    .orderBy('sort_order')
    .orderBy('id')
  const translations = rows.length
    ? await db
        .from('category_translations')
        .whereIn(
          'category_id',
          rows.map((r) => r.id)
        )
        .orderBy('locale')
    : []
  return {
    data: rows.map((r) =>
      serialize.category(
        r,
        translations.filter((t) => t.category_id === r.id)
      )
    ),
  }
}

export async function features(type?: unknown, admin = false) {
  const query = db.from('place_features').orderBy('sort_order').orderBy('id')
  if (!admin || type !== undefined) query.where('type', await assertPlaceType(type))
  if (!admin) query.where('active', true)
  const rows = await query.limit(1000)
  return { data: rows.map(serialize.feature) }
}

export function imageLinks(keys: Array<string | null | undefined>, admin = false) {
  const url = admin ? adminApiImageUrl : publicImageUrl
  return [...new Set(keys.filter((key): key is string => Boolean(key)))].map((storage_key) => ({
    storage_key,
    url: url(storage_key),
  }))
}

/** Load each relation once per page. Every endpoint uses this exact Place serializer. */
export async function hydratePlaces(
  rows: Row[],
  customerId?: number,
  admin = false,
  at = DateTime.now()
) {
  const ids = rows.map((r) => Number(r.id))
  if (!ids.length)
    return { data: [], meta: { viewer: [], images: [], evaluated_at: at.toUTC().toISO() } }
  const [translations, hours, images, assigned, saves] = await Promise.all([
    db.from('place_translations').whereIn('place_id', ids).orderBy('locale'),
    db.from('place_hours').whereIn('place_id', ids).orderBy('weekday').orderBy('interval_index'),
    db.from('place_images').whereIn('place_id', ids).orderBy('sort_order').orderBy('id'),
    db
      .from('place_feature_assignments as a')
      .join('place_features as f', 'f.id', 'a.feature_id')
      .whereIn('a.place_id', ids)
      .select('f.*', 'a.place_id')
      .orderBy('f.sort_order')
      .orderBy('f.id'),
    customerId
      ? db.from('customer_saved_places').where('customer_id', customerId).whereIn('place_id', ids)
      : Promise.resolve([]),
  ])
  const saved = new Set(saves.map((s) => Number(s.place_id)))
  const data = rows.map((r) =>
    serialize.place(
      r,
      translations.filter((t) => Number(t.place_id) === Number(r.id)),
      hours.filter((h) => Number(h.place_id) === Number(r.id)),
      images.filter((i) => Number(i.place_id) === Number(r.id)),
      assigned.filter((f) => Number(f.place_id) === Number(r.id) && (admin || f.active))
    )
  )
  return {
    data,
    meta: {
      viewer: data.map((p) => ({
        place_id: p.id,
        saved: saved.has(p.id),
        open_now: openNow(p.place_hours, at),
      })),
      images: imageLinks(
        [...rows.map((r) => r.cover_image_key), ...images.map((i) => i.storage_key)],
        admin
      ),
      evaluated_at: at.toUTC().toISO(),
    },
  }
}

export async function places(input: Row, customerId?: number, admin = false, savedOnly = false) {
  const { page, perPage } = pagination(input)
  const at = DateTime.now()
  const query = db.from('places as p').select('p.*')
  if (!admin) visibility(query, 'p')
  if ((!admin && !savedOnly) || input.type !== undefined)
    query.where('p.type', await assertPlaceType(input.type))
  for (const key of ['category', 'feature', 'q']) {
    if (
      input[key] !== undefined &&
      (typeof input[key] !== 'string' || input[key].length > (key === 'q' ? 80 : 120))
    )
      throw new ApiError(422, 'INVALID_FILTER', 'Invalid filter')
  }
  if (input.category && input.category !== 'all') {
    query.whereExists(
      db
        .from('categories as c')
        .whereColumn('c.id', 'p.category_id')
        .whereColumn('c.type', 'p.type')
        .where('c.slug', input.category)
        .where('c.active', true)
    )
  }
  if (input.feature) {
    query.whereExists(
      db
        .from('place_feature_assignments as a')
        .join('place_features as f', 'f.id', 'a.feature_id')
        .whereColumn('a.place_id', 'p.id')
        .whereColumn('f.type', 'p.type')
        .where('f.code', input.feature)
        .where('f.active', true)
    )
  }
  if (input.q?.trim()) {
    const term = `%${input.q.trim().replace(/[\\%_]/g, '\\$&')}%`
    query.whereExists(
      db
        .from('place_translations as t')
        .whereColumn('t.place_id', 'p.id')
        .where((builder) =>
          builder.where('t.title', 'like', term).orWhere('t.summary', 'like', term)
        )
    )
  }
  if (input.open_now !== undefined) {
    if (!['true', 'false'].includes(String(input.open_now)))
      throw new ApiError(422, 'INVALID_FILTER', 'open_now must be true or false')
    if (String(input.open_now) === 'true') {
      const predicate = openNowSql(at)
      query.whereRaw(predicate.sql, predicate.bindings)
    }
  }
  if (savedOnly)
    query
      .join('customer_saved_places as s', 's.place_id', 'p.id')
      .where('s.customer_id', customerId!)
  const count = await query.clone().clearSelect().count('* as total').first()
  const total = Number(count?.total ?? 0)
  if (savedOnly) query.orderBy('s.created_at', 'desc')
  else query.orderByRaw('p.featured_order IS NULL ASC').orderBy('p.featured_order')
  const rows = await query
    .orderBy('p.id')
    .limit(perPage)
    .offset((page - 1) * perPage)
  const result = await hydratePlaces(rows, customerId, admin, at)
  return {
    data: result.data,
    meta: {
      ...result.meta,
      page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
    },
  }
}

export async function showPlace(value: string | number, customerId?: number, admin = false) {
  const query = db.from('places as p').where(typeof value === 'number' ? 'p.id' : 'p.slug', value)
  if (!admin) visibility(query, 'p')
  const row = await query.first()
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
  const result = await hydratePlaces([row], customerId, admin)
  return { data: result.data[0], meta: result.meta }
}

export async function movies(input: Row) {
  const { page, perPage } = pagination(input)
  const count = await db.from('movies').count('* as total').first()
  const total = Number(count?.total ?? 0)
  const rows = await db
    .from('movies')
    .orderBy('id', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage)
  return {
    data: rows.map(serialize.movie),
    meta: {
      images: imageLinks(
        rows.map((r) => r.poster_image_key),
        true
      ),
      page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
    },
  }
}

export async function showtimes(input: Row, slug?: string) {
  const { page, perPage } = pagination(input)
  const query = db.from('theater_showtimes as s').select('s.*')
  let date: DateTime | undefined
  if (slug !== undefined) {
    const place = await showPlace(slug)
    if (place.data.type !== 'theater') throw new ApiError(404, 'NOT_FOUND', 'Theater not found')
    const rawDate = input.date ?? DateTime.now().setZone('Asia/Kuwait').toISODate()
    if (typeof rawDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate))
      throw new ApiError(422, 'INVALID_DATE', 'Use a Kuwait calendar date YYYY-MM-DD')
    date = DateTime.fromISO(rawDate, { zone: 'Asia/Kuwait' })
    if (!date.isValid) throw new ApiError(422, 'INVALID_DATE', 'Invalid calendar date')
    query
      .join('movies as m', 'm.id', 's.movie_id')
      .where('s.place_id', place.data.id)
      .where('s.status', 'published')
      .where('m.status', 'published')
      .where('m.published_at', '<=', new Date())
      .where('s.starts_at', '>=', date.toUTC().toJSDate())
      .where('s.starts_at', '<', date.plus({ days: 1 }).toUTC().toJSDate())
      .where('s.starts_at', '>=', new Date())
  } else if (input.place_id !== undefined) query.where('s.place_id', positiveId(input.place_id))
  const count = await query.clone().clearSelect().count('* as total').first()
  const total = Number(count?.total ?? 0)
  const rows = await query
    .orderBy('s.starts_at')
    .orderBy('s.id')
    .limit(perPage)
    .offset((page - 1) * perPage)
  const movieIds = [...new Set(rows.map((r) => Number(r.movie_id)))]
  const related = movieIds.length
    ? await db.from('movies').whereIn('id', movieIds).orderBy('id')
    : []
  return {
    data: rows.map(serialize.showtime),
    included: { movies: related.map(serialize.movie) },
    meta: {
      images: imageLinks(
        related.map((r) => r.poster_image_key),
        slug === undefined
      ),
      date: date?.toISODate() ?? null,
      timezone: 'Asia/Kuwait',
      page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
    },
  }
}
