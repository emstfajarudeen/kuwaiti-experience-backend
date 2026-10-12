import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'
import { assertPlaceType } from './category_type_service.js'

type PlaceInput = {
  type: string
  slug: string
  categoryId?: number | null
  coverMediaId?: number | null
  titleEn: string
  summaryEn: string
  addressEn: string
  bodyEn?: string | null
  hoursNoteEn?: string | null
  priceUnitEn?: string | null
  seoTitleEn?: string | null
  seoDescriptionEn?: string | null
  titleAr?: string | null
  summaryAr?: string | null
  addressAr?: string | null
  bodyAr?: string | null
  priceMode?: 'unknown' | 'free' | 'from' | 'fixed'
  priceAmount?: string | null
  websiteUrl?: string | null
  latitude?: number | null
  longitude?: number | null
  featured?: boolean
  galleryIds?: number[]
  hours?: Array<{
    weekday: number
    intervalIndex: number
    opensAt?: string | null
    closesAt?: string | null
    closesNextDay?: boolean
    closed?: boolean
  }>
}

async function requireMedia(ids: number[]) {
  if (!ids.length) return
  const unique = [...new Set(ids)]
  if (unique.length !== ids.length || unique.length > 20) {
    throw new ApiError(422, 'INVALID_MEDIA', 'Choose up to 20 distinct images')
  }
  const rows = await db.from('media').whereIn('id', unique).select('id')
  if (rows.length !== unique.length) throw new ApiError(422, 'INVALID_MEDIA', 'Image not found')
}

async function validatePlace(input: PlaceInput) {
  await assertPlaceType(input.type)
  if (input.categoryId) {
    const category = await db.from('categories').where('id', input.categoryId).first()
    if (!category || category.type !== input.type) {
      throw new ApiError(422, 'INVALID_CATEGORY', 'Category must belong to this place type')
    }
  }
  const galleryIds = input.galleryIds ?? []
  if (galleryIds.length > 20 || new Set(galleryIds).size !== galleryIds.length) {
    throw new ApiError(422, 'INVALID_MEDIA', 'Choose up to 20 distinct gallery images')
  }
  await requireMedia([
    ...new Set([...(input.coverMediaId ? [input.coverMediaId] : []), ...galleryIds]),
  ])
  const arabicFields = [input.titleAr, input.summaryAr, input.addressAr]
  if (arabicFields.some(Boolean) && !arabicFields.every(Boolean)) {
    throw new ApiError(422, 'INCOMPLETE_ARABIC', 'Enter Arabic title, summary and address together')
  }
  if (input.priceMode === 'free' && input.priceAmount) {
    throw new ApiError(422, 'INVALID_PRICE', 'Free places cannot have a price amount')
  }
  if ((input.priceMode === 'fixed' || input.priceMode === 'from') && !input.priceAmount) {
    throw new ApiError(422, 'INVALID_PRICE', 'Enter a KWD price amount')
  }
  if (
    (input.latitude === null) !== (input.longitude === null) &&
    (input.latitude !== undefined || input.longitude !== undefined)
  ) {
    throw new ApiError(422, 'INVALID_COORDINATES', 'Enter both latitude and longitude')
  }
  if (input.websiteUrl && !['https:', 'http:'].includes(new URL(input.websiteUrl).protocol)) {
    throw new ApiError(422, 'INVALID_URL', 'Website URL must use HTTP or HTTPS')
  }
  const hours = input.hours ?? []
  const slots = new Set<string>()
  for (const hour of hours) {
    const key = `${hour.weekday}:${hour.intervalIndex}`
    if (
      slots.has(key) ||
      (hour.closed ? Boolean(hour.opensAt || hour.closesAt) : !hour.opensAt || !hour.closesAt)
    ) {
      throw new ApiError(
        422,
        'INVALID_HOURS',
        'Opening hours contain a duplicate or incomplete interval'
      )
    }
    slots.add(key)
  }
}

export async function savePlace(
  input: PlaceInput,
  actorId: number,
  id?: number,
  options: { publish?: boolean } = {}
) {
  await validatePlace(input)
  return db.transaction(async (trx) => {
    const existing = id ? await trx.from('places').where('id', id).forUpdate().first() : null
    if (id && !existing) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    if (existing?.status === 'published' && !input.coverMediaId) {
      throw new ApiError(422, 'COVER_REQUIRED', 'Published places need a cover image')
    }
    const fields = {
      type: input.type,
      slug: input.slug,
      category_id: input.categoryId ?? null,
      cover_media_id: input.coverMediaId ?? null,
      price_mode: input.priceMode ?? 'unknown',
      price_amount: input.priceAmount ?? null,
      price_currency: 'KWD',
      website_url: input.websiteUrl ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      featured_order:
        input.featured === undefined
          ? (existing?.featured_order ?? null)
          : input.featured
            ? (existing?.featured_order ?? 0)
            : null,
      updated_at: new Date(),
    }
    let placeId = id
    if (id) {
      await trx.from('places').where('id', id).update(fields)
    } else {
      const [createdId] = await trx
        .table('places')
        .insert({ ...fields, status: 'draft', created_at: new Date() })
      placeId = createdId
    }
    if (!placeId) throw new ApiError(500, 'WRITE_FAILED', 'Place could not be saved')
    await trx
      .table('place_translations')
      .insert({
        place_id: placeId,
        locale: 'en',
        title: input.titleEn,
        summary: input.summaryEn,
        address: input.addressEn,
        body: input.bodyEn ?? null,
        hours_note: input.hoursNoteEn ?? null,
        price_unit: input.priceUnitEn ?? null,
        seo_title: input.seoTitleEn ?? null,
        seo_description: input.seoDescriptionEn ?? null,
      })
      .onConflict(['place_id', 'locale'])
      .merge()
    if (input.titleAr && input.summaryAr && input.addressAr) {
      await trx
        .table('place_translations')
        .insert({
          place_id: placeId,
          locale: 'ar',
          title: input.titleAr,
          summary: input.summaryAr,
          address: input.addressAr,
          body: input.bodyAr ?? null,
        })
        .onConflict(['place_id', 'locale'])
        .merge()
    } else if (id) {
      await trx.from('place_translations').where('place_id', placeId).where('locale', 'ar').delete()
    }
    if (input.galleryIds !== undefined) {
      await trx.from('place_media').where('place_id', placeId).delete()
      if (input.galleryIds.length)
        await trx.table('place_media').insert(
          input.galleryIds.map((mediaId, sortOrder) => ({
            place_id: placeId,
            media_id: mediaId,
            sort_order: sortOrder,
          }))
        )
    }
    if (input.hours !== undefined) {
      await trx.from('place_hours').where('place_id', placeId).delete()
      if (input.hours.length)
        await trx.table('place_hours').insert(
          input.hours.map((hour) => ({
            place_id: placeId,
            weekday: hour.weekday,
            interval_index: hour.intervalIndex,
            opens_at: hour.opensAt ?? null,
            closes_at: hour.closesAt ?? null,
            closes_next_day: hour.closesNextDay ?? false,
            closed: hour.closed ?? false,
          }))
        )
    }
    if (options.publish) {
      if (!input.coverMediaId || !input.titleEn || !input.summaryEn || !input.addressEn) {
        throw new ApiError(
          422,
          'INCOMPLETE_PLACE',
          'Add English details and a cover image before publishing'
        )
      }
      await trx.from('places').where('id', placeId).update({
        status: 'published',
        published_at: new Date(),
        updated_at: new Date(),
      })
    }
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: id ? 'place.updated' : 'place.created',
      entity_type: 'place',
      entity_id: String(placeId),
      created_at: new Date(),
    })
    if (options.publish) {
      await trx.table('audit_logs').insert({
        actor_id: actorId,
        action: 'place.published',
        entity_type: 'place',
        entity_id: String(placeId),
        created_at: new Date(),
      })
    }
    return placeId
  })
}

export async function setPlaceStatus(
  id: number,
  status: 'published' | 'archived',
  actorId: number
) {
  return db.transaction(async (trx) => {
    const place = await trx.from('places').where('id', id).forUpdate().first()
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    if (status === 'published') {
      const en = await trx
        .from('place_translations')
        .where('place_id', id)
        .where('locale', 'en')
        .first()
      if (!place.cover_media_id || !en?.title || !en.summary || !en.address) {
        throw new ApiError(
          422,
          'INCOMPLETE_PLACE',
          'Add English details and a cover image before publishing'
        )
      }
    }
    await trx
      .from('places')
      .where('id', id)
      .update({
        status,
        published_at: status === 'published' ? new Date() : null,
        updated_at: new Date(),
      })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: `place.${status}`,
      entity_type: 'place',
      entity_id: String(id),
      created_at: new Date(),
    })
  })
}

export async function deletePlace(id: number, actorId: number) {
  await db.transaction(async (trx) => {
    const count = await trx.from('places').where('id', id).delete()
    if (!count) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'place.deleted',
      entity_type: 'place',
      entity_id: String(id),
      created_at: new Date(),
    })
  })
}
