import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ApiError } from './api_error.js'
import { assertPlaceType } from './category_type_service.js'
import { validateHours } from './explore_write_service.js'
import {
  MAX_GALLERY_IMAGES,
  deleteImages,
  withStoredImages,
  type PreparedImage,
} from './image_storage_service.js'

type PlaceInput = {
  type: string
  slug: string
  categoryId?: number | null
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
  featured_order?: number | null
  hours?: Array<{
    weekday: number
    intervalIndex: number
    opensAt?: string | null
    closesAt?: string | null
    closesNextDay?: boolean
    closed?: boolean
  }>
}

export type GalleryItemChange = {
  id: number
  altEn?: string | null
  altAr?: string | null
  captionEn?: string | null
  captionAr?: string | null
  sortOrder?: number
  remove?: boolean
}

/**
 * Image changes that accompany a place write. `cover` replaces or removes the
 * cover, `galleryAdd` appends new gallery images and `galleryItems` edits or
 * removes existing gallery images of this place.
 */
export type PlaceImageChanges = {
  cover?: PreparedImage | 'remove'
  galleryAdd?: PreparedImage[]
  galleryAltEn?: string | null
  /** Optional sort positions for `galleryAdd`, in the same order. */
  galleryAddOrder?: number[]
  galleryItems?: GalleryItemChange[]
}

async function validatePlace(input: PlaceInput) {
  await assertPlaceType(input.type)
  if (
    input.featured !== undefined &&
    input.featured_order !== undefined &&
    input.featured !== (input.featured_order !== null)
  ) {
    throw new ApiError(422, 'INVALID_FEATURED', 'Featured selection and order must agree')
  }
  if (input.categoryId) {
    const category = await db.from('categories').where('id', input.categoryId).first()
    if (!category || category.type !== input.type) {
      throw new ApiError(422, 'INVALID_CATEGORY', 'Category must belong to this place type')
    }
  }
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
  if (input.websiteUrl) {
    try {
      const parsed = new URL(input.websiteUrl)
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new ApiError(422, 'INVALID_URL', 'Website URL must use HTTP or HTTPS')
      }
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(422, 'INVALID_URL', 'Website URL must be a valid HTTP or HTTPS address')
    }
  }
  const hours = input.hours ?? []
  validateHours(
    hours.map((h) => ({
      weekday: h.weekday,
      interval_index: h.intervalIndex,
      opens_at: h.opensAt ?? null,
      closes_at: h.closesAt ?? null,
      closed: h.closed ?? false,
      closes_next_day: h.closesNextDay ?? false,
    }))
  )
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

function newImages(changes: PlaceImageChanges) {
  return [
    ...(changes.cover && changes.cover !== 'remove' ? [changes.cover] : []),
    ...(changes.galleryAdd ?? []),
  ]
}

/** Splits stored keys into the cover and gallery parts and resolves the final cover. */
function resolveCover(
  currentCover: string | null,
  changes: PlaceImageChanges,
  keys: string[],
  released: string[]
) {
  const hasNewCover = Boolean(changes.cover && changes.cover !== 'remove')
  const coverKey = hasNewCover ? keys[0] : changes.cover === 'remove' ? null : currentCover
  if (currentCover && currentCover !== coverKey) released.push(currentCover)
  return { coverKey, galleryKeys: keys.slice(hasNewCover ? 1 : 0) }
}

async function applyGalleryChanges(
  trx: TransactionClientContract,
  placeId: number,
  changes: PlaceImageChanges,
  newKeys: string[],
  defaultAlt: string,
  released: string[]
) {
  const items = changes.galleryItems ?? []
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new ApiError(422, 'INVALID_GALLERY_ITEM', 'Each gallery image can only be changed once')
  }
  const rows = await trx.from('place_images').where('place_id', placeId).select('id', 'storage_key')
  const byId = new Map(rows.map((row) => [Number(row.id), row]))
  let remaining = rows.length
  for (const item of items) {
    const row = byId.get(item.id)
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Gallery image not found')
    if (item.remove) {
      await trx.from('place_images').where('id', item.id).delete()
      released.push(row.storage_key)
      remaining--
      continue
    }
    const update: Record<string, unknown> = {}
    if (item.altEn !== undefined) update.alt_en = item.altEn || defaultAlt
    if (item.altAr !== undefined) update.alt_ar = item.altAr || null
    if (item.captionEn !== undefined) update.caption_en = item.captionEn || null
    if (item.captionAr !== undefined) update.caption_ar = item.captionAr || null
    if (item.sortOrder !== undefined) update.sort_order = item.sortOrder
    if (Object.keys(update).length) {
      await trx.from('place_images').where('id', item.id).update(update)
    }
  }
  if (remaining + newKeys.length > MAX_GALLERY_IMAGES) {
    throw new ApiError(
      422,
      'GALLERY_FULL',
      `A place can have up to ${MAX_GALLERY_IMAGES} gallery images`
    )
  }
  if (!newKeys.length) return
  const last = await trx
    .from('place_images')
    .where('place_id', placeId)
    .max('sort_order as max')
    .first()
  const start = last?.max === null || last?.max === undefined ? 0 : Number(last.max) + 1
  await trx.table('place_images').insert(
    newKeys.map((key, index) => ({
      place_id: placeId,
      storage_key: key,
      alt_en: changes.galleryAltEn || defaultAlt,
      sort_order: changes.galleryAddOrder?.[index] ?? start + index,
      created_at: new Date(),
    }))
  )
}

export async function savePlace(
  input: PlaceInput,
  actorId: number,
  id?: number,
  options: { publish?: boolean; deactivate?: boolean; images?: PlaceImageChanges } = {}
) {
  await validatePlace(input)
  const changes = options.images ?? {}
  return withStoredImages(newImages(changes), async (keys) => {
    const released: string[] = []
    const result = await db.transaction(async (trx) => {
      const existing = id ? await trx.from('places').where('id', id).forUpdate().first() : null
      if (id && !existing) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
      if (existing && existing.type !== input.type) {
        const assigned = await trx.from('place_feature_assignments').where('place_id', id!).first()
        const showtime = await trx.from('theater_showtimes').where('place_id', id!).first()
        const homeCard = await trx.from('home_explore_cards').where('place_id', id!).first()
        if (
          assigned ||
          showtime ||
          (homeCard &&
            !['attraction', 'restaurant', 'hotel_resort', 'theater'].includes(input.type)) ||
          existing.check_in_time ||
          existing.check_out_time ||
          existing.screen_count
        ) {
          throw new ApiError(
            409,
            'PLACE_TYPE_IN_USE',
            'Clear incompatible Explore features, home cards, stay/theater details and showtimes before changing the place type'
          )
        }
      }
      const { coverKey, galleryKeys } = resolveCover(
        existing?.cover_image_key ?? null,
        changes,
        keys,
        released
      )
      const coverWasRemoved = Boolean(existing?.cover_image_key && !coverKey)
      const removingCoverWhilePublished = Boolean(
        changes.cover === 'remove' && existing?.status === 'published' && !options.deactivate
      )
      if (removingCoverWhilePublished || (coverWasRemoved && !options.deactivate)) {
        throw new ApiError(422, 'COVER_REQUIRED', 'Published places need a cover image')
      }
      const fields = {
        type: input.type,
        slug: input.slug,
        category_id: input.categoryId ?? null,
        cover_image_key: coverKey,
        price_mode: input.priceMode ?? 'unknown',
        price_amount: input.priceAmount ?? null,
        price_currency: 'KWD',
        website_url: input.websiteUrl ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        featured_order:
          input.featured_order !== undefined
            ? input.featured_order
            : input.featured === undefined
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
        await trx
          .from('place_translations')
          .where('place_id', placeId)
          .where('locale', 'ar')
          .delete()
      }
      await applyGalleryChanges(trx, placeId, changes, galleryKeys, input.titleEn, released)
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
        if (!coverKey || !input.titleEn || !input.summaryEn || !input.addressEn) {
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
      } else if (options.deactivate && existing?.status === 'published') {
        await trx.from('places').where('id', placeId).update({
          status: 'archived',
          published_at: null,
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
      } else if (options.deactivate && existing?.status === 'published') {
        await trx.table('audit_logs').insert({
          actor_id: actorId,
          action: 'place.archived',
          entity_type: 'place',
          entity_id: String(placeId),
          created_at: new Date(),
        })
      }
      return placeId
    })
    return { result, released }
  })
}

/** Changes only the images of an existing place (used by the admin image endpoints). */
export async function updatePlaceImages(id: number, changes: PlaceImageChanges, actorId: number) {
  await withStoredImages(newImages(changes), async (keys) => {
    const released: string[] = []
    await db.transaction(async (trx) => {
      const place = await trx.from('places').where('id', id).forUpdate().first()
      if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
      const { coverKey, galleryKeys } = resolveCover(place.cover_image_key, changes, keys, released)
      if (place.status === 'published' && !coverKey) {
        throw new ApiError(422, 'COVER_REQUIRED', 'Published places need a cover image')
      }
      const en = await trx
        .from('place_translations')
        .where('place_id', id)
        .where('locale', 'en')
        .first()
      await applyGalleryChanges(trx, id, changes, galleryKeys, en?.title ?? place.slug, released)
      await trx
        .from('places')
        .where('id', id)
        .update({ cover_image_key: coverKey, updated_at: new Date() })
      await trx.table('audit_logs').insert({
        actor_id: actorId,
        action: 'place.images.updated',
        entity_type: 'place',
        entity_id: String(id),
        created_at: new Date(),
      })
    })
    return { result: undefined, released }
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
      if (!place.cover_image_key || !en?.title || !en.summary || !en.address) {
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
  const released = await db.transaction(async (trx) => {
    const place = await trx.from('places').where('id', id).forUpdate().first()
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    const homeCard = await trx.from('home_explore_cards').where('place_id', id).first()
    if (homeCard)
      throw new ApiError(
        409,
        'HOME_CARD_IN_USE',
        'Remove this venue from Home Explore cards before deleting it'
      )
    const gallery = await trx.from('place_images').where('place_id', id).select('storage_key')
    await trx.from('places').where('id', id).delete()
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'place.deleted',
      entity_type: 'place',
      entity_id: String(id),
      created_at: new Date(),
    })
    return [place.cover_image_key, ...gallery.map((row) => row.storage_key)]
  })
  await deleteImages(released)
}
