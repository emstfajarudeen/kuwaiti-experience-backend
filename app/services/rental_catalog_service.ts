import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ApiError } from './api_error.js'
import { imageLinks, pagination, positiveId } from './explore_read_service.js'
import { quoteFor, toFils, kwd } from './rental_money.js'
import type { PublicLocale } from './public_localization.js'
import { branchSchedules, publicSchedule, whereBranchOpen } from './rental_branch_service.js'
import { ratingSummaries, summaryFor, type RatingSummary } from './rental_review_service.js'

type Row = Record<string, any>
type Client = typeof db | TransactionClientContract

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

type TypeNames = Map<string, { en: string; ar: string }>

/** Vehicle types managed in the CMS, in display order. */
export async function vehicleTypes(client: Client = db) {
  return (await client.from('rental_vehicle_types').orderBy('sort_order').orderBy('id')) as Row[]
}

async function typeNames(client: Client = db): Promise<TypeNames> {
  const rows = await vehicleTypes(client)
  return new Map(
    rows.map((row) => [
      row.code as string,
      { en: row.name_en as string, ar: (row.name_ar as string | null) || (row.name_en as string) },
    ])
  )
}

/** Self-drive, with a driver, or both. */
export function rentalMode(row: Row) {
  const self = row.self_drive_available === undefined ? true : Boolean(row.self_drive_available)
  const driver = Boolean(row.with_driver_available)
  return self && driver ? 'both' : driver ? 'with_driver' : 'self_drive'
}

/** Rejects a driver choice the vehicle does not offer. */
export function assertDriverChoice(row: Row, withDriver: boolean) {
  const mode = rentalMode(row)
  if (withDriver && mode === 'self_drive')
    throw new ApiError(422, 'DRIVER_NOT_AVAILABLE', 'This vehicle is not offered with a driver', {
      with_driver: ['This vehicle is not offered with a driver'],
    })
  if (!withDriver && mode === 'with_driver')
    throw new ApiError(422, 'DRIVER_REQUIRED', 'This vehicle is only rented with a driver', {
      with_driver: ['This vehicle is only rented with a driver'],
    })
}

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
  // Keep this condition in step with applyHoldingBookings().
  query.whereRaw(
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
    .leftJoin('rental_insurance_options as io', 'io.id', 'v.insurance_option_id')
    .where('v.status', 'published')
    .where('v.published_at', '<=', new Date())
    .where('p.active', true)
}

function vehicleCard(
  row: Row,
  locale: PublicLocale,
  settings: RentalSettings,
  window: RentalWindow | null,
  withDriver: boolean,
  ratings: { vehicles: Map<number, RatingSummary>; providers: Map<number, RatingSummary> },
  types: TypeNames
) {
  const mode = rentalMode(row)
  // Driver-only vehicles are always quoted with the driver.
  const driverRequested = mode === 'with_driver' || (withDriver && mode === 'both')
  const type = types.get(row.vehicle_type)
  return {
    id: Number(row.id),
    name: text(row.name_en, row.name_ar, locale),
    make: row.make,
    model: row.model,
    year: row.year === null ? null : Number(row.year),
    vehicle_type: {
      code: row.vehicle_type,
      label: type ? type[locale] : row.vehicle_type,
    },
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
    extra_km_rate: row.extra_km_rate === null ? null : kwd(toFils(row.extra_km_rate)),
    daily_rate: kwd(toFils(row.daily_rate)),
    rental_mode: mode,
    self_drive_available: mode !== 'with_driver',
    with_driver_available: mode !== 'self_drive',
    driver_daily_rate:
      row.with_driver_available && row.driver_daily_rate !== null
        ? kwd(toFils(row.driver_daily_rate))
        : null,
    currency: 'KWD',
    cover_image_key: row.cover_image_key ?? null,
    rating: summaryFor(ratings.vehicles, Number(row.id)),
    provider: {
      id: Number(row.provider_id),
      name: text(row.provider_name_en, row.provider_name_ar, locale),
      logo_image_key: row.provider_logo_image_key ?? null,
      rating: summaryFor(ratings.providers, Number(row.provider_id)),
    },
    quote: window
      ? quoteFor({
          ...window,
          dailyRate: row.daily_rate,
          driverDailyRate: row.driver_daily_rate,
          withDriver: driverRequested,
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
  'io.name_en as insurance_name_en',
  'io.name_ar as insurance_name_ar',
]

export async function searchOptions(locale: PublicLocale) {
  const settings = await rentalSettings()
  const locationList = await activeLocations(locale)
  const typeRows = await vehicleTypes()
  return {
    data: {
      vehicle_types: typeRows.map((row) => ({
        code: row.code as string,
        label: text(row.name_en, row.name_ar, locale) as string,
      })),
      transmissions: Object.entries(TRANSMISSIONS).map(([code, names]) => ({
        code,
        label: names[locale],
      })),
      sorts: SORTS,
      locations: locationList.data,
      booking_fee: settings.booking_fee,
      currency: 'KWD',
      min_lead_minutes: settings.min_lead_minutes,
      max_rental_days: settings.max_rental_days,
      hold_minutes: settings.hold_minutes,
      cancellation_cutoff_hours: settings.cancellation_cutoff_hours,
    },
  }
}

type Schedules = Awaited<ReturnType<typeof branchSchedules>>

/** A pickup place as listed in the app: the place customers choose. */
function place(row: Row, locale: PublicLocale) {
  return {
    id: Number(row.place_id ?? row.id),
    name: text(row.place_name_en ?? row.name_en, row.place_name_ar ?? row.name_ar, locale),
    address: text(
      row.place_subtitle_en ?? row.subtitle_en,
      row.place_subtitle_ar ?? row.subtitle_ar,
      locale
    ),
    latitude:
      (row.place_latitude ?? row.latitude) === null
        ? null
        : Number(row.place_latitude ?? row.latitude),
    longitude:
      (row.place_longitude ?? row.longitude) === null
        ? null
        : Number(row.place_longitude ?? row.longitude),
  }
}

/** A place with the provider branch that serves it, for a chosen vehicle. */
export function location(row: Row, locale: PublicLocale, schedules?: Schedules) {
  return {
    ...place(row, locale),
    branch: {
      id: Number(row.id),
      name: text(row.name_en, row.name_ar, locale),
      address: row.address ?? null,
      phone_e164: row.phone_e164 ?? null,
      ...publicSchedule(row, schedules?.get(Number(row.id)) ?? { hours: [], closures: [] }),
    },
  }
}

/** Active branches of active providers at active places. */
function branches(client: Client = db) {
  return client
    .from('rental_locations as l')
    .join('rental_providers as bp', 'bp.id', 'l.provider_id')
    .join('rental_places as pl', 'pl.id', 'l.place_id')
    .where('l.active', true)
    .where('bp.active', true)
    .where('pl.active', true)
    .select(
      'l.*',
      'pl.name_en as place_name_en',
      'pl.name_ar as place_name_ar',
      'pl.subtitle_en as place_subtitle_en',
      'pl.subtitle_ar as place_subtitle_ar',
      'pl.latitude as place_latitude',
      'pl.longitude as place_longitude'
    )
    .orderBy('pl.sort_order')
    .orderBy('pl.id')
}

async function serializeBranches(rows: Row[], locale: PublicLocale) {
  const schedules = await branchSchedules(rows.map((row) => Number(row.id)))
  return rows.map((row) => location(row, locale, schedules))
}

/** The places customers can pick up at: active places served by at least one active branch. */
export async function activeLocations(locale: PublicLocale) {
  const rows = (await db
    .from('rental_places as pl')
    .where('pl.active', true)
    .whereExists((sub: any) =>
      sub
        .from('rental_locations as l')
        .join('rental_providers as bp', 'bp.id', 'l.provider_id')
        .whereColumn('l.place_id', 'pl.id')
        .where('l.active', true)
        .where('bp.active', true)
    )
    .orderBy('pl.sort_order')
    .orderBy('pl.id')) as Row[]
  return { data: rows.map((row) => place(row, locale)) }
}

/** Branches where a customer may return a vehicle of this provider. */
export async function providerBranches(client: Client, providerId: number) {
  return (await branches(client).where('l.provider_id', providerId)) as Row[]
}

export async function listVehicles(input: Row, locale: PublicLocale) {
  const settings = await rentalSettings()
  const { page, perPage } = pagination(input)
  const window = optionalWindow(input, settings)
  const withDriver = booleanParam(input.with_driver, 'with_driver') ?? false
  const names = await typeNames()
  const types = listParam(input.vehicle_type, [...names.keys()], 'vehicle_type')
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
    // A self-drive search excludes driver-only vehicles, and the other way round.
    if (withDriver) query.where('v.with_driver_available', true)
    else query.where('v.self_drive_available', true)
    // The pickup place must have one of this vehicle's branches, open at the pickup time.
    if (locationId)
      query.whereExists((sub: any) => {
        sub
          .from('rental_vehicle_locations as vl')
          .join('rental_locations as l', 'l.id', 'vl.location_id')
          .whereColumn('vl.vehicle_id', 'v.id')
          .where('l.place_id', locationId)
          .where('l.active', true)
        if (window) whereBranchOpen(sub, 'l', window.pickupAt)
      })
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
  const ratings = {
    vehicles: await ratingSummaries(
      'vehicle_id',
      rows.map((row: Row) => Number(row.id))
    ),
    providers: await ratingSummaries(
      'provider_id',
      rows.map((row: Row) => Number(row.provider_id))
    ),
  }
  return {
    data: rows.map((row: Row) =>
      vehicleCard(row, locale, settings, window, withDriver, ratings, names)
    ),
    meta: {
      images: imageLinks(
        rows.flatMap((row: Row) => [row.cover_image_key, row.provider_logo_image_key])
      ),
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

/** Branches where this vehicle can be picked up. */
export async function vehicleLocations(client: Client, vehicleId: number) {
  return (await branches(client)
    .join('rental_vehicle_locations as vl', 'vl.location_id', 'l.id')
    .where('vl.vehicle_id', vehicleId)) as Row[]
}

export async function vehicleTerms(client: Client, vehicleId: number) {
  return (await client
    .from('rental_vehicle_terms')
    .where('vehicle_id', vehicleId)
    .orderBy('sort_order')
    .orderBy('id')) as Row[]
}

export async function vehicleDetail(id: unknown, input: Row, locale: PublicLocale) {
  const settings = await rentalSettings()
  const window = optionalWindow(input, settings)
  const withDriver = booleanParam(input.with_driver, 'with_driver') ?? false
  const row = await findVisibleVehicle(id)
  const [images, locations, terms] = await Promise.all([
    db
      .from('rental_vehicle_images')
      .where('vehicle_id', row.id)
      .orderBy('sort_order')
      .orderBy('id'),
    vehicleLocations(db, Number(row.id)),
    vehicleTerms(db, Number(row.id)),
  ])
  const available = window ? (await freeUnits(db, row, window)) > 0 : null
  const ratings = {
    vehicles: await ratingSummaries('vehicle_id', [Number(row.id)]),
    providers: await ratingSummaries('provider_id', [Number(row.provider_id)]),
  }
  const card = vehicleCard(row, locale, settings, window, withDriver, ratings, await typeNames())
  const galleryKeys = [row.cover_image_key, ...images.map((image) => image.storage_key)].filter(
    (key): key is string => Boolean(key)
  )
  return {
    data: {
      ...card,
      gallery: galleryKeys.map((storage_key) => ({ storage_key })),
      insurance: text(row.insurance_name_en, row.insurance_name_ar, locale),
      rental_terms: terms.map((term: Row) => ({
        label: text(term.label_en, term.label_ar, locale) as string,
      })),
      locations: await serializeBranches(locations, locale),
      return_locations: await serializeBranches(
        await providerBranches(db, Number(row.provider_id)),
        locale
      ),
      provider: {
        ...card.provider,
        phone_e164: row.provider_phone_e164 ?? null,
        address: row.provider_address ?? null,
      },
      available,
      booking_fee: settings.booking_fee,
      cancellation_cutoff_hours: settings.cancellation_cutoff_hours,
    },
    meta: {
      images: imageLinks([...galleryKeys, card.provider.logo_image_key]),
    },
  }
}

export async function vehicleQuote(id: unknown, input: Row) {
  const settings = await rentalSettings()
  const window = requireWindow(input, settings)
  const withDriver = booleanParam(input.with_driver, 'with_driver') ?? false
  const row = await findVisibleVehicle(id)
  assertDriverChoice(row, withDriver)
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
        bookingFee: settings.booking_fee,
      }),
    },
  }
}
