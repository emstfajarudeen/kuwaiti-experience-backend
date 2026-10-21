import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { ApiError } from './api_error.js'
import { hydratePlaces, imageLinks, pagination, positiveId } from './explore_read_service.js'
import * as explore from '../serializers/explore.js'
import * as home from '../serializers/home.js'
import type { Row } from '../serializers/customer.js'

export const HOME_TYPES = ['attraction', 'restaurant', 'hotel_resort', 'theater'] as const

export function homeLocale(value: unknown): 'en' | 'ar' {
  if (value === undefined || value === null || value === '') return 'en'
  if (value === 'en' || value === 'ar') return value
  throw new ApiError(422, 'INVALID_LOCALE', 'Choose English or Arabic')
}

export async function homePage(customerId?: number) {
  const at = DateTime.now()
  const [content, types] = await Promise.all([
    db.from('home_content').orderBy('locale'),
    db
      .from('category_types')
      .whereIn('code', [...HOME_TYPES])
      .orderBy('sort_order')
      .orderBy('code'),
  ])
  const codes = types.map((t) => String(t.code))
  const [featured, cards] = await Promise.all([
    Promise.all(
      codes.map((type) =>
        db
          .from('places')
          .where('type', type)
          .where('status', 'published')
          .where('published_at', '<=', at.toJSDate())
          .whereNotNull('featured_order')
          .orderBy('featured_order')
          .orderBy('id')
          .limit(9)
      )
    ),
    db
      .from('home_explore_cards as c')
      .join('places as p', 'p.id', 'c.place_id')
      .where('c.active', true)
      .whereIn('p.type', [...HOME_TYPES])
      .where('p.status', 'published')
      .where('p.published_at', '<=', at.toJSDate())
      .select('c.*')
      .orderBy('c.sort_order')
      .orderBy('c.id')
      .limit(8),
  ])
  const sections = codes.map((type, index) => ({
    type,
    place_ids: featured[index].slice(0, 8).map((p) => Number(p.id)),
    has_more: featured[index].length > 8,
  }))
  const selected = new Map<number, Row>()
  for (const group of featured)
    for (const row of group.slice(0, 8)) selected.set(Number(row.id), row)
  const missingIds = cards.map((card) => Number(card.place_id)).filter((id) => !selected.has(id))
  if (missingIds.length) {
    const extra = await db.from('places').whereIn('id', missingIds)
    for (const row of extra) selected.set(Number(row.id), row)
  }
  const places = await hydratePlaces([...selected.values()], customerId, false, at)
  const images = imageLinks([
    ...content.map((row) => row.hero_image_key),
    ...types.map((row) => row.image_key),
  ])
  return {
    data: {
      home_content: content.map(home.homeContent),
      category_types: types.map(explore.categoryType),
      home_explore_cards: cards.map(home.homeExploreCard),
      places: places.data,
    },
    meta: {
      home_sections: sections,
      viewer: places.meta.viewer,
      images: [
        ...images,
        ...places.meta.images.filter(
          (link) => !images.some((i) => i.storage_key === link.storage_key)
        ),
      ],
      evaluated_at: places.meta.evaluated_at,
    },
  }
}

export async function adminHome(value: unknown) {
  const locale = homeLocale(value)
  const row = await db.from('home_content').where('locale', locale).first()
  return {
    data: row ? home.homeContent(row) : null,
    meta: { images: imageLinks([row?.hero_image_key], true) },
  }
}

export async function adminCards(input: Row) {
  const { page, perPage } = pagination({ page: input.page, per_page: input.per_page ?? 20 })
  const count = await db.from('home_explore_cards').count('* as total').first()
  const total = Number(count?.total ?? 0)
  const rows = await db
    .from('home_explore_cards')
    .orderBy('sort_order')
    .orderBy('id')
    .limit(perPage)
    .offset((page - 1) * perPage)
  const places = rows.length
    ? await db.from('places').whereIn(
        'id',
        rows.map((r) => r.place_id)
      )
    : []
  const hydrated = await hydratePlaces(places, undefined, true)
  return {
    data: rows.map(home.homeExploreCard),
    included: { places: hydrated.data },
    meta: {
      ...hydrated.meta,
      page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
    },
  }
}

export async function adminCard(id: unknown) {
  const row = await db.from('home_explore_cards').where('id', positiveId(id)).first()
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Home Explore card not found')
  const place = await db.from('places').where('id', row.place_id).first()
  const hydrated = await hydratePlaces(place ? [place] : [], undefined, true)
  return {
    data: home.homeExploreCard(row),
    included: { places: hydrated.data },
    meta: hydrated.meta,
  }
}
