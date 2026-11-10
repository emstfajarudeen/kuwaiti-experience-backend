import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { scheduleFromRows, scheduleRows, type DaySchedule } from './rental_branch_service.js'
import { sendProviderEmail } from './rental_provider_mailer.js'
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
  cancellationCutoffHours?: number | null
}

export async function saveSettings(input: SettingsInput, actorId: number) {
  await db.transaction(async (trx) => {
    const values = {
      booking_fee: kwd(toFils(input.bookingFee)),
      hold_minutes: input.holdMinutes,
      min_lead_minutes: input.minLeadMinutes,
      max_rental_days: input.maxRentalDays,
      ...(input.cancellationCutoffHours === undefined || input.cancellationCutoffHours === null
        ? {}
        : { cancellation_cutoff_hours: input.cancellationCutoffHours }),
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

export type PlaceInput = {
  nameEn: string
  nameAr: string | null
  subtitleEn: string | null
  subtitleAr: string | null
  latitude: number | null
  longitude: number | null
  active: boolean
  sortOrder: number
}

export async function listPlaces() {
  return (await db
    .from('rental_places as pl')
    .select(
      'pl.*',
      db.raw('(select count(*) from rental_locations l where l.place_id = pl.id) as branch_count')
    )
    .orderBy('pl.sort_order')
    .orderBy('pl.id')) as Row[]
}

export async function findPlace(id: number) {
  return ((await db.from('rental_places').where('id', id).first()) as Row | undefined) ?? null
}

export async function savePlace(input: PlaceInput, actorId: number, id?: number) {
  return db.transaction(async (trx) => {
    const values = {
      name_en: input.nameEn,
      name_ar: input.nameAr,
      subtitle_en: input.subtitleEn,
      subtitle_ar: input.subtitleAr,
      latitude: input.latitude,
      longitude: input.longitude,
      active: input.active,
      sort_order: input.sortOrder,
      updated_at: new Date(),
    }
    let savedId = id
    if (id) {
      if (!(await trx.from('rental_places').where('id', id).update(values)))
        throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    } else {
      ;[savedId] = await trx.table('rental_places').insert({ ...values, created_at: new Date() })
    }
    await audit(trx, actorId, 'rental_place', Number(savedId), id ? 'update' : 'create')
    return Number(savedId)
  })
}

export async function setPlaceActive(id: number, active: boolean, actorId: number) {
  await db.transaction(async (trx) => {
    if (!(await trx.from('rental_places').where('id', id).forUpdate().first()))
      throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    await trx.from('rental_places').where('id', id).update({ active, updated_at: new Date() })
    await audit(trx, actorId, 'rental_place', id, active ? 'activate' : 'deactivate')
  })
}

export async function deletePlace(id: number, actorId: number) {
  await db.transaction(async (trx) => {
    if (await trx.from('rental_locations').where('place_id', id).first())
      throw new ApiError(
        409,
        'PLACE_IN_USE',
        'Provider branches are linked to this place. Move them to another place or deactivate it.'
      )
    if (!(await trx.from('rental_places').where('id', id).delete()))
      throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    await audit(trx, actorId, 'rental_place', id, 'delete')
  })
}

export async function placeOptions() {
  const rows = await db
    .from('rental_places')
    .select('id', 'name_en', 'active')
    .orderBy('sort_order')
    .orderBy('id')
  return rows.map((row) => ({
    value: String(row.id),
    label: row.active ? (row.name_en as string) : `${row.name_en} (inactive)`,
  }))
}

export type LocationInput = {
  providerId: number
  placeId: number
  phone: string | null
  hoursEnabled: boolean
  schedule: DaySchedule[]
  closures: Array<{ startsOn: string; endsOn: string; reason: string | null }>
  nameEn: string
  nameAr: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  active: boolean
  sortOrder: number
}

export async function listLocations(providerId?: number) {
  const query = db.from('rental_locations as l')
  if (providerId) query.where('l.provider_id', providerId)
  return (await query
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
  const row = (await db.from('rental_locations').where('id', id).first()) as Row | undefined
  if (!row) return null
  const [hours, closures] = await Promise.all([
    db.from('rental_location_hours').where('location_id', id),
    db.from('rental_location_closures').where('location_id', id).orderBy('starts_on'),
  ])
  return { row, schedule: scheduleFromRows(hours as Row[]), closures: closures as Row[] }
}

export async function saveLocation(input: LocationInput, actorId: number, id?: number) {
  const hours = scheduleRows(input.schedule)
  if (input.hoursEnabled && !hours.length)
    throw new ApiError(422, 'VALIDATION_ERROR', 'Open the branch on at least one day.', {
      schedule: ['Open the branch on at least one day.'],
    })
  for (const closure of input.closures)
    if (closure.endsOn < closure.startsOn)
      throw new ApiError(422, 'VALIDATION_ERROR', 'A closed period ends before it starts.', {
        closures: ['A closed period ends before it starts.'],
      })
  if (!(await db.from('rental_providers').where('id', input.providerId).first()))
    throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a provider.', {
      providerId: ['Choose a provider.'],
    })
  if (!(await db.from('rental_places').where('id', input.placeId).first()))
    throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a pickup place.', {
      placeId: ['Choose a pickup place.'],
    })
  return db.transaction(async (trx) => {
    const values = {
      provider_id: input.providerId,
      place_id: input.placeId,
      phone_e164: input.phone,
      hours_enabled: input.hoursEnabled,
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
    await trx.from('rental_location_hours').where('location_id', savedId!).delete()
    if (hours.length)
      await trx
        .table('rental_location_hours')
        .multiInsert(hours.map((row) => ({ ...row, location_id: savedId })))
    await trx.from('rental_location_closures').where('location_id', savedId!).delete()
    if (input.closures.length)
      await trx.table('rental_location_closures').multiInsert(
        input.closures.map((closure) => ({
          location_id: savedId,
          starts_on: closure.startsOn,
          ends_on: closure.endsOn,
          reason: closure.reason,
          created_at: new Date(),
        }))
      )
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
  extraKmRate: string | null
  dailyRate: string
  rentalMode: 'self_drive' | 'with_driver' | 'both'
  driverDailyRate: string | null
  quantity: number
  insuranceOptionId: number | null
  terms: Array<{ labelEn: string; labelAr: string | null }>
  locationIds: number[]
}

export type VehicleFiles = {
  cover?: PreparedImage
  removeCover?: boolean
  gallery: PreparedImage[]
  /** Positions (1-based, shared with existing images) of the new gallery files, in file order. */
  galleryNewOrder?: number[]
  removeImageIds: number[]
  /** New positions of kept gallery images. */
  galleryOrder: Array<{ id: number; sortOrder: number }>
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
    db
      .from('rental_vehicles as v')
      .join('rental_providers as p', 'p.id', 'v.provider_id')
      .leftJoin('rental_vehicle_types as t', 't.code', 'v.vehicle_type')
  )
    .select('v.*', 'p.name_en as provider_name', 't.name_en as vehicle_type_name')
    .orderBy('v.id', 'desc')
    .limit(PAGE_SIZE)
    .offset((current - 1) * PAGE_SIZE)) as Row[]
  return { rows, total, page: current, lastPage, pageSize: PAGE_SIZE }
}

export async function findVehicle(id: number) {
  const row = (await db.from('rental_vehicles').where('id', id).first()) as Row | undefined
  if (!row) return null
  const [images, locations, terms] = await Promise.all([
    db.from('rental_vehicle_images').where('vehicle_id', id).orderBy('sort_order').orderBy('id'),
    db.from('rental_vehicle_locations').where('vehicle_id', id).select('location_id'),
    db.from('rental_vehicle_terms').where('vehicle_id', id).orderBy('sort_order').orderBy('id'),
  ])
  return {
    row,
    images: images as Row[],
    locationIds: locations.map((item) => Number(item.location_id)),
    terms: terms as Row[],
  }
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    .slice(0, 50)

/** Adds a vehicle type from the vehicle form. Returns the existing one when the name is taken. */
export async function createVehicleType(
  input: { nameEn: string; nameAr?: string | null },
  actorId: number
) {
  return db.transaction(async (trx) => {
    const existing = await trx
      .from('rental_vehicle_types')
      .whereRaw('lower(name_en) = ?', [input.nameEn.toLowerCase()])
      .first()
    if (existing) return { value: existing.code as string, label: existing.name_en as string }
    let code = slug(input.nameEn) || 'type'
    for (let n = 2; await trx.from('rental_vehicle_types').where('code', code).first(); n++)
      code = `${slug(input.nameEn) || 'type'}_${n}`
    const last = await trx.from('rental_vehicle_types').max('sort_order as last').first()
    const [id] = await trx.table('rental_vehicle_types').insert({
      code,
      name_en: input.nameEn,
      name_ar: input.nameAr ?? null,
      sort_order: Number(last?.last ?? -1) + 1,
      created_at: new Date(),
    })
    await audit(trx, actorId, 'rental_vehicle_type', Number(id), 'create')
    return { value: code, label: input.nameEn }
  })
}

/** Adds an insurance option from the vehicle form. Returns the existing one when the name is taken. */
export async function createInsuranceOption(
  input: { nameEn: string; nameAr?: string | null },
  actorId: number
) {
  return db.transaction(async (trx) => {
    const existing = await trx
      .from('rental_insurance_options')
      .whereRaw('lower(name_en) = ?', [input.nameEn.toLowerCase()])
      .first()
    if (existing) return { value: String(existing.id), label: existing.name_en as string }
    const last = await trx.from('rental_insurance_options').max('sort_order as last').first()
    const [id] = await trx.table('rental_insurance_options').insert({
      name_en: input.nameEn,
      name_ar: input.nameAr ?? null,
      sort_order: Number(last?.last ?? -1) + 1,
      created_at: new Date(),
    })
    await audit(trx, actorId, 'rental_insurance_option', Number(id), 'create')
    return { value: String(id), label: input.nameEn }
  })
}

export async function vehicleFormOptions() {
  const [providers, locations, types, insurance] = await Promise.all([
    db.from('rental_providers').select('id', 'name_en', 'active').orderBy('name_en'),
    db
      .from('rental_locations as l')
      .leftJoin('rental_places as pl', 'pl.id', 'l.place_id')
      .whereNotNull('l.provider_id')
      .select('l.id', 'l.name_en', 'l.active', 'l.provider_id', 'pl.name_en as place_name')
      .orderBy('l.sort_order')
      .orderBy('l.id'),
    db.from('rental_vehicle_types').orderBy('sort_order').orderBy('id'),
    db.from('rental_insurance_options').orderBy('sort_order').orderBy('id'),
  ])
  return {
    vehicleTypes: types.map((row) => ({ value: row.code as string, label: row.name_en as string })),
    insuranceOptions: insurance.map((row) => ({
      value: String(row.id),
      label: row.name_en as string,
    })),
    providers: providers.map((row) => ({
      id: Number(row.id),
      name: row.name_en as string,
      active: Boolean(row.active),
    })),
    locations: locations.map((row) => ({
      id: Number(row.id),
      name:
        row.place_name && row.place_name !== row.name_en
          ? `${row.place_name} — ${row.name_en}`
          : (row.name_en as string),
      active: Boolean(row.active),
      provider_id: Number(row.provider_id),
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
  const withDriver = input.rentalMode !== 'self_drive'
  if (!(await db.from('rental_vehicle_types').where('code', input.vehicleType).first()))
    fieldError('vehicleType', 'Choose a vehicle type.')
  if (
    input.insuranceOptionId &&
    !(await db.from('rental_insurance_options').where('id', input.insuranceOptionId).first())
  )
    fieldError('insuranceOptionId', 'Choose an insurance option.')
  if (withDriver && !input.driverDailyRate)
    fieldError('driverDailyRate', 'Enter the daily driver rate.')
  if (!(await db.from('rental_providers').where('id', input.providerId).first()))
    fieldError('providerId', 'Choose a valid provider.')
  const locationIds = [...new Set(input.locationIds)]
  if (!locationIds.length) fieldError('locationIds', 'Choose at least one pickup location.')
  const found = await db
    .from('rental_locations')
    .whereIn('id', locationIds)
    .where('provider_id', input.providerId)
    .count('* as total')
    .first()
  if (Number(found?.total ?? 0) !== locationIds.length)
    fieldError('locationIds', "Choose branches of this vehicle's provider.")

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
        extra_km_rate:
          input.mileageLimitKm !== null && input.extraKmRate !== null
            ? kwd(toFils(input.extraKmRate))
            : null,
        daily_rate: kwd(toFils(input.dailyRate)),
        with_driver_available: withDriver,
        self_drive_available: input.rentalMode !== 'with_driver',
        driver_daily_rate: withDriver ? kwd(toFils(input.driverDailyRate)) : null,
        quantity: input.quantity,
        insurance_option_id: input.insuranceOptionId,
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
      for (const item of files.galleryOrder)
        await trx
          .from('rental_vehicle_images')
          .where({ vehicle_id: vehicleId!, id: item.id })
          .update({ sort_order: item.sortOrder })
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
        const positions =
          files.galleryNewOrder?.length === galleryKeys.length ? files.galleryNewOrder : null
        await trx.table('rental_vehicle_images').multiInsert(
          galleryKeys.map((key, index) => ({
            vehicle_id: vehicleId,
            storage_key: key,
            sort_order: positions ? positions[index] : start + index,
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
      await trx.from('rental_vehicle_terms').where('vehicle_id', vehicleId!).delete()
      if (input.terms.length)
        await trx.table('rental_vehicle_terms').multiInsert(
          input.terms.map((term, index) => ({
            vehicle_id: vehicleId,
            label_en: term.labelEn,
            label_ar: term.labelAr,
            sort_order: index,
            created_at: new Date(),
          }))
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
      'p.name_en as provider_name',
      db.raw(
        "(select count(*) from rental_payments as rp where rp.booking_id = b.id and rp.status = 'paid') as paid_count"
      )
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
  const [payments, review, providerEmails] = await Promise.all([
    db.from('rental_payments').where('booking_id', id).orderBy('id', 'desc') as Promise<Row[]>,
    db.from('rental_reviews').where('booking_id', id).first() as Promise<Row | undefined>,
    db
      .from('rental_provider_emails')
      .where('booking_id', id)
      .orderBy('id', 'desc')
      .limit(20) as Promise<Row[]>,
  ])
  return { row, payments, review: review ?? null, providerEmails }
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
  let wasConfirmed = false
  await db.transaction(async (trx) => {
    const row = await trx.from('rental_bookings').where('id', id).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Booking not found')
    wasConfirmed = row.status === 'confirmed'
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
  if (wasConfirmed) await sendProviderEmail(id, 'cancelled', actorId)
}
