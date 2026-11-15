import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ApiError } from './api_error.js'
import type { PublicLocale } from './public_localization.js'

type Row = Record<string, any>
type Client = typeof db | TransactionClientContract

/**
 * Address pickup (with-driver bookings): the driver collects the customer at their own address.
 *
 * Kuwait is split into service areas, each a named pin. An address belongs to the area whose
 * pin is nearest; providers list the areas they do not serve. Before any area exists, every
 * address inside Kuwait is accepted and no provider is excluded.
 */

/** A rough box around Kuwait; addresses outside it are never served. */
const KUWAIT = { minLat: 28.5, maxLat: 30.15, minLng: 46.5, maxLng: 48.5 }
/** An address farther than this from every area pin is outside the service. */
export const MAX_AREA_DISTANCE_KM = 25

export type PickupAddress = {
  address: string
  latitude: number
  longitude: number
  area: Row | null
}

/** Great-circle distance in kilometres. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const outside = (field: string) =>
  new ApiError(422, 'OUTSIDE_SERVICE_AREA', 'We do not pick up from this location yet', {
    [field]: ['Choose an address inside our service area'],
  })

/** The service area an address belongs to, or null while no areas are set up. */
export async function areaFor(client: Client, latitude: number, longitude: number, field: string) {
  if (
    latitude < KUWAIT.minLat ||
    latitude > KUWAIT.maxLat ||
    longitude < KUWAIT.minLng ||
    longitude > KUWAIT.maxLng
  )
    throw outside(field)
  const areas = (await client.from('rental_service_areas').where('active', true)) as Row[]
  if (!areas.length) return null
  let best: Row | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const area of areas) {
    const distance = distanceKm(latitude, longitude, Number(area.latitude), Number(area.longitude))
    if (distance < bestDistance) {
      best = area
      bestDistance = distance
    }
  }
  if (!best || bestDistance > MAX_AREA_DISTANCE_KM) throw outside(field)
  return best
}

/** Providers that do not serve this area. */
export async function excludedProviderIds(client: Client, areaId: number | null) {
  if (!areaId) return new Set<number>()
  const rows = await client
    .from('rental_provider_excluded_areas')
    .where('area_id', areaId)
    .select('provider_id')
  return new Set(rows.map((row: Row) => Number(row.provider_id)))
}

/** Throws when the provider does not serve the address's area. */
export async function assertProviderServes(
  client: Client,
  providerId: number,
  area: Row | null,
  field: string
) {
  if (!area) return
  const excluded = await client
    .from('rental_provider_excluded_areas')
    .where({ provider_id: providerId, area_id: area.id })
    .first()
  if (excluded)
    throw new ApiError(
      422,
      'OUTSIDE_SERVICE_AREA',
      'This provider does not pick up from that area',
      { [field]: [`Pickup in ${area.name_en} is not available for this car`] }
    )
}

export type AddressInput = {
  pickup_name?: string | null
  pickup_lat?: number
  pickup_lng?: number
  pickup_saved_address_id?: number
}

export const hasAddress = (input: AddressInput) =>
  input.pickup_lat !== undefined ||
  input.pickup_lng !== undefined ||
  input.pickup_saved_address_id !== undefined

/**
 * The address the driver collects the customer from: one of the customer's saved addresses,
 * or a spot picked on the map (`pickup_name` + `pickup_lat` + `pickup_lng`).
 */
export async function resolvePickupAddress(
  client: Client,
  customerId: number | null,
  input: AddressInput
): Promise<PickupAddress> {
  const mapped = input.pickup_lat !== undefined || input.pickup_lng !== undefined
  if (input.pickup_saved_address_id !== undefined && mapped)
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      'Send a saved address or a map location, not both',
      {
        pickup_saved_address_id: [
          'Send pickup_saved_address_id or pickup_lat/pickup_lng, not both',
        ],
      }
    )
  if (input.pickup_saved_address_id !== undefined) {
    const saved = customerId
      ? await client
          .from('customer_saved_addresses')
          .where({ id: input.pickup_saved_address_id, customer_id: customerId })
          .first()
      : null
    if (!saved)
      throw new ApiError(422, 'VALIDATION_ERROR', 'Saved address not found', {
        pickup_saved_address_id: ['Choose one of your saved addresses'],
      })
    const latitude = Number(saved.latitude)
    const longitude = Number(saved.longitude)
    const address = [saved.address, saved.notes].filter(Boolean).join(' · ').slice(0, 500)
    return {
      address,
      latitude,
      longitude,
      area: await areaFor(client, latitude, longitude, 'pickup_saved_address_id'),
    }
  }
  if (input.pickup_lat === undefined || input.pickup_lng === undefined)
    throw new ApiError(422, 'VALIDATION_ERROR', 'Send both pickup_lat and pickup_lng', {
      [input.pickup_lat === undefined ? 'pickup_lat' : 'pickup_lng']: [
        'Send both pickup_lat and pickup_lng',
      ],
    })
  const name = input.pickup_name?.trim()
  if (!name)
    throw new ApiError(422, 'VALIDATION_ERROR', 'Send the pickup address', {
      pickup_name: ['Send the address text shown to the customer'],
    })
  return {
    address: name.slice(0, 500),
    latitude: input.pickup_lat,
    longitude: input.pickup_lng,
    area: await areaFor(client, input.pickup_lat, input.pickup_lng, 'pickup_lat'),
  }
}

export function areaSummary(area: Row | null, locale: PublicLocale) {
  if (!area) return null
  return {
    id: Number(area.id),
    name: (locale === 'ar' && area.name_ar?.trim() ? area.name_ar : area.name_en) as string,
  }
}

// ---------------------------------------------------------------- CMS

export type AreaInput = {
  nameEn: string
  nameAr: string | null
  latitude: number
  longitude: number
  active: boolean
  sortOrder: number
}

async function audit(client: Client, actorId: number, id: number, action: string) {
  await client.table('audit_logs').insert({
    actor_id: actorId,
    action: `rental_service_area.${action}`,
    entity_type: 'rental_service_area',
    entity_id: String(id),
    created_at: new Date(),
  })
}

export async function listAreas() {
  return (await db
    .from('rental_service_areas as a')
    .select(
      'a.*',
      db.raw(
        '(select count(*) from rental_provider_excluded_areas x where x.area_id = a.id) as excluded_count'
      )
    )
    .orderBy('a.sort_order')
    .orderBy('a.name_en')) as Row[]
}

export async function findArea(id: number) {
  return (
    ((await db.from('rental_service_areas').where('id', id).first()) as Row | undefined) ?? null
  )
}

export async function saveArea(input: AreaInput, actorId: number, id?: number) {
  return db.transaction(async (trx) => {
    const values = {
      name_en: input.nameEn,
      name_ar: input.nameAr,
      latitude: input.latitude,
      longitude: input.longitude,
      active: input.active,
      sort_order: input.sortOrder,
      updated_at: new Date(),
    }
    let savedId = id
    if (id) {
      if (!(await trx.from('rental_service_areas').where('id', id).update(values)))
        throw new ApiError(404, 'NOT_FOUND', 'Area not found')
    } else {
      ;[savedId] = await trx
        .table('rental_service_areas')
        .insert({ ...values, created_at: new Date() })
    }
    await audit(trx, actorId, Number(savedId), id ? 'update' : 'create')
    return Number(savedId)
  })
}

export async function setAreaActive(id: number, active: boolean, actorId: number) {
  await db.transaction(async (trx) => {
    if (!(await trx.from('rental_service_areas').where('id', id).forUpdate().first()))
      throw new ApiError(404, 'NOT_FOUND', 'Area not found')
    await trx
      .from('rental_service_areas')
      .where('id', id)
      .update({ active, updated_at: new Date() })
    await audit(trx, actorId, id, active ? 'activate' : 'deactivate')
  })
}

/** Bookings keep their own copy of the address, so deleting an area never changes them. */
export async function deleteArea(id: number, actorId: number) {
  await db.transaction(async (trx) => {
    if (!(await trx.from('rental_service_areas').where('id', id).delete()))
      throw new ApiError(404, 'NOT_FOUND', 'Area not found')
    await audit(trx, actorId, id, 'delete')
  })
}

export async function areaOptions() {
  const rows = await db
    .from('rental_service_areas')
    .select('id', 'name_en', 'active')
    .orderBy('sort_order')
    .orderBy('name_en')
  return rows.map((row: Row) => ({
    value: Number(row.id),
    label: row.active ? (row.name_en as string) : `${row.name_en} (inactive)`,
  }))
}

export async function providerExcludedAreaIds(providerId: number) {
  const rows = await db
    .from('rental_provider_excluded_areas')
    .where('provider_id', providerId)
    .select('area_id')
  return rows.map((row: Row) => Number(row.area_id))
}

/** Replaces the areas a provider does not serve. */
export async function setProviderExcludedAreas(
  client: Client,
  providerId: number,
  areaIds: number[]
) {
  const unique = [...new Set(areaIds)].filter((id) => Number.isSafeInteger(id) && id > 0)
  if (unique.length) {
    const found = await client.from('rental_service_areas').whereIn('id', unique).select('id')
    if (found.length !== unique.length)
      throw new ApiError(422, 'VALIDATION_ERROR', 'Choose areas from the list', {
        excludedAreaIds: ['One of the chosen areas no longer exists'],
      })
  }
  await client.from('rental_provider_excluded_areas').where('provider_id', providerId).delete()
  if (unique.length)
    await client
      .table('rental_provider_excluded_areas')
      .multiInsert(unique.map((areaId) => ({ provider_id: providerId, area_id: areaId })))
}
