import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { ApiError } from './api_error.js'
import { assertPlaceType } from './category_type_service.js'
import { deleteImages, withStoredImages, type PreparedImage } from './image_storage_service.js'
import type { Row } from '../serializers/customer.js'
import * as serialize from '../serializers/explore.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

async function audit(
  trx: TransactionClientContract,
  actorId: number,
  entity: string,
  id: number,
  action: string
) {
  await trx.table('audit_logs').insert({
    actor_id: actorId,
    action: `${entity}.${action}`,
    entity_type: entity,
    entity_id: String(id),
    created_at: new Date(),
  })
}

export function validateHours(hours: Row[]) {
  const slots = new Set<string>()
  const dayRows = new Map<number, Row[]>()
  const intervals: Array<[number, number]> = []
  const minutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5))
  for (const h of hours) {
    const key = `${h.weekday}:${h.interval_index}`
    const rows = dayRows.get(h.weekday) ?? []
    if (
      slots.has(key) ||
      (h.closed && (h.opens_at || h.closes_at || h.closes_next_day)) ||
      (!h.closed && (!h.opens_at || !h.closes_at))
    ) {
      throw new ApiError(
        422,
        'INVALID_HOURS',
        'Each interval needs distinct day/order and valid opening/closing times, or a closed day'
      )
    }
    slots.add(key)
    rows.push(h)
    dayRows.set(h.weekday, rows)
    if (!h.closed) {
      const start = minutes(h.opens_at)
      const end = minutes(h.closes_at)
      if (h.closes_next_day ? end > start : end <= start)
        throw new ApiError(
          422,
          'INVALID_HOURS',
          'Closing time must follow opening time; overnight intervals must end by the next opening clock time'
        )
      const absoluteStart = h.weekday * 1440 + start
      const absoluteEnd = h.weekday * 1440 + end + (h.closes_next_day ? 1440 : 0)
      intervals.push([absoluteStart, absoluteEnd])
    }
  }
  for (const rows of dayRows.values())
    if (rows.some((h) => h.closed) && rows.length > 1)
      throw new ApiError(422, 'INVALID_HOURS', 'A closed day cannot also contain opening intervals')
  const week = 7 * 1440
  for (let i = 0; i < intervals.length; i++)
    for (let j = i + 1; j < intervals.length; j++) {
      const [a, b] = intervals[i]
      const [c, d] = intervals[j]
      if ([0, week, -week].some((offset) => a < d + offset && c + offset < b))
        throw new ApiError(422, 'INVALID_HOURS', 'Opening intervals cannot overlap')
    }
}

export async function updatePlaceExplore(id: number, input: Row, actorId: number) {
  if (!Object.keys(input).length)
    throw new ApiError(422, 'EMPTY_UPDATE', 'Provide at least one field')
  if (input.place_hours) validateHours(input.place_hours)
  await db.transaction(async (trx) => {
    const place = await trx.from('places').where('id', id).forUpdate().first()
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    if (place.type !== 'hotel_resort' && (input.check_in_time || input.check_out_time))
      throw new ApiError(422, 'INVALID_PLACE_DETAILS', 'Check-in/out times apply only to stays')
    if (place.type !== 'theater' && input.screen_count !== null && input.screen_count !== undefined)
      throw new ApiError(422, 'INVALID_PLACE_DETAILS', 'Screen count applies only to theaters')
    if (input.feature_ids !== undefined) {
      const ids: number[] = input.feature_ids
      if (new Set(ids).size !== ids.length)
        throw new ApiError(422, 'INVALID_FEATURE', 'Feature IDs must be unique')
      const features = ids.length
        ? await trx.from('place_features').whereIn('id', ids).forUpdate()
        : []
      if (features.length !== ids.length || features.some((f) => f.type !== place.type))
        throw new ApiError(422, 'INVALID_FEATURE', 'Features must belong to this place type')
      await trx.from('place_feature_assignments').where('place_id', id).delete()
      if (ids.length)
        await trx
          .table('place_feature_assignments')
          .insert(ids.map((feature_id) => ({ place_id: id, feature_id })))
    }
    const fields: Row = { updated_at: new Date() }
    for (const key of ['phone_e164', 'check_in_time', 'check_out_time', 'screen_count'])
      if (input[key] !== undefined) fields[key] = input[key]
    await trx.from('places').where('id', id).update(fields)
    if (input.place_hours !== undefined) {
      await trx.from('place_hours').where('place_id', id).delete()
      if (input.place_hours.length)
        await trx.table('place_hours').insert(
          input.place_hours.map((h: Row) => ({
            place_id: id,
            weekday: h.weekday,
            interval_index: h.interval_index,
            opens_at: h.opens_at ?? null,
            closes_at: h.closes_at ?? null,
            closes_next_day: h.closes_next_day,
            closed: h.closed,
          }))
        )
    }
    await audit(trx, actorId, 'place.explore', id, 'updated')
  })
}

export async function saveFeature(input: Row, actorId: number, id?: number) {
  await assertPlaceType(input.type)
  const savedId = await db.transaction(async (trx) => {
    // Shared type lock bounds feature definitions and serializes type changes.
    await trx.from('category_types').where('code', input.type).forUpdate().first()
    const existing = id
      ? await trx.from('place_features').where('id', id).forUpdate().first()
      : null
    if (id && !existing) throw new ApiError(404, 'NOT_FOUND', 'Feature not found')
    if (
      existing &&
      existing.type !== input.type &&
      (await trx.from('place_feature_assignments').where('feature_id', id!).first())
    )
      throw new ApiError(409, 'FEATURE_IN_USE', 'Unassign this feature before changing its type')
    const duplicate = await trx
      .from('place_features')
      .where('type', input.type)
      .where('code', input.code)
      .first()
    if (duplicate && Number(duplicate.id) !== id)
      throw new ApiError(409, 'FEATURE_EXISTS', 'A feature with this code exists for the type')
    const count = await trx
      .from('place_features')
      .where('type', input.type)
      .count('* as total')
      .first()
    if ((!existing || existing.type !== input.type) && Number(count?.total) >= 500)
      throw new ApiError(422, 'FEATURE_LIMIT', 'A type can have up to 500 features')
    const fields = {
      type: input.type,
      code: input.code,
      kind: input.kind,
      name_en: input.name_en,
      name_ar: input.name_ar || null,
      active: input.active,
      sort_order: input.sort_order,
      updated_at: new Date(),
    }
    const inserted = id
      ? []
      : await trx.table('place_features').insert({ ...fields, created_at: new Date() })
    const result = id ?? inserted[0]
    if (id) await trx.from('place_features').where('id', id).update(fields)
    await audit(trx, actorId, 'place_feature', result, id ? 'updated' : 'created')
    return result
  })
  return {
    data: serialize.feature((await db.from('place_features').where('id', savedId).first())!),
  }
}

export async function deleteFeature(id: number, actorId: number) {
  await db.transaction(async (trx) => {
    if (!(await trx.from('place_features').where('id', id).forUpdate().first()))
      throw new ApiError(404, 'NOT_FOUND', 'Feature not found')
    if (await trx.from('place_feature_assignments').where('feature_id', id).first())
      throw new ApiError(409, 'FEATURE_IN_USE', 'Unassign the feature or mark it inactive')
    await trx.from('place_features').where('id', id).delete()
    await audit(trx, actorId, 'place_feature', id, 'deleted')
  })
}

export async function saveMovie(
  input: Row | null,
  actorId: number,
  id?: number,
  image?: PreparedImage | 'remove'
) {
  return withStoredImages(image && image !== 'remove' ? [image] : [], async ([key]) => {
    const released: string[] = []
    const savedId = await db.transaction(async (trx) => {
      const existing = id ? await trx.from('movies').where('id', id).forUpdate().first() : null
      if (id && !existing) throw new ApiError(404, 'NOT_FOUND', 'Movie not found')
      const details = input ?? existing
      if (!details) throw new ApiError(422, 'INVALID_MOVIE', 'Provide movie details')
      const poster = key ?? (image === 'remove' ? null : (existing?.poster_image_key ?? null))
      if (details.status === 'published' && !poster)
        throw new ApiError(422, 'POSTER_REQUIRED', 'Upload a poster before publishing a movie')
      if (existing?.poster_image_key && existing.poster_image_key !== poster)
        released.push(existing.poster_image_key)
      const fields = {
        title_en: details.title_en,
        title_ar: details.title_ar || null,
        synopsis_en: details.synopsis_en || null,
        synopsis_ar: details.synopsis_ar || null,
        duration_minutes: details.duration_minutes ?? null,
        age_rating: details.age_rating || null,
        poster_image_key: poster,
        status: details.status,
        published_at:
          details.status === 'published'
            ? (existing?.published_at ?? new Date())
            : (existing?.published_at ?? null),
        updated_at: new Date(),
      }
      const inserted = id
        ? []
        : await trx.table('movies').insert({ ...fields, created_at: new Date() })
      const result = id ?? inserted[0]
      if (id) await trx.from('movies').where('id', id).update(fields)
      await audit(trx, actorId, 'movie', result, id ? 'updated' : 'created')
      return result
    })
    return {
      result: { data: serialize.movie((await db.from('movies').where('id', savedId).first())!) },
      released,
    }
  })
}

export async function deleteMovie(id: number, actorId: number) {
  const key = await db.transaction(async (trx) => {
    const movie = await trx.from('movies').where('id', id).forUpdate().first()
    if (!movie) throw new ApiError(404, 'NOT_FOUND', 'Movie not found')
    if (await trx.from('theater_showtimes').where('movie_id', id).first())
      throw new ApiError(409, 'MOVIE_IN_USE', 'Remove showtimes first, or archive the movie')
    await trx.from('movies').where('id', id).delete()
    await audit(trx, actorId, 'movie', id, 'deleted')
    return movie.poster_image_key
  })
  await deleteImages([key])
}

export async function saveShowtime(input: Row, actorId: number, id?: number) {
  const starts = DateTime.fromISO(input.starts_at, { setZone: true })
  if (!starts.isValid)
    throw new ApiError(422, 'INVALID_TIME', 'Enter a valid timestamp with timezone')
  const savedId = await db.transaction(async (trx) => {
    const place = await trx.from('places').where('id', input.place_id).forUpdate().first()
    const movie = await trx.from('movies').where('id', input.movie_id).forUpdate().first()
    if (!place || place.type !== 'theater' || !movie)
      throw new ApiError(422, 'INVALID_SHOWTIME', 'Choose a theater and an existing movie')
    if (
      input.status === 'published' &&
      (movie.status !== 'published' || place.status !== 'published')
    )
      throw new ApiError(
        422,
        'INVALID_SHOWTIME',
        'Publish the theater and movie before publishing showtimes'
      )
    if (id && !(await trx.from('theater_showtimes').where('id', id).forUpdate().first()))
      throw new ApiError(404, 'NOT_FOUND', 'Showtime not found')
    const duplicate = await trx
      .from('theater_showtimes')
      .where({
        place_id: input.place_id,
        movie_id: input.movie_id,
        starts_at: starts.toUTC().toJSDate(),
        format: input.format,
      })
      .first()
    if (duplicate && Number(duplicate.id) !== id)
      throw new ApiError(409, 'SHOWTIME_EXISTS', 'This showtime already exists')
    const fields = {
      place_id: input.place_id,
      movie_id: input.movie_id,
      starts_at: starts.toUTC().toJSDate(),
      format: input.format,
      status: input.status,
      updated_at: new Date(),
    }
    const inserted = id
      ? []
      : await trx.table('theater_showtimes').insert({ ...fields, created_at: new Date() })
    const result = id ?? inserted[0]
    if (id) await trx.from('theater_showtimes').where('id', id).update(fields)
    await audit(trx, actorId, 'theater_showtime', result, id ? 'updated' : 'created')
    return result
  })
  return {
    data: serialize.showtime((await db.from('theater_showtimes').where('id', savedId).first())!),
  }
}

export async function deleteShowtime(id: number, actorId: number) {
  await db.transaction(async (trx) => {
    if (!(await trx.from('theater_showtimes').where('id', id).forUpdate().first()))
      throw new ApiError(404, 'NOT_FOUND', 'Showtime not found')
    await trx.from('theater_showtimes').where('id', id).delete()
    await audit(trx, actorId, 'theater_showtime', id, 'deleted')
  })
}

export async function savePlaceBookmark(customerId: number, placeId: number) {
  const row = await db.transaction(async (trx) => {
    if (!(await trx.from('customers').where('id', customerId).forUpdate().first()))
      throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
    const place = await trx
      .from('places')
      .where('id', placeId)
      .where('status', 'published')
      .where('published_at', '<=', new Date())
      .forUpdate()
      .first()
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    const existing = await trx
      .from('customer_saved_places')
      .where({ customer_id: customerId, place_id: placeId })
      .first()
    if (existing) return existing
    const saved = { customer_id: customerId, place_id: placeId, created_at: new Date() }
    await trx.table('customer_saved_places').insert(saved)
    return trx
      .from('customer_saved_places')
      .where({ customer_id: customerId, place_id: placeId })
      .firstOrFail()
  })
  return {
    data: {
      customer_id: Number(row.customer_id),
      place_id: Number(row.place_id),
      created_at: new Date(row.created_at).toISOString(),
    },
  }
}
