import { iso, type Row } from './customer.js'

export function homeContent(row: Row) {
  return {
    locale: row.locale,
    hero_eyebrow: row.hero_eyebrow,
    hero_title: row.hero_title,
    hero_image_key: row.hero_image_key ?? null,
    discovery_eyebrow: row.discovery_eyebrow ?? 'EVERYTHING IN ONE PLACE',
    discovery_title: row.discovery_title,
    discovery_description:
      row.discovery_description ??
      'Start with a ride, then make the city yours. Find the best of Kuwait by category.',
    app_title: row.app_title ?? null,
    app_body: row.app_body ?? null,
    updated_at: iso(row.updated_at),
  }
}

export function homeExploreCard(row: Row) {
  return {
    id: Number(row.id),
    place_id: Number(row.place_id),
    caption_en: row.caption_en ?? null,
    caption_ar: row.caption_ar ?? null,
    sort_order: Number(row.sort_order),
    active: Boolean(row.active),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}
