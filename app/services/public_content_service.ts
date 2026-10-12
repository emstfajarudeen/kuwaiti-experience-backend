import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { ApiError } from './api_error.js'
import { publicCategoryTypes } from './category_type_service.js'

export function localeFrom(value: unknown): 'en' | 'ar' {
  return value === 'ar' ? 'ar' : 'en'
}

function placeQuery(locale: 'en' | 'ar', publishedOnly = true) {
  const title = locale === 'ar' ? 'COALESCE(ar.title, en.title)' : 'en.title'
  const summary = locale === 'ar' ? 'COALESCE(ar.summary, en.summary)' : 'en.summary'
  const address = locale === 'ar' ? 'COALESCE(ar.address, en.address)' : 'en.address'
  const query = db
    .from('places as p')
    .join('place_translations as en', function () {
      this.on('en.place_id', '=', 'p.id').andOnVal('en.locale', '=', 'en')
    })
    .leftJoin('place_translations as ar', function () {
      this.on('ar.place_id', '=', 'p.id').andOnVal('ar.locale', '=', 'ar')
    })
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .select(
      'p.id',
      'p.slug',
      'p.type',
      'p.category_id',
      'p.cover_media_id',
      'p.featured_order',
      'c.slug as category_slug',
      db.raw(`${title} as title`),
      db.raw(`${summary} as summary`),
      db.raw(`${address} as address`)
    )
  if (publishedOnly)
    query.where('p.status', 'published').where('p.published_at', '<=', db.raw('CURRENT_TIMESTAMP'))
  return query
}

export function placeCard(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    category: row.category_slug,
    title: row.title,
    summary: row.summary,
    address: row.address,
    cover: row.cover_media_id
      ? { id: row.cover_media_id, url: `/api/v1/media/${row.cover_media_id}` }
      : null,
  }
}

export async function listPlaces(input: {
  type: string
  category?: string
  q?: string
  page: number
  perPage: number
  locale: 'en' | 'ar'
}) {
  const query = placeQuery(input.locale).where('p.type', input.type)
  if (input.category && input.category !== 'all')
    query.where('c.slug', input.category).where('c.active', true)
  if (input.q) {
    const q = input.q
      .trim()
      .slice(0, 80)
      .replace(/[\\%_]/g, '\\$&')
    query.where((builder) =>
      builder.whereLike('en.title', `%${q}%`).orWhereLike('en.summary', `%${q}%`)
    )
  }
  const count = await query.clone().clearSelect().count('* as total').first()
  const total = Number(count?.total ?? 0)
  const rows = await query
    .orderByRaw('p.featured_order IS NULL ASC')
    .orderBy('p.featured_order', 'asc')
    .orderBy('p.id', 'asc')
    .limit(input.perPage)
    .offset((input.page - 1) * input.perPage)
  return {
    data: rows.map(placeCard),
    meta: {
      page: input.page,
      perPage: input.perPage,
      total,
      lastPage: Math.max(1, Math.ceil(total / input.perPage)),
    },
  }
}

export async function showPlace(slug: string, locale: 'en' | 'ar', preview = false) {
  const card = await placeQuery(locale, !preview).where('p.slug', slug).first()
  if (!card) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
  const translation =
    (await db
      .from('place_translations')
      .where('place_id', card.id)
      .where('locale', locale)
      .first()) ??
    (await db.from('place_translations').where('place_id', card.id).where('locale', 'en').first())
  const place = await db.from('places').where('id', card.id).first()
  const gallery = await db
    .from('place_media as pm')
    .join('media as m', 'm.id', 'pm.media_id')
    .where('pm.place_id', card.id)
    .select('m.id', 'm.alt_en', 'm.alt_ar', 'pm.caption_en', 'pm.caption_ar')
    .orderBy('pm.sort_order')
    .orderBy('pm.id')
    .limit(20)
  const hours = await db
    .from('place_hours')
    .where('place_id', card.id)
    .select('weekday', 'opens_at', 'closes_at', 'closes_next_day', 'closed')
    .orderBy('weekday')
    .orderBy('interval_index')
  return {
    data: {
      ...placeCard(card),
      body: translation?.body ?? '',
      hoursNote: translation?.hours_note ?? null,
      price: {
        mode: place.price_mode,
        amount: place.price_amount === null ? null : Number(place.price_amount).toFixed(3),
        currency: place.price_currency,
        unit: translation?.price_unit ?? null,
      },
      coordinates:
        place.latitude === null
          ? null
          : {
              latitude: Number(place.latitude),
              longitude: Number(place.longitude),
            },
      hours,
      gallery: gallery.map((image) => ({
        id: image.id,
        url: `/api/v1/media/${image.id}`,
        alt: locale === 'ar' ? image.alt_ar || image.alt_en : image.alt_en,
        caption: locale === 'ar' ? image.caption_ar || image.caption_en : image.caption_en,
      })),
      seo: {
        title: translation?.seo_title ?? null,
        description: translation?.seo_description ?? null,
      },
      cabDestination: { placeId: card.id, name: card.title },
    },
  }
}

export async function listCategories(type: string, locale: 'en' | 'ar') {
  const rows = await db
    .from('categories as c')
    .join('category_translations as en', function () {
      this.on('en.category_id', '=', 'c.id').andOnVal('en.locale', '=', 'en')
    })
    .leftJoin('category_translations as ar', function () {
      this.on('ar.category_id', '=', 'c.id').andOnVal('ar.locale', '=', 'ar')
    })
    .where('c.type', type)
    .where('c.active', true)
    .select(
      'c.id',
      'c.slug',
      db.raw(locale === 'ar' ? 'COALESCE(ar.name,en.name) as name' : 'en.name as name')
    )
    .orderBy('c.sort_order')
    .orderBy('c.id')
  return {
    data: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
    })),
  }
}

export async function homeContent(locale: 'en' | 'ar') {
  const home =
    (await db.from('home_content').where('locale', locale).first()) ??
    (await db.from('home_content').where('locale', 'en').first())
  const categoryTypes = await publicCategoryTypes(locale)
  const codes = categoryTypes.map((type) => type.type)
  const featured = await Promise.all(
    codes.map(async (type) => {
      const rows = await placeQuery(locale)
        .where('p.type', type)
        .whereNotNull('p.featured_order')
        .orderBy('p.featured_order')
        .orderBy('p.id')
      return { type, places: rows.map(placeCard) }
    })
  )
  const settings = await publicSettings()
  return {
    data: {
      hero: {
        eyebrow: home?.hero_eyebrow ?? 'WELCOME TO KUWAIT',
        title: home?.hero_title ?? 'Explore Kuwait',
        image: home?.hero_media_id ? `/api/v1/media/${home.hero_media_id}` : null,
      },
      discoveryTitle: home?.discovery_title ?? 'What would you like to do?',
      categoryTypes,
      featured,
      app: {
        appStoreUrl: settings.data.appStoreUrl,
        playStoreUrl: settings.data.playStoreUrl,
      },
    },
  }
}

export async function publicSettings() {
  const row = await db.from('site_settings').where('id', 1).first()
  return {
    data: {
      brandName: row?.brand_name ?? 'The Kuwaiti Experience',
      contactEmail: row?.contact_email ?? null,
      whatsappAvailable: Boolean(row?.whatsapp_number),
      logo: row?.logo_media_id ? `/api/v1/media/${row.logo_media_id}` : null,
      appStoreUrl: row?.app_store_url ?? null,
      playStoreUrl: row?.play_store_url ?? null,
    },
  }
}

export async function showPage(slug: string, locale: 'en' | 'ar') {
  const row = await db
    .from('pages as p')
    .join('page_translations as en', function () {
      this.on('en.page_id', '=', 'p.id').andOnVal('en.locale', '=', 'en')
    })
    .leftJoin('page_translations as ar', function () {
      this.on('ar.page_id', '=', 'p.id').andOnVal('ar.locale', '=', 'ar')
    })
    .where('p.slug', slug)
    .where('p.status', 'published')
    .where('p.published_at', '<=', db.raw('CURRENT_TIMESTAMP'))
    .select(
      'p.slug',
      db.raw(locale === 'ar' ? 'COALESCE(ar.title,en.title) as title' : 'en.title as title'),
      db.raw(locale === 'ar' ? 'COALESCE(ar.body,en.body) as body' : 'en.body as body'),
      db.raw(
        locale === 'ar'
          ? 'COALESCE(ar.seo_title,en.seo_title) as seo_title'
          : 'en.seo_title as seo_title'
      ),
      db.raw(
        locale === 'ar'
          ? 'COALESCE(ar.seo_description,en.seo_description) as seo_description'
          : 'en.seo_description as seo_description'
      )
    )
    .first()
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Page not found')
  return {
    data: {
      slug: row.slug,
      title: row.title,
      body: row.body,
      seo: { title: row.seo_title, description: row.seo_description },
    },
  }
}

export async function transportLocations(locale: 'en' | 'ar') {
  const rows = await db
    .from('transport_locations as l')
    .join('transport_location_translations as en', function () {
      this.on('en.location_id', '=', 'l.id').andOnVal('en.locale', '=', 'en')
    })
    .leftJoin('transport_location_translations as ar', function () {
      this.on('ar.location_id', '=', 'l.id').andOnVal('ar.locale', '=', 'ar')
    })
    .where('l.active', true)
    .select(
      'l.id',
      'l.code',
      'l.pickup_enabled',
      'l.dropoff_enabled',
      db.raw(locale === 'ar' ? 'COALESCE(ar.name,en.name) as name' : 'en.name as name')
    )
    .orderBy('l.sort_order')
    .orderBy('l.id')
  return {
    data: rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      pickupEnabled: Boolean(r.pickup_enabled),
      dropoffEnabled: Boolean(r.dropoff_enabled),
    })),
  }
}

export async function transportEnquiry(pickupId: number, destinationId: number, dateTime: string) {
  if (pickupId === destinationId)
    throw new ApiError(422, 'SAME_LOCATION', 'Choose different locations')
  const when = DateTime.fromISO(dateTime, { zone: 'Asia/Kuwait' })
  const now = DateTime.now().setZone('Asia/Kuwait')
  if (!when.isValid || when <= now || when > now.plus({ years: 1 })) {
    throw new ApiError(422, 'INVALID_TIME', 'Choose a future date and time in Kuwait')
  }
  const locations = await db
    .from('transport_locations as l')
    .join('transport_location_translations as t', function () {
      this.on('t.location_id', '=', 'l.id').andOnVal('t.locale', '=', 'en')
    })
    .whereIn('l.id', [pickupId, destinationId])
    .select('l.id', 'l.active', 'l.pickup_enabled', 'l.dropoff_enabled', 't.name')
  const pickup = locations.find((r) => r.id === pickupId)
  const destination = locations.find((r) => r.id === destinationId)
  if (
    !pickup?.active ||
    !pickup.pickup_enabled ||
    !destination?.active ||
    !destination.dropoff_enabled
  ) {
    throw new ApiError(422, 'INVALID_LOCATION', 'Choose active pickup and destination locations')
  }
  const settings = await db.from('site_settings').where('id', 1).first()
  const phone = String(settings?.whatsapp_number ?? '').replace(/\D/g, '')
  if (!phone) throw new ApiError(503, 'ENQUIRIES_UNAVAILABLE', 'Cab enquiries are unavailable')
  const text = `Cab enquiry: ${pickup.name} to ${destination.name} on ${when.toFormat('dd LLL yyyy, h:mm a')} (Kuwait time). Please confirm availability.`
  return {
    data: { url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, confirmed: false },
  }
}
