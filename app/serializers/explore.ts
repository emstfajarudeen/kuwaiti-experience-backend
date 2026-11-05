import { iso, type Row } from './customer.js'

export const time = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value).slice(0, 8)
const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value)

export function categoryType(row: Row) {
  return {
    code: row.code,
    name_en: row.name_en,
    name_ar: row.name_ar ?? null,
    image_key: row.image_key ?? null,
    sort_order: Number(row.sort_order),
    updated_at: iso(row.updated_at),
  }
}

export function category(row: Row, translations: Row[]) {
  return {
    id: Number(row.id),
    type: row.type,
    slug: row.slug,
    sort_order: Number(row.sort_order),
    active: Boolean(row.active),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    category_translations: translations.map((t) => ({
      id: Number(t.id),
      category_id: Number(t.category_id),
      locale: t.locale,
      name: t.name,
    })),
  }
}

export function feature(row: Row) {
  return {
    id: Number(row.id),
    type: row.type,
    code: row.code,
    kind: row.kind,
    name_en: row.name_en,
    name_ar: row.name_ar ?? null,
    active: Boolean(row.active),
    sort_order: Number(row.sort_order),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}

export function place(row: Row, translations: Row[], images: Row[], features: Row[]) {
  return {
    id: Number(row.id),
    type: row.type,
    category_id: numberOrNull(row.category_id),
    slug: row.slug,
    status: row.status,
    cover_image_key: row.cover_image_key ?? null,
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    price_amount:
      row.price_amount === null || row.price_amount === undefined
        ? null
        : Number(row.price_amount).toFixed(3),
    price_currency: row.price_currency,
    price_mode: row.price_mode,
    website_url: row.website_url ?? null,
    featured_order: numberOrNull(row.featured_order),
    phone_e164: row.phone_e164 ?? null,
    check_in_time: time(row.check_in_time),
    check_out_time: time(row.check_out_time),
    screen_count: numberOrNull(row.screen_count),
    published_at: iso(row.published_at),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    place_translations: translations.map((t) => ({
      id: Number(t.id),
      place_id: Number(t.place_id),
      locale: t.locale,
      title: t.title,
      summary: t.summary,
      address: t.address,
      body: t.body ?? null,
      hours_note: t.hours_note ?? null,
      price_unit: t.price_unit ?? null,
      seo_title: t.seo_title ?? null,
      seo_description: t.seo_description ?? null,
    })),
    place_images: images.map((i) => ({
      id: Number(i.id),
      place_id: Number(i.place_id),
      storage_key: i.storage_key,
      alt_en: i.alt_en,
      alt_ar: i.alt_ar ?? null,
      caption_en: i.caption_en ?? null,
      caption_ar: i.caption_ar ?? null,
      sort_order: Number(i.sort_order),
      created_at: iso(i.created_at),
    })),
    place_features: features.map(feature),
  }
}

export function movie(row: Row) {
  return {
    id: Number(row.id),
    title_en: row.title_en,
    title_ar: row.title_ar ?? null,
    synopsis_en: row.synopsis_en ?? null,
    synopsis_ar: row.synopsis_ar ?? null,
    duration_minutes: numberOrNull(row.duration_minutes),
    age_rating: row.age_rating ?? null,
    poster_image_key: row.poster_image_key ?? null,
    status: row.status,
    published_at: iso(row.published_at),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}

export function showtime(row: Row) {
  return {
    id: Number(row.id),
    place_id: Number(row.place_id),
    movie_id: Number(row.movie_id),
    starts_at: iso(row.starts_at),
    format: row.format,
    status: row.status,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}
