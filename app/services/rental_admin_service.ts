import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ApiError } from './api_error.js'
import {
  MAX_GALLERY_IMAGES,
  withStoredImages,
  type PreparedImage,
} from './image_storage_service.js'
import { expireStaleHolds } from './rental_booking_service.js'
import { rentalSettings } from './rental_catalog_service.js'
import { kwd, toFils } from './rental_money.js'
import { BOOKING_STATUSES } from '../serializers/rental.js'

type Row = Record<string, any>
const PAGE_SIZE = 20

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

function page(value: unknown) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 10000) : 1
}

function isForeignKeyError(error: unknown) {
  const code = (error as { code?: string }).code
  return code === 'ER_ROW_IS_REFERENCED_2' || code === 'ER_ROW_IS_REFERENCED'
}

// ---------------------------------------------------------------- settings

export type SettingsInput = {
  bookingFee: string
  holdMinutes: number
  minLeadMinutes: number
  maxRentalDays: number
  cancellationCutoffHours: number
}

export async function saveSettings(input: SettingsInput, actorId: number) {
  await db.transaction(async (trx) => {
    const values = {
      booking_fee: kwd(toFils(input.bookingFee)),
      hold_minutes: input.holdMinutes,
      min_lead_minutes: input.minLeadMinutes,
      max_rental_days: input.maxRentalDays,
      cancellation_cutoff_hours: input.cancellationCutoffHours,
      updated_at: new Date(),
    }
    const existing = await trx.from('rental_settings').where('id', 1).forUpdate().first()
    if (existing) await trx.from('rental_settings').where('id', 1).update(values)
    else await trx.table('rental_settings').insert({ id: 1, ...values })
    await audit(trx, actorId, 'rental_settings', 1, 'update')
  })
}

export { rentalSettings }

// --------------------------------------------------------------- locations

export type LocationInput = {
  nameEn: string
  nameAr: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  active: boolean
  sortOrder: number
}

export async function listLocations() {
  return (await db
    .from('rental_locations as l')
    .select(
      'l.*',
      db.raw(
        '(select count(*) from rental_vehicle_locations vl where vl.location_id = l.id) as vehicle_count'
      )
    )
    .orderBy('l.sort_order')
    .orderBy('l.id')) as Row[]
}

export async function findLocation(id: number) {
  return ((await db.from('rental_locations').where('id', id).first()) as Row | undefined) ?? null
}

export async function saveLocation(input: LocationInput, actorId: number, id?: number) {
  return db.transaction(async (trx) => {
    const values = {
      name_en: input.nameEn,
      name_ar: input.nameAr,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      active: input.active,
      sort_order: input.sortOrder,
      updated_at: new Date(),
    }
    let savedId = id
    if (id) {
      const updated = await trx.from('rental_locations').where('id', id).update(values)
      if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Location not found')
    } else {
      ;[savedId] = await trx.table('rental_locations').insert({ ...values, created_at: new Date() })
    }
    await audit(trx, actorId, 'rental_location', Number(savedId), id ? 'update' : 'create')
    return Number(savedId)
  })
}

export async function setLocationActive(id: number, active: boolean, actorId: number) {
  await db.transaction(async (trx) => {
    const row = await trx.from('rental_locations').where('id', id).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Location not found')
    await trx.from('rental_locations').where('id', id).update({ active, updated_at: new Date() })
    await audit(trx, actorId, 'rental_location', id, active ? 'activate' : 'deactivate')
  })
}

export async function deleteLocation(id: number, actorId: number) {
  try {
    await db.transaction(async (trx) => {
      if (!(await trx.from('rental_locations').where('id', id).delete()))
        throw new ApiError(404, 'NOT_FOUND', 'Location not found')
      await audit(trx, actorId, 'rental_location', id, 'delete')
    })
  } catch (error) {
    if (isForeignKeyError(error))
      throw new ApiError(
        409,
        'LOCATION_IN_USE',
        'Bookings use this location. Deactivate it instead.'
      )
    throw error
  }
}

// --------------------------------------------------------------- providers

export type ProviderInput = {
  nameEn: string
  nameAr: string | null
  phone: string | null
  email: string | null
  address: string | null
  active: boolean
}

export async function listProviders() {
  return (await db
    .from('rental_providers as p')
    .select(
      'p.*',
      db.raw('(select count(*) from rental_vehicles v where v.provider_id = p.id) as vehicle_count')
    )
    .orderBy('p.name_en')) as Row[]
}

export async function findProvider(id: number) {
  return ((await db.from('rental_providers').where('id', id).first()) as Row | undefined) ?? null
}

export async function saveProvider(
  input: ProviderInput,
  files: { logo?: PreparedImage; removeLogo?: boolean },
  actorId: number,
  id?: number
) {
  return withStoredImages(files.logo ? [files.logo] : [], async ([logoKey]) =>
    db.transaction(async (trx) => {
      const existing = id
        ? await trx.from('rental_providers').where('id', id).forUpdate().first()
        : null
      if (id && !existing) throw new ApiError(404, 'NOT_FOUND', 'Provider not found')
      const released: Array<string | null> = []
      let logo = existing?.logo_image_key ?? null
      if (logoKey || files.removeLogo) {
        released.push(logo)
        logo = logoKey ?? null
      }
      const values = {
        name_en: input.nameEn,
        name_ar: input.nameAr,
        phone_e164: input.phone,
        email: input.email,
        address: input.address,
        active: input.active,
        logo_image_key: logo,
        updated_at: new Date(),
      }
      let savedId = id
      if (id) await trx.from('rental_providers').where('id', id).update(values)
      else
        [savedId] = await trx
          .table('rental_providers')
          .insert({ ...values, created_at: new Date() })
      await audit(trx, actorId, 'rental_provider', Number(savedId), id ? 'update' : 'create')
      return { result: Number(savedId), released }
    })
  )
}

export async function setProviderActive(id: number, active: boolean, actorId: number) {
  await db.transaction(async (trx) => {
    const row = await trx.from('rental_providers').where('id', id).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Provider not found')
    await trx.from('rental_providers').where('id', id).update({ active, updated_at: new Date() })
    await audit(trx, actorId, 'rental_provider', id, active ? 'activate' : 'deactivate')
  })
}

export async function deleteProvider(id: number, actorId: number) {
  try {
    await withStoredImages([], async () =>
      db.transaction(async (trx) => {
        const row = await trx.from('rental_providers').where('id', id).forUpdate().first()
        if (!row) throw new ApiError(404, 'NOT_FOUND', 'Provider not found')
        await trx.from('rental_providers').where('id', id).delete()
        await audit(trx, actorId, 'rental_provider', id, 'delete')
        return { result: null, released: [row.logo_image_key] }
      })
    )
  } catch (error) {
    if (isForeignKeyError(error))
      throw new ApiError(
        409,
        'PROVIDER_IN_USE',
        'This provider has vehicles or bookings. Deactivate it instead.'
      )
    throw error
  }
}

// ---------------------------------------------------------------- vehicles

export type VehicleInput = {
  providerId: number
  nameEn: string
  nameAr: string | null
  make: string
  model: string
  year: number | null
  vehicleType: string
  transmission: string
  fuelType: string
  seats: number
  doors: number | null
  bags: number | null
  mileageLimitKm: number | null
  dailyRate: string
  depositAmount: string
  withDriverAvailable: boolean
  driverDailyRate: string | null
  minDriverAge: number
  quantity: number
  insuranceEn: string | null
  insuranceAr: string | null
  termsEn: string | null
  termsAr: string | null
  locationIds: number[]
}

export type VehicleFiles = {
  cover?: PreparedImage
  removeCover?: boolean
  gallery: PreparedImage[]
  removeImageIds: number[]
}

export async function listVehicles(params: {
  status?: string
  providerId?: number
  q?: string
  page?: unknown
}) {
  const status = ['draft', 'published'].includes(params.status ?? '') ? params.status : ''
  const text = (params.q ?? '').trim().slice(0, 120)
  const apply = (query: any) => {
    if (status) query.where('v.status', status)
    if (params.providerId) query.where('v.provider_id', params.providerId)
    if (text)
      query.where((inner: any) =>
        inner
          .where('v.name_en', 'like', `%${text}%`)
          .orWhere('v.make', 'like', `%${text}%`)
          .orWhere('v.model', 'like', `%${text}%`)
      )
    return query
  }
  const totalRow = await apply(db.from('rental_vehicles as v')).count('* as total').first()
  const total = Number(totalRow?.total ?? 0)
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page(params.page), lastPage)
  const rows = (await apply(
    db.from('rental_vehicles as v').join('rental_providers as p', 'p.id', 'v.provider_id')
  )
    .select('v.*', 'p.name_en as provider_name')
    .orderBy('v.id', 'desc')
    .limit(PAGE_SIZE)
    .offset((current - 1) * PAGE_SIZE)) as Row[]
  return { rows, total, page: current, lastPage, pageSize: PAGE_SIZE }
}

export async function findVehicle(id: number) {
  const row = (await db.from('rental_vehicles').where('id', id).first()) as Row | undefined
  if (!row) return null
  const [images, locations, blocks] = await Promise.all([
    db.from('rental_vehicle_images').where('vehicle_id', id).orderBy('sort_order').orderBy('id'),
    db.from('rental_vehicle_locations').where('vehicle_id', id).select('location_id'),
    db
      .from('rental_vehicle_blocks')
      .where('vehicle_id', id)
      .where('ends_at', '>', new Date())
      .orderBy('starts_at'),
  ])
  return {
    row,
    images: images as Row[],
    locationIds: locations.map((item) => Number(item.location_id)),
    blocks: blocks as Row[],
  }
}

export async function vehicleFormOptions() {
  const [providers, locations] = await Promise.all([
    db.from('rental_providers').select('id', 'name_en', 'active').orderBy('name_en'),
    db
      .from('rental_locations')
      .select('id', 'name_en', 'active')
      .orderBy('sort_order')
      .orderBy('id'),
  ])
  return {
    providers: providers.map((row) => ({
      id: Number(row.id),
      name: row.name_en as string,
      active: Boolean(row.active),
    })),
    locations: locations.map((row) => ({
      id: Number(row.id),
      name: row.name_en as string,
      active: Boolean(row.active),
    })),
  }
}

function fieldError(field: string, message: string, code = 'VALIDATION_ERROR'): never {
  throw new ApiError(422, code, message, { [field]: [message] })
}

export async function saveVehicle(
  input: VehicleInput,
  files: VehicleFiles,
  actorId: number,
  id?: number
) {
  if (input.withDriverAvailable && !input.driverDailyRate)
    fieldError('driverDailyRate', 'Enter the daily driver rate.')
  if (!(await db.from('rental_providers').where('id', input.providerId).first()))
    fieldError('providerId', 'Choose a valid provider.')
  const locationIds = [...new Set(input.locationIds)]
  if (!locationIds.length) fieldError('locationIds', 'Choose at least one pickup location.')
  const found = await db
    .from('rental_locations')
    .whereIn('id', locationIds)
    .count('* as total')
    .first()
  if (Number(found?.total ?? 0) !== locationIds.length)
    fieldError('locationIds', 'Choose valid pickup locations.')

  const newImages = [...(files.cover ? [files.cover] : []), ...files.gallery]
  return withStoredImages(newImages, async (keys) =>
    db.transaction(async (trx) => {
      const coverKey = files.cover ? keys[0] : undefined
      const galleryKeys = files.cover ? keys.slice(1) : keys
      const existing = id
        ? await trx.from('rental_vehicles').where('id', id).forUpdate().first()
        : null
      if (id && !existing) throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found')
      const released: Array<string | null> = []
      let cover = existing?.cover_image_key ?? null
      if (coverKey || files.removeCover) {
        released.push(cover)
        cover = coverKey ?? null
      }
      const values = {
        provider_id: input.providerId,
        name_en: input.nameEn,
        name_ar: input.nameAr,
        make: input.make,
        model: input.model,
        year: input.year,
        vehicle_type: input.vehicleType,
        transmission: input.transmission,
        fuel_type: input.fuelType,
        seats: input.seats,
        doors: input.doors,
        bags: input.bags,
        mileage_limit_km: input.mileageLimitKm,
        daily_rate: kwd(toFils(input.dailyRate)),
        deposit_amount: kwd(toFils(input.depositAmount)),
        with_driver_available: input.withDriverAvailable,
        driver_daily_rate: input.withDriverAvailable ? kwd(toFils(input.driverDailyRate)) : null,
        min_driver_age: input.minDriverAge,
        quantity: input.quantity,
        insurance_en: input.insuranceEn,
        insurance_ar: input.insuranceAr,
        terms_en: input.termsEn,
        terms_ar: input.termsAr,
        cover_image_key: cover,
        updated_at: new Date(),
      }
      let vehicleId = id
      if (id) await trx.from('rental_vehicles').where('id', id).update(values)
      else
        [vehicleId] = await trx
          .table('rental_vehicles')
          .insert({ ...values, status: 'draft', created_at: new Date() })

      if (files.removeImageIds.length) {
        const removed = await trx
          .from('rental_vehicle_images')
          .where('vehicle_id', vehicleId!)
          .whereIn('id', files.removeImageIds)
        released.push(...removed.map((image) => image.storage_key))
        await trx
          .from('rental_vehicle_images')
          .where('vehicle_id', vehicleId!)
          .whereIn('id', files.removeImageIds)
          .delete()
      }
      if (galleryKeys.length) {
        const current = await trx
          .from('rental_vehicle_images')
          .where('vehicle_id', vehicleId!)
          .count('* as total')
          .max('sort_order as last')
          .first()
        if (Number(current?.total ?? 0) + galleryKeys.length > MAX_GALLERY_IMAGES)
          fieldError('gallery', `A vehicle can have up to ${MAX_GALLERY_IMAGES} gallery images.`)
        const start = Number(current?.last ?? -1) + 1
        await trx.table('rental_vehicle_images').multiInsert(
          galleryKeys.map((key, index) => ({
            vehicle_id: vehicleId,
            storage_key: key,
            sort_order: start + index,
            created_at: new Date(),
          }))
        )
      }
      await trx.from('rental_vehicle_locations').where('vehicle_id', vehicleId!).delete()
      await trx
        .table('rental_vehicle_locations')
        .multiInsert(
          locationIds.map((locationId) => ({ vehicle_id: vehicleId, location_id: locationId }))
        )
      await audit(trx, actorId, 'rental_vehicle', Number(vehicleId), id ? 'update' : 'create')
      return { result: Number(vehicleId), released }
    })
  )
}

export async function setVehicleStatus(id: number, status: 'draft' | 'published', actorId: number) {
  await db.transaction(async (trx) => {
    const row = await trx.from('rental_vehicles').where('id', id).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found')
    if (status === 'published') {
      const locations = await trx
        .from('rental_vehicle_locations')
        .where('vehicle_id', id)
        .count('* as total')
        .first()
      if (!Number(locations?.total ?? 0))
        throw new ApiError(422, 'NO_LOCATIONS', 'Add a pickup location before publishing.')
    }
    await trx
      .from('rental_vehicles')
      .where('id', id)
      .update({
        status,
        published_at: status === 'published' ? (row.published_at ?? new Date()) : row.published_at,
        updated_at: new Date(),
      })
    await audit(
      trx,
      actorId,
      'rental_vehicle',
      id,
      status === 'published' ? 'publish' : 'unpublish'
    )
  })
}

export async function deleteVehicle(id: number, actorId: number) {
  try {
    await withStoredImages([], async () =>
      db.transaction(async (trx) => {
        const row = await trx.from('rental_vehicles').where('id', id).forUpdate().first()
        if (!row) throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found')
        const images = await trx.from('rental_vehicle_images').where('vehicle_id', id)
        await trx.from('rental_vehicles').where('id', id).delete()
        await audit(trx, actorId, 'rental_vehicle', id, 'delete')
        return {
          result: null,
          released: [row.cover_image_key, ...images.map((image) => image.storage_key)],
        }
      })
    )
  } catch (error) {
    if (isForeignKeyError(error))
      throw new ApiError(409, 'VEHICLE_IN_USE', 'This vehicle has bookings. Unpublish it instead.')
    throw error
  }
}

function parseInstant(value: string, field: string) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) fieldError(field, 'Enter a valid date and time.')
  return date
}

export async function addBlock(
  vehicleId: number,
  input: { startsAt: string; endsAt: string; reason: string | null },
  actorId: number
) {
  const startsAt = parseInstant(input.startsAt, 'startsAt')
  const endsAt = parseInstant(input.endsAt, 'endsAt')
  if (endsAt <= startsAt) fieldError('endsAt', 'The end must be after the start.')
  await db.transaction(async (trx) => {
    if (!(await trx.from('rental_vehicles').where('id', vehicleId).first()))
      throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found')
    const [blockId] = await trx.table('rental_vehicle_blocks').insert({
      vehicle_id: vehicleId,
      starts_at: startsAt,
      ends_at: endsAt,
      reason: input.reason,
      created_at: new Date(),
    })
    await audit(trx, actorId, 'rental_vehicle_block', Number(blockId), 'create')
  })
}

export async function removeBlock(vehicleId: number, blockId: number, actorId: number) {
  await db.transaction(async (trx) => {
    const removed = await trx
      .from('rental_vehicle_blocks')
      .where({ id: blockId, vehicle_id: vehicleId })
      .delete()
    if (!removed) throw new ApiError(404, 'NOT_FOUND', 'Unavailable period not found')
    await audit(trx, actorId, 'rental_vehicle_block', blockId, 'delete')
  })
}

// ---------------------------------------------------------------- bookings

export async function listBookings(params: { status?: string; q?: string; page?: unknown }) {
  await expireStaleHolds()
  const status = (BOOKING_STATUSES as readonly string[]).includes(params.status ?? '')
    ? params.status
    : ''
  const text = (params.q ?? '').trim().slice(0, 120)
  const apply = (query: any) => {
    if (status) query.where('b.status', status)
    if (text)
      query.where((inner: any) =>
        inner
          .where('b.reference', 'like', `%${text}%`)
          .orWhere('c.phone_e164', 'like', `%${text}%`)
          .orWhere('c.first_name', 'like', `%${text}%`)
          .orWhere('c.last_name', 'like', `%${text}%`)
      )
    return query
  }
  const base = () => db.from('rental_bookings as b').join('customers as c', 'c.id', 'b.customer_id')
  const totalRow = await apply(base()).count('* as total').first()
  const total = Number(totalRow?.total ?? 0)
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page(params.page), lastPage)
  const rows = (await apply(base())
    .join('rental_vehicles as v', 'v.id', 'b.vehicle_id')
    .join('rental_providers as p', 'p.id', 'b.provider_id')
    .select(
      'b.*',
      'c.first_name',
      'c.last_name',
      'c.phone_e164',
      'v.name_en as vehicle_name',
      'p.name_en as provider_name'
    )
    .orderBy('b.id', 'desc')
    .limit(PAGE_SIZE)
    .offset((current - 1) * PAGE_SIZE)) as Row[]
  return { rows, total, page: current, lastPage, pageSize: PAGE_SIZE }
}

export async function findBooking(id: number) {
  await expireStaleHolds()
  const row = (await db
    .from('rental_bookings as b')
    .join('customers as c', 'c.id', 'b.customer_id')
    .where('b.id', id)
    .select('b.*', 'c.first_name', 'c.last_name', 'c.phone_e164', 'c.email')
    .first()) as Row | undefined
  if (!row) return null
  const payments = (await db
    .from('rental_payments')
    .where('booking_id', id)
    .orderBy('id', 'desc')) as Row[]
  return { row, payments }
}

export async function completeBooking(id: number, actorId: number) {
  await db.transaction(async (trx) => {
    const row = await trx.from('rental_bookings').where('id', id).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Booking not found')
    if (row.status !== 'confirmed')
      throw new ApiError(409, 'INVALID_BOOKING_STATUS', 'Only confirmed bookings can be completed.')
    if (new Date(row.pickup_at) > new Date())
      throw new ApiError(409, 'NOT_STARTED', 'The rental has not started yet.')
    await trx
      .from('rental_bookings')
      .where('id', id)
      .update({ status: 'completed', completed_at: new Date(), updated_at: new Date() })
    await audit(trx, actorId, 'rental_booking', id, 'complete')
  })
}

export async function cancelBookingByStaff(id: number, reason: string | null, actorId: number) {
  await db.transaction(async (trx) => {
    const row = await trx.from('rental_bookings').where('id', id).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Booking not found')
    if (!['pending_payment', 'confirmed', 'expired'].includes(row.status))
      throw new ApiError(409, 'INVALID_BOOKING_STATUS', 'This booking can no longer be cancelled.')
    const now = new Date()
    await trx.from('rental_bookings').where('id', id).update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: 'staff',
      cancel_reason: reason,
      updated_at: now,
    })
    await audit(trx, actorId, 'rental_booking', id, 'cancel')
  })
}
