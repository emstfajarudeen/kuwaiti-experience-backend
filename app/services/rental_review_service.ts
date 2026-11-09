import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ApiError } from './api_error.js'
import { pagination, positiveId } from './explore_read_service.js'
import type { PublicLocale } from './public_localization.js'

type Row = Record<string, any>
type Client = typeof db | TransactionClientContract

export type RatingSummary = { average: number | null; count: number }

const text = (en: unknown, ar: unknown, locale: PublicLocale) =>
  (locale === 'ar' && typeof ar === 'string' && ar.trim() ? ar : en) ?? null

const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value ? new Date(String(value)).toISOString() : null

/** A booking can be reviewed once the rental is over: completed, or confirmed and returned. */
export function canReview(booking: Row, now = new Date()) {
  return (
    booking.status === 'completed' ||
    (booking.status === 'confirmed' && new Date(booking.return_at) <= now)
  )
}

/** The customer's own review as shown on their booking. */
export function ownReview(row: Row | null | undefined) {
  if (!row) return null
  return {
    id: Number(row.id),
    rating: Number(row.rating),
    comment: row.comment ?? null,
    status: row.status as 'published' | 'hidden',
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}

export async function reviewForBooking(client: Client, bookingId: number) {
  return ((await client.from('rental_reviews').where('booking_id', bookingId).first()) ??
    null) as Row | null
}

/** Published-review averages keyed by vehicle or provider id. */
export async function ratingSummaries(
  column: 'vehicle_id' | 'provider_id',
  ids: number[],
  client: Client = db
) {
  const result = new Map<number, RatingSummary>()
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))]
  if (!unique.length) return result
  const rows = (await client
    .from('rental_reviews')
    .whereIn(column, unique)
    .where('status', 'published')
    .groupBy(column)
    .select(column)
    .count('* as total')
    .avg('rating as average')) as Row[]
  for (const row of rows)
    result.set(Number(row[column]), {
      average: Math.round(Number(row.average) * 10) / 10,
      count: Number(row.total),
    })
  return result
}

export function summaryFor(map: Map<number, RatingSummary>, id: number): RatingSummary {
  return map.get(id) ?? { average: null, count: 0 }
}

function authorName(row: Row) {
  const first = String(row.first_name ?? '').trim()
  const last = String(row.last_name ?? '').trim()
  return [first, last ? `${last[0]}.` : ''].filter(Boolean).join(' ') || 'Customer'
}

function publicReview(row: Row, locale: PublicLocale) {
  return {
    id: Number(row.id),
    rating: Number(row.rating),
    comment: row.comment ?? null,
    author_name: authorName(row),
    vehicle: {
      id: Number(row.vehicle_id),
      name: text(row.vehicle_name_en, row.vehicle_name_ar, locale),
    },
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}

/** Published reviews of a vehicle or provider, newest first, with a rating breakdown. */
export async function listPublicReviews(
  column: 'vehicle_id' | 'provider_id',
  rawId: unknown,
  input: Row,
  locale: PublicLocale
) {
  const id = positiveId(rawId)
  const exists =
    column === 'vehicle_id'
      ? await db.from('rental_vehicles').where({ id, status: 'published' }).first()
      : await db.from('rental_providers').where({ id, active: true }).first()
  if (!exists)
    throw new ApiError(
      404,
      'NOT_FOUND',
      column === 'vehicle_id' ? 'Vehicle not found' : 'Provider not found'
    )
  const { page, perPage } = pagination(input)
  const base = db
    .from('rental_reviews as r')
    .where(`r.${column}`, id)
    .where('r.status', 'published')
  const breakdown = (await base
    .clone()
    .groupBy('r.rating')
    .select('r.rating')
    .count('* as total')) as Row[]
  const distribution: Record<'1' | '2' | '3' | '4' | '5', number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let total = 0
  let sum = 0
  for (const row of breakdown) {
    const rating = Number(row.rating) as 1 | 2 | 3 | 4 | 5
    distribution[rating] = Number(row.total)
    total += Number(row.total)
    sum += rating * Number(row.total)
  }
  const rows = (await base
    .clone()
    .join('customers as c', 'c.id', 'r.customer_id')
    .join('rental_vehicles as v', 'v.id', 'r.vehicle_id')
    .select(
      'r.*',
      'c.first_name',
      'c.last_name',
      'v.name_en as vehicle_name_en',
      'v.name_ar as vehicle_name_ar'
    )
    .orderBy('r.id', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage)) as Row[]
  return {
    data: rows.map((row) => publicReview(row, locale)),
    meta: {
      page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      rating: {
        average: total ? Math.round((sum / total) * 10) / 10 : null,
        count: total,
        distribution,
      },
    },
  }
}

async function ownedBookingRow(client: Client, customerId: number, rawId: unknown) {
  const row = await client
    .from('rental_bookings')
    .where({ customer_id: customerId, id: positiveId(rawId) })
    .forUpdate()
    .first()
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Booking not found')
  return row as Row
}

/** Creates or replaces the customer's review of one booking. */
export async function saveReview(
  customerId: number,
  bookingId: unknown,
  input: { rating: number; comment?: string | null }
) {
  return db.transaction(async (trx) => {
    const booking = await ownedBookingRow(trx, customerId, bookingId)
    if (!canReview(booking))
      throw new ApiError(409, 'REVIEW_NOT_ALLOWED', 'You can review a rental after it has ended')
    const comment = input.comment?.trim() ? input.comment.trim() : null
    const now = new Date()
    const existing = await reviewForBooking(trx, Number(booking.id))
    if (existing) {
      await trx
        .from('rental_reviews')
        .where('id', existing.id)
        .update({ rating: input.rating, comment, updated_at: now })
    } else {
      await trx.table('rental_reviews').insert({
        booking_id: booking.id,
        customer_id: customerId,
        vehicle_id: booking.vehicle_id,
        provider_id: booking.provider_id,
        rating: input.rating,
        comment,
        status: 'published',
        created_at: now,
        updated_at: now,
      })
    }
    const saved = await reviewForBooking(trx, Number(booking.id))
    return { created: !existing, data: ownReview(saved)! }
  })
}

export async function deleteReview(customerId: number, bookingId: unknown) {
  await db.transaction(async (trx) => {
    const booking = await ownedBookingRow(trx, customerId, bookingId)
    const deleted = await trx.from('rental_reviews').where('booking_id', booking.id).delete()
    if (!Number(Array.isArray(deleted) ? deleted[0] : deleted))
      throw new ApiError(404, 'NOT_FOUND', 'Review not found')
  })
}

// ------------------------------------------------------------------ CMS

const PAGE_SIZE = 25

export async function adminListReviews(params: {
  status?: string
  rating?: string
  q?: string
  page?: unknown
}) {
  const current = Math.max(1, Number.parseInt(String(params.page ?? '1'), 10) || 1)
  const query = db
    .from('rental_reviews as r')
    .join('rental_bookings as b', 'b.id', 'r.booking_id')
    .join('customers as c', 'c.id', 'r.customer_id')
    .join('rental_vehicles as v', 'v.id', 'r.vehicle_id')
    .join('rental_providers as p', 'p.id', 'r.provider_id')
  if (params.status === 'published' || params.status === 'hidden')
    query.where('r.status', params.status)
  const rating = Number(params.rating)
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) query.where('r.rating', rating)
  if (params.q) {
    const like = `%${params.q.replaceAll(/[%_\\]/g, (char) => `\\${char}`)}%`
    query.where((builder) =>
      builder
        .whereLike('b.reference', like)
        .orWhereLike('v.name_en', like)
        .orWhereLike('p.name_en', like)
        .orWhereLike('r.comment', like)
    )
  }
  const count = await query.clone().count('* as total').first()
  const total = Number(count?.total ?? 0)
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rows = (await query
    .select(
      'r.*',
      'b.reference',
      'c.first_name',
      'c.last_name',
      'c.phone_e164',
      'v.name_en as vehicle_name',
      'p.name_en as provider_name'
    )
    .orderBy('r.id', 'desc')
    .limit(PAGE_SIZE)
    .offset((Math.min(current, lastPage) - 1) * PAGE_SIZE)) as Row[]
  return { rows, total, page: Math.min(current, lastPage), lastPage, pageSize: PAGE_SIZE }
}

async function audit(client: Client, actorId: number, id: number, action: string) {
  await client.table('audit_logs').insert({
    actor_id: actorId,
    action: `rental_review.${action}`,
    entity_type: 'rental_review',
    entity_id: String(id),
    created_at: new Date(),
  })
}

export async function setReviewStatus(id: number, status: 'published' | 'hidden', actorId: number) {
  await db.transaction(async (trx) => {
    const row = await trx.from('rental_reviews').where('id', id).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Review not found')
    await trx
      .from('rental_reviews')
      .where('id', id)
      .update({
        status,
        hidden_at: status === 'hidden' ? new Date() : null,
        hidden_by: status === 'hidden' ? actorId : null,
        updated_at: new Date(),
      })
    await audit(trx, actorId, id, status === 'hidden' ? 'hide' : 'publish')
  })
}

export async function adminDeleteReview(id: number, actorId: number) {
  await db.transaction(async (trx) => {
    const row = await trx.from('rental_reviews').where('id', id).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Review not found')
    await trx.from('rental_reviews').where('id', id).delete()
    await audit(trx, actorId, id, 'delete')
  })
}
