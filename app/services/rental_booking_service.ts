import { createHash, randomBytes } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ApiError } from './api_error.js'
import { imageLinks, pagination, positiveId } from './explore_read_service.js'
import { sendProviderEmail } from './rental_provider_mailer.js'
import { canReview, reviewForBooking } from './rental_review_service.js'
import {
  assertDriverChoice,
  findVisibleVehicle,
  freeUnits,
  rentalSettings,
  requireWindow,
  vehicleLocations,
  vehicleTerms,
  type RentalSettings,
} from './rental_catalog_service.js'
import { kwd, quoteFor, toFils } from './rental_money.js'
import { assertBranchOpen } from './rental_branch_service.js'
import {
  BOOKING_STATUSES,
  rentalBooking,
  type BookingSnapshot,
  type BookingStatus,
} from '../serializers/rental.js'
import type { PublicLocale } from './public_localization.js'

type Row = Record<string, any>
type Client = typeof db | TransactionClientContract

/** Unpaid holds one customer may keep at the same time. */
const MAX_OPEN_HOLDS = 3

export type CreateBookingInput = {
  vehicle_id: number
  pickup_at: string
  return_at: string
  pickup_location_id: number
  return_location_id?: number
  with_driver?: boolean
  notes?: string | null
}

/** Marks unpaid holds whose time ran out. A late payment can still confirm them. */
export async function expireStaleHolds(client: Client = db) {
  await client
    .from('rental_bookings')
    .where('status', 'pending_payment')
    .where('hold_expires_at', '<=', new Date())
    .update({ status: 'expired', updated_at: new Date() })
}

export function customerCanCancel(row: Row, settings: RentalSettings) {
  if (row.status === 'pending_payment') return true
  if (row.status !== 'confirmed') return false
  const cutoff = new Date(row.pickup_at).getTime() - settings.cancellation_cutoff_hours * 3_600_000
  return Date.now() < cutoff
}

export async function latestPayment(client: Client, bookingId: number) {
  return client.from('rental_payments').where('booking_id', bookingId).orderBy('id', 'desc').first()
}

/** Booking responses carry the vehicle image as a key, resolved through `meta.images`. */
export function bookingResponse<T extends { vehicle: { cover_image_key: string | null } }>(
  booking: T
) {
  return {
    data: booking,
    meta: { images: imageLinks([booking.vehicle.cover_image_key]) },
  }
}

export async function serializeBooking(
  client: Client,
  row: Row,
  locale: PublicLocale,
  settings?: RentalSettings
) {
  const resolved = settings ?? (await rentalSettings(client))
  return rentalBooking(
    row,
    locale,
    await latestPayment(client, Number(row.id)),
    customerCanCancel(row, resolved),
    await reviewForBooking(client, Number(row.id)),
    canReview(row)
  )
}

function newReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  return `RN-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')}`
}

function requestHash(input: CreateBookingInput) {
  const canonical = {
    vehicle_id: input.vehicle_id,
    pickup_at: input.pickup_at,
    return_at: input.return_at,
    pickup_location_id: input.pickup_location_id,
    return_location_id: input.return_location_id ?? input.pickup_location_id,
    with_driver: Boolean(input.with_driver),
    notes: input.notes ?? null,
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export function idempotencyKey(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(value))
    throw new ApiError(
      422,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Send an Idempotency-Key header of 8–80 letters, digits, "-" or "_"'
    )
  return value
}

async function replay(customerId: number, key: string, hash: string, locale: PublicLocale) {
  const existing = await db
    .from('rental_bookings')
    .where({ customer_id: customerId, idempotency_key: key })
    .first()
  if (!existing) return null
  if (existing.request_hash !== hash)
    throw new ApiError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'This Idempotency-Key was already used for a different booking request'
    )
  return { created: false, ...bookingResponse(await serializeBooking(db, existing, locale)) }
}

/** The chosen place, with the address of the branch that serves it. */
function snapshotLocation(row: Row) {
  const lat = row.latitude ?? row.place_latitude
  const lng = row.longitude ?? row.place_longitude
  return {
    id: Number(row.place_id ?? row.id),
    branch_id: Number(row.id),
    name_en: row.place_name_en ?? row.name_en,
    name_ar: row.place_name_ar ?? row.name_ar ?? null,
    address: row.address ?? row.place_subtitle_en ?? null,
    phone_e164: row.phone_e164 ?? null,
    latitude: lat === null || lat === undefined ? null : Number(lat),
    longitude: lng === null || lng === undefined ? null : Number(lng),
  }
}

export async function createBooking(
  customerId: number,
  key: string,
  input: CreateBookingInput,
  locale: PublicLocale
) {
  const hash = requestHash(input)
  const replayed = await replay(customerId, key, hash, locale)
  if (replayed) return replayed
  try {
    return await db.transaction(async (trx) => {
      const settings = await rentalSettings(trx)
      const window = requireWindow(input, settings)
      const customer = await trx.from('customers').where('id', customerId).forUpdate().first()
      if (!customer) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
      await expireStaleHolds(trx)
      const openHolds = await trx
        .from('rental_bookings')
        .where({ customer_id: customerId, status: 'pending_payment' })
        .count('* as total')
        .first()
      if (Number(openHolds?.total ?? 0) >= MAX_OPEN_HOLDS)
        throw new ApiError(
          409,
          'TOO_MANY_PENDING_BOOKINGS',
          'Pay for or cancel your unpaid rental bookings before starting another'
        )
      // Locking the vehicle row serialises concurrent checkouts for this vehicle.
      const vehicle = await findVisibleVehicle(input.vehicle_id, trx, true)
      const withDriver = Boolean(input.with_driver)
      assertDriverChoice(vehicle, withDriver)
      const locations = await vehicleLocations(trx, Number(vehicle.id))
      // Customers choose places; resolve the provider branch serving each one.
      const pickup = locations.find((row: Row) => Number(row.place_id) === input.pickup_location_id)
      if (!pickup)
        throw new ApiError(
          422,
          'INVALID_LOCATION',
          'This vehicle is not available at that pickup location',
          {
            pickup_location_id: ['Choose one of this vehicle’s pickup locations'],
          }
        )
      // The car is returned where it was picked up.
      const dropoff = pickup
      if (
        input.return_location_id !== undefined &&
        input.return_location_id !== input.pickup_location_id
      )
        throw new ApiError(
          422,
          'INVALID_LOCATION',
          'The car must be returned at its pickup location',
          { return_location_id: ['Return the car where you picked it up'] }
        )
      await assertBranchOpen(trx, pickup, window.pickupAt, 'pickup_at')
      await assertBranchOpen(trx, dropoff, window.returnAt, 'return_at')
      if ((await freeUnits(trx, vehicle, window)) < 1)
        throw new ApiError(
          409,
          'VEHICLE_UNAVAILABLE',
          'This vehicle is no longer available for the selected dates'
        )
      const quote = quoteFor({
        ...window,
        dailyRate: vehicle.daily_rate,
        driverDailyRate: vehicle.driver_daily_rate,
        withDriver,
        bookingFee: settings.booking_fee,
      })
      const termRows = await vehicleTerms(trx, Number(vehicle.id))
      const snapshot: BookingSnapshot = {
        vehicle: {
          id: Number(vehicle.id),
          name_en: vehicle.name_en,
          name_ar: vehicle.name_ar ?? null,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year === null ? null : Number(vehicle.year),
          vehicle_type: vehicle.vehicle_type,
          transmission: vehicle.transmission,
          seats: Number(vehicle.seats),
          cover_image_key: vehicle.cover_image_key ?? null,
          mileage_limit_km:
            vehicle.mileage_limit_km === null ? null : Number(vehicle.mileage_limit_km),
          extra_km_rate: vehicle.extra_km_rate === null ? null : kwd(toFils(vehicle.extra_km_rate)),
          insurance_en: vehicle.insurance_name_en ?? null,
          insurance_ar: vehicle.insurance_name_ar ?? null,
          rental_terms: termRows.map((term) => ({
            label_en: term.label_en,
            label_ar: term.label_ar ?? null,
          })),
        },
        provider: {
          id: Number(vehicle.provider_id),
          name_en: vehicle.provider_name_en,
          name_ar: vehicle.provider_name_ar ?? null,
          phone_e164: vehicle.provider_phone_e164 ?? null,
          email: null,
          address: vehicle.provider_address ?? null,
        },
        pickup_location: snapshotLocation(pickup),
        return_location: snapshotLocation(dropoff),
      }
      const now = new Date()
      const [id] = await trx.table('rental_bookings').insert({
        reference: newReference(),
        customer_id: customerId,
        vehicle_id: vehicle.id,
        provider_id: vehicle.provider_id,
        pickup_location_id: pickup.id,
        return_location_id: dropoff.id,
        pickup_at: window.pickupAt,
        return_at: window.returnAt,
        with_driver: withDriver,
        days: quote.days,
        daily_rate: quote.daily_rate,
        driver_daily_rate: quote.driver_daily_rate,
        rental_amount: quote.rental_amount,
        booking_fee: quote.booking_fee,
        currency: 'KWD',
        snapshot: JSON.stringify(snapshot),
        notes: input.notes ?? null,
        status: 'pending_payment',
        hold_expires_at: new Date(now.getTime() + settings.hold_minutes * 60_000),
        idempotency_key: key,
        request_hash: hash,
        created_at: now,
        updated_at: now,
      })
      const row = await trx.from('rental_bookings').where('id', id).firstOrFail()
      return {
        created: true,
        ...bookingResponse(await serializeBooking(trx, row, locale, settings)),
      }
    })
  } catch (error) {
    // A concurrent request with the same key won the insert; answer as a replay.
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      const again = await replay(customerId, key, hash, locale)
      if (again) return again
    }
    throw error
  }
}

const statusGroups: Record<string, BookingStatus[]> = {
  active: ['pending_payment', 'confirmed'],
  past: ['completed'],
  cancelled: ['cancelled', 'expired', 'refund_required'],
}

export async function listBookings(customerId: number, input: Row, locale: PublicLocale) {
  await expireStaleHolds()
  const { page, perPage } = pagination(input)
  const raw = input.status
    ? String(input.status)
        .split(',')
        .map((value) => value.trim())
    : []
  const statuses = new Set<BookingStatus>()
  for (const value of raw) {
    if (statusGroups[value]) statusGroups[value].forEach((status) => statuses.add(status))
    else if ((BOOKING_STATUSES as readonly string[]).includes(value))
      statuses.add(value as BookingStatus)
    else
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid status filter', {
        status: [`Choose from ${[...Object.keys(statusGroups), ...BOOKING_STATUSES].join(', ')}`],
      })
  }
  const query = db.from('rental_bookings').where('customer_id', customerId)
  if (statuses.size) query.whereIn('status', [...statuses])
  const count = await query.clone().count('* as total').first()
  const total = Number(count?.total ?? 0)
  const rows = await query
    .orderBy('id', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage)
  const settings = await rentalSettings()
  const bookings = await Promise.all(rows.map((row) => serializeBooking(db, row, locale, settings)))
  return {
    data: bookings,
    meta: {
      page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      images: imageLinks(bookings.map((booking) => booking.vehicle.cover_image_key)),
    },
  }
}

export async function ownedBooking(client: Client, customerId: number, id: unknown, lock = false) {
  const query = client
    .from('rental_bookings')
    .where({ customer_id: customerId, id: positiveId(id) })
  if (lock) query.forUpdate()
  const row = await query.first()
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Booking not found')
  return row as Row
}

export async function showBooking(customerId: number, id: unknown, locale: PublicLocale) {
  await expireStaleHolds()
  return bookingResponse(await serializeBooking(db, await ownedBooking(db, customerId, id), locale))
}

export async function cancelBooking(
  customerId: number,
  id: unknown,
  reason: string | null | undefined,
  locale: PublicLocale
) {
  await expireStaleHolds()
  let wasConfirmed = false
  const response = await db.transaction(async (trx) => {
    const row = await ownedBooking(trx, customerId, id, true)
    const settings = await rentalSettings(trx)
    wasConfirmed = row.status === 'confirmed'
    if (!customerCanCancel(row, settings))
      throw new ApiError(
        409,
        row.status === 'confirmed' ? 'CANCELLATION_WINDOW_CLOSED' : 'INVALID_BOOKING_STATUS',
        row.status === 'confirmed'
          ? `Bookings can be cancelled in the app until ${settings.cancellation_cutoff_hours} hours before pickup`
          : 'This booking can no longer be cancelled'
      )
    const now = new Date()
    await trx
      .from('rental_bookings')
      .where('id', row.id)
      .update({
        status: 'cancelled',
        cancelled_at: now,
        cancelled_by: 'customer',
        cancel_reason: reason ?? null,
        updated_at: now,
      })
    const updated = await trx.from('rental_bookings').where('id', row.id).firstOrFail()
    return bookingResponse(await serializeBooking(trx, updated, locale, settings))
  })
  if (wasConfirmed) await sendProviderEmail(response.data.id, 'cancelled')
  return response
}
