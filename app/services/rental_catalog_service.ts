import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ApiError } from './api_error.js'
import { pagination, positiveId } from './explore_read_service.js'
import { quoteFor, toFils, kwd } from './rental_money.js'
import type { PublicLocale } from './public_localization.js'
import { publicImageUrl } from './image_storage_service.js'

type Row = Record<string, any>
type Client = typeof db | TransactionClientContract

export const VEHICLE_TYPES = {
  sedan: { en: 'Sedan', ar: 'سيدان' },
  suv: { en: 'SUV', ar: 'دفع رباعي' },
  hatchback: { en: 'Hatchback', ar: 'هاتشباك' },
  luxury: { en: 'Luxury', ar: 'فاخرة' },
  sports: { en: 'Sports', ar: 'رياضية' },
  van: { en: 'Van', ar: 'فان' },
  pickup: { en: 'Pickup', ar: 'بيك أب' },
} as const
export const TRANSMISSIONS = {
  automatic: { en: 'Automatic', ar: 'أوتوماتيك' },
  manual: { en: 'Manual', ar: 'يدوي' },
} as const
export const FUEL_TYPES = {
  petrol: { en: 'Petrol', ar: 'بنزين' },
  diesel: { en: 'Diesel', ar: 'ديزل' },
  hybrid: { en: 'Hybrid', ar: 'هجين' },
  electric: { en: 'Electric', ar: 'كهربائية' },
} as const
export type VehicleType = keyof typeof VEHICLE_TYPES
export type Transmission = keyof typeof TRANSMISSIONS
export type FuelType = keyof typeof FUEL_TYPES

const SORTS = ['recommended', 'price_asc', 'price_desc', 'newest'] as const

export type RentalSettings = {
  booking_fee: string
  hold_minutes: number
  min_lead_minutes: number
  max_rental_days: number
  cancellation_cutoff_hours: number
}

const defaultSettings: RentalSettings = {
  booking_fee: '3.000',
  hold_minutes: 15,
  min_lead_minutes: 120,
  max_rental_days: 30,
  cancellation_cutoff_hours: 24,
}

export async function rentalSettings(client: Client = db): Promise<RentalSettings> {
  const row = await client.from('rental_settings').where('id', 1).first()
  if (!row) return { ...defaultSettings }
  return {
    booking_fee: kwd(toFils(row.booking_fee)),
    hold_minutes: Number(row.hold_minutes),
    min_lead_minutes: Number(row.min_lead_minutes),
    max_rental_days: Number(row.max_rental_days),
    cancellation_cutoff_hours: Number(row.cancellation_cutoff_hours),
  }
}

const label = (
  map: Record<string, { en: string; ar: string }>,
  code: string,
  locale: PublicLocale
) => map[code]?.[locale] ?? code
const text = (en: unknown, ar: unknown, locale: PublicLocale) =>
  (locale === 'ar' && typeof ar === 'string' && ar.trim() ? ar : en) ?? null

export type RentalWindow = { pickupAt: Date; returnAt: Date }

function parseInstant(value: unknown, field: string) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid rental period', {
      [field]: [
        'Use an ISO 8601 date-time with a time zone, for example 2026-11-20T10:00:00+03:00',
      ],
    })
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid rental period', {
      [field]: ['Enter a valid date and time'],
    })
  return date
}

/** Parses an optional rental period; both ends are required once either is given. */
export function optionalWindow(input: Row, settings: RentalSettings): RentalWindow | null {
  if (!input.pickup_at && !input.return_at) return null
  return requireWindow(input, settings)
}

export function requireWindow(input: Row, settings: RentalSettings): RentalWindow {
  const pickupAt = parseInstant(input.pickup_at, 'pickup_at')
  const returnAt = parseInstant(input.return_at, 'return_at')
  if (returnAt.getTime() <= pickupAt.getTime())
    throw new ApiError(422, 'INVALID_RENTAL_PERIOD', 'Return must be after pickup', {
      return_at: ['Return must be after pickup'],
    })
  if (pickupAt.getTime() < Date.now() + settings.min_lead_minutes * 60_000)
    throw new ApiError(
      422,
      'INVALID_RENTAL_PERIOD',
      `Pickup must be at least ${settings.min_lead_minutes} minutes from now`,
      { pickup_at: [`Pickup must be at least ${settings.min_lead_minutes} minutes from now`] }
    )
  const maxMs = settings.max_rental_days * 24 * 60 * 60 * 1000
  if (returnAt.getTime() - pickupAt.getTime() > maxMs)
    throw new ApiError(
      422,
      'INVALID_RENTAL_PERIOD',
      `Rentals can last up to ${settings.max_rental_days} days`,
      { return_at: [`Rentals can last up to ${settings.max_rental_days} days`] }
    )
  return { pickupAt, returnAt }
}

function booleanParam(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true' || value === '1') return true
  if (value === false || value === 'false' || value === '0') return false
  throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid filter', { [field]: ['Use true or false'] })
}

function listParam<T extends string>(value: unknown, allowed: readonly T[], field: string) {
  if (value === undefined || value === null || value === '') return []
  const values = (Array.isArray(value) ? value : String(value).split(','))
    .map((item) => String(item).trim())
    .filter(Boolean)
  for (const item of values) {
    if (!allowed.includes(item as T))
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid filter', {
        [field]: [`Choose from ${allowed.join(', ')}`],
      })
  }
  return values as T[]
}

/**
 * Bookings that hold a unit: confirmed ones, and unpaid holds that have not
 * expired. `refund_required` is excluded because it never got the unit.
 */
export function applyHoldingBookings(query: any, now: Date) {
  return query.where((inner: any) =>
    inner
      .where('b.status', 'confirmed')
      .orWhere((pending: any) =>
        pending.where('b.status', 'pending_payment').where('b.hold_expires_at', '>', now)
      )
  )
}

/** Adds the "a unit is free for this period" condition to a `rental_vehicles as v` query. */
function whereAvailable(query: any, window: RentalWindow, now: Date) {
  query
    .whereNotExists((blocks: any) =>
      blocks
        .from('rental_vehicle_blocks as k')
        .whereColumn('k.vehicle_id', 'v.id')
        .where('k.starts_at', '<', window.returnAt)
        .where('k.ends_at', '>', window.pickupAt)
    )
    // Keep this condition in step with applyHoldingBookings().
    .whereRaw(
      `v.quantity > (select count(*) from rental_bookings as b where b.vehicle_id = v.id
        and b.pickup_at < ? and b.return_at > ?
        and (b.status = 'confirmed' or (b.status = 'pending_payment' and b.hold_expires_at > ?)))`,
      [window.returnAt, window.pickupAt, now]
    )
}

/** Units still free for one vehicle; run inside the transaction that locked the vehicle row. */
export async function freeUnits(
  client: Client,
  vehicle: Row,
  window: RentalWindow,
  excludeBookingId?: number
) {
  const now = new Date()
  const blocked = await client
    .from('rental_vehicle_blocks')
    .where('vehicle_id', vehicle.id)
    .where('starts_at', '<', window.returnAt)
    .where('ends_at', '>', window.pickupAt)
    .first()
  if (blocked) return 0
  const query = client
    .from('rental_bookings as b')
    .where('b.vehicle_id', vehicle.id)
    .where('b.pickup_at', '<', window.returnAt)
    .where('b.return_at', '>', window.pickupAt)
  if (excludeBookingId) query.whereNot('b.id', excludeBookingId)
  const held = await applyHoldingBookings(query, now).count('* as total').first()
  return Math.max(0, Number(vehicle.quantity) - Number(held?.total ?? 0))
}

/** Published vehicles of active providers. */
function visibleVehicles(client: Client = db) {
  return client
    .from('rental_vehicles as v')
    .join('rental_providers as p', 'p.id', 'v.provider_id')
    .where('v.status', 'published')
    .where('v.published_at', '<=', new Date())
    .where('p.active', true)
}

function vehicleCard(
  row: Row,
  locale: PublicLocale,
  settings: RentalSettings,
  window: RentalWindow | null,
  withDriver: boolean
) {
  const driverRequested = withDriver && Boolean(row.with_driver_available)
  return {
    id: Number(row.id),
    name: text(row.name_en, row.name_ar, locale),
    make: row.make,
    model: row.model,
    year: row.year === null ? null : Number(row.year),
    vehicle_type: { code: row.vehicle_type, label: label(VEHICLE_TYPES, row.vehicle_type, locale) },
    transmission: {
      code: row.transmission,
      label: label(TRANSMISSIONS, row.transmission, locale),
    },
    fuel_type: { code: row.fuel_type, label: label(FUEL_TYPES, row.fuel_type, locale) },
    seats: Number(row.seats),
    doors: row.doors === null ? null : Number(row.doors),
    bags: row.bags === null ? null : Number(row.bags),
    mileage_limit_km: row.mileage_limit_km === null ? null : Number(row.mileage_limit_km),
    unlimited_mileage: row.mileage_limit_km === null,
    daily_rate: kwd(toFils(row.daily_rate)),
    deposit_amount: kwd(toFils(row.deposit_amount)),
    with_driver_available: Boolean(row.with_driver_available),
    driver_daily_rate:
      row.with_driver_available && row.driver_daily_rate !== null
        ? kwd(toFils(row.driver_daily_rate))
        : null,
    currency: 'KWD',
    cover_image_url: publicImageUrl(row.cover_image_key),
    provider: {
      id: Number(row.provider_id),
      name: text(row.provider_name_en, row.provider_name_ar, locale),
      logo_url: publicImageUrl(row.provider_logo_image_key),
    },
    quote: window
      ? quoteFor({
          ...window,
          dailyRate: row.daily_rate,
          driverDailyRate: row.driver_daily_rate,
          withDriver: driverRequested,
          deposit: row.deposit_amount,
          bookingFee: settings.booking_fee,
        })
      : null,
  }
}

const providerColumns = [
  'p.name_en as provider_name_en',
  'p.name_ar as provider_name_ar',
  'p.logo_image_key as provider_logo_image_key',
  'p.phone_e164 as provider_phone_e164',
  'p.address as provider_address',
]

export async function searchOptions(locale: PublicLocale) {
  const settings = await rentalSettings()
  return {
    data: {
      vehicle_types: Object.entries(VEHICLE_TYPES).map(([code, names]) => ({
        code,
        label: names[locale],
      })),
      transmissions: Object.entries(TRANSMISSIONS).map(([code, names]) => ({
        code,
        label: names[locale],
      })),
      sorts: SORTS,
      locations: (await activeLocations(locale)).data,
      booking_fee: settings.booking_fee,
      currency: 'KWD',
      min_lead_minutes: settings.min_lead_minutes,
      max_rental_days: settings.max_rental_days,
      hold_minutes: settings.hold_minutes,
      cancellation_cutoff_hours: settings.cancellation_cutoff_hours,
    },
  }
}

export function location(row: Row, locale: PublicLocale) {
  return {
    id: Number(row.id),
    name: text(row.name_en, row.name_ar, locale),
    address: row.address ?? null,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
  }
}

export async function activeLocations(locale: PublicLocale) {
  const rows = await db
    .from('rental_locations')
    .where('active', true)
    .orderBy('sort_order')
    .orderBy('id')
  return { data: rows.map((row) => location(row, locale)) }
}

export async function listVehicles(input: Row, locale: PublicLocale) {
  const settings = await rentalSettings()
  const { page, perPage } = pagination(input)
  const window = optionalWindow(input, settings)
  const withDriver = booleanParam(input.with_driver, 'with_driver') ?? false
  const types = listParam(input.vehicle_type, Object.keys(VEHICLE_TYPES), 'vehicle_type')
  const transmissions = listParam(input.transmission, Object.keys(TRANSMISSIONS), 'transmission')
  const sort = (input.sort ?? 'recommended') as (typeof SORTS)[number]
  if (!SORTS.includes(sort))
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid sort', {
      sort: [`Choose from ${SORTS.join(', ')}`],
    })
  const seatsMin =
    input.seats_min === undefined || input.seats_min === '' ? null : Number(input.seats_min)
  if (seatsMin !== null && (!Number.isInteger(seatsMin) || seatsMin < 1 || seatsMin > 60))
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid filter', {
      seats_min: ['Enter a whole number of seats'],
    })
  const locationId =
    input.pickup_location_id === undefined || input.pickup_location_id === ''
      ? null
      : positiveId(input.pickup_location_id)

  const now = new Date()
  const apply = (query: any) => {
    if (types.length) query.whereIn('v.vehicle_type', types)
    if (transmissions.length) query.whereIn('v.transmission', transmissions)
    if (seatsMin) query.where('v.seats', '>=', seatsMin)
    if (withDriver) query.where('v.with_driver_available', true)
    if (locationId)
      query.whereExists((sub: any) =>
        sub
          .from('rental_vehicle_locations as vl')
          .join('rental_locations as l', 'l.id', 'vl.location_id')
          .whereColumn('vl.vehicle_id', 'v.id')
          .where('vl.location_id', locationId)
          .where('l.active', true)
      )
    if (window) whereAvailable(query, window, now)
    return query
  }
  const count = await apply(visibleVehicles()).count('* as total').first()
  const total = Number(count?.total ?? 0)
  const query = apply(visibleVehicles()).select('v.*', ...providerColumns)
  if (sort === 'price_asc') query.orderBy('v.daily_rate', 'asc')
  else if (sort === 'price_desc') query.orderBy('v.daily_rate', 'desc')
  else if (sort === 'newest') query.orderBy('v.published_at', 'desc')
  else query.orderBy('v.daily_rate', 'asc')
  const rows = await query
    .orderBy('v.id', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage)
  return {
    data: rows.map((row: Row) => vehicleCard(row, locale, settings, window, withDriver)),
    meta: {
      page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      pickup_at: window?.pickupAt.toISOString() ?? null,
      return_at: window?.returnAt.toISOString() ?? null,
      with_driver: withDriver,
    },
  }
}

export async function findVisibleVehicle(id: unknown, client: Client = db, lock = false) {
  const query = visibleVehicles(client)
    .where('v.id', positiveId(id))
    .select('v.*', ...providerColumns)
  if (lock) query.forUpdate()
  const row = await query.first()
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found')
  return row as Row
}

export async function vehicleLocations(client: Client, vehicleId: number) {
  return client
    .from('rental_vehicle_locations as vl')
    .join('rental_locations as l', 'l.id', 'vl.location_id')
    .where('vl.vehicle_id', vehicleId)
    .where('l.active', true)
    .orderBy('l.sort_order')
    .orderBy('l.id')
    .select('l.*')
}

export async function vehicleDetail(id: unknown, input: Row, locale: PublicLocale) {
  const settings = await rentalSettings()
  const window = optionalWindow(input, settings)
  const withDriver = booleanParam(input.with_driver, 'with_driver') ?? false
  const row = await findVisibleVehicle(id)
  const [images, locations] = await Promise.all([
    db
      .from('rental_vehicle_images')
      .where('vehicle_id', row.id)
      .orderBy('sort_order')
      .orderBy('id'),
    vehicleLocations(db, Number(row.id)),
  ])
  const available = window ? (await freeUnits(db, row, window)) > 0 : null
  const card = vehicleCard(row, locale, settings, window, withDriver)
  return {
    data: {
      ...card,
      gallery: [row.cover_image_key, ...images.map((image) => image.storage_key)]
        .filter(Boolean)
        .map((key) => publicImageUrl(key)),
      min_driver_age: Number(row.min_driver_age),
      insurance: text(row.insurance_en, row.insurance_ar, locale),
      terms: text(row.terms_en, row.terms_ar, locale),
      locations: locations.map((item: Row) => location(item, locale)),
      provider: {
        ...card.provider,
        phone_e164: row.provider_phone_e164 ?? null,
        address: row.provider_address ?? null,
      },
      available,
      booking_fee: settings.booking_fee,
      cancellation_cutoff_hours: settings.cancellation_cutoff_hours,
    },
  }
}

export async function vehicleQuote(id: unknown, input: Row) {
  const settings = await rentalSettings()
  const window = requireWindow(input, settings)
  const withDriver = booleanParam(input.with_driver, 'with_driver') ?? false
  const row = await findVisibleVehicle(id)
  if (withDriver && !row.with_driver_available)
    throw new ApiError(422, 'DRIVER_NOT_AVAILABLE', 'This vehicle is not offered with a driver', {
      with_driver: ['This vehicle is not offered with a driver'],
    })
  return {
    data: {
      vehicle_id: Number(row.id),
      pickup_at: window.pickupAt.toISOString(),
      return_at: window.returnAt.toISOString(),
      with_driver: withDriver,
      available: (await freeUnits(db, row, window)) > 0,
      ...quoteFor({
        ...window,
        dailyRate: row.daily_rate,
        driverDailyRate: row.driver_daily_rate,
        withDriver,
        deposit: row.deposit_amount,
        bookingFee: settings.booking_fee,
      }),
    },
  }
}
