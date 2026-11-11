import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { ApiError } from './api_error.js'
import { withStoredImages, type PreparedImage } from './image_storage_service.js'
import { createCustomerNotification } from './customer_notification_service.js'

type Row = Record<string, any>

export type DriverInput = {
  providerId: number
  name: string
  phone: string | null
  active: boolean
}

function fieldError(field: string, message: string): never {
  throw new ApiError(422, 'VALIDATION_ERROR', message, { [field]: [message] })
}

async function audit(actorId: number, id: number, action: string) {
  await db.table('audit_logs').insert({
    actor_id: actorId,
    action: `rental_driver.${action}`,
    entity_type: 'rental_driver',
    entity_id: String(id),
    created_at: new Date(),
  })
}

/** Drivers of one provider (or all), with their upcoming assignments. */
export async function listDrivers(providerId?: number) {
  const query = db
    .from('rental_drivers as d')
    .join('rental_providers as p', 'p.id', 'd.provider_id')
    .select(
      'd.*',
      'p.name_en as provider_name',
      db.raw(
        "(select count(*) from rental_bookings b where b.driver_id = d.id and b.status = 'confirmed' and b.return_at > ?) as upcoming_count",
        [new Date()]
      )
    )
    .orderBy('d.active', 'desc')
    .orderBy('d.name')
  if (providerId) query.where('d.provider_id', providerId)
  return (await query) as Row[]
}

export async function driverCounts() {
  const rows = await db
    .from('rental_drivers')
    .groupBy('provider_id')
    .select('provider_id', db.raw('count(*) as total'))
  return new Map(rows.map((row) => [Number(row.provider_id), Number(row.total)]))
}

export async function findDriver(id: number) {
  return ((await db.from('rental_drivers').where('id', id).first()) as Row | undefined) ?? null
}

export async function saveDriver(
  input: DriverInput,
  files: { photo?: PreparedImage; removePhoto: boolean },
  actorId: number,
  id?: number
) {
  if (!(await db.from('rental_providers').where('id', input.providerId).first()))
    fieldError('providerId', 'Choose a provider.')
  return withStoredImages(files.photo ? [files.photo] : [], async ([photoKey]) =>
    db.transaction(async (trx) => {
      const existing = id
        ? await trx.from('rental_drivers').where('id', id).forUpdate().first()
        : null
      if (id && !existing) throw new ApiError(404, 'NOT_FOUND', 'Driver not found')
      if (existing && Number(existing.provider_id) !== input.providerId)
        fieldError('providerId', 'A driver cannot move to another provider.')
      const released: Array<string | null> = []
      let photo = existing?.photo_image_key ?? null
      if (photoKey || files.removePhoto) {
        released.push(photo)
        photo = photoKey ?? null
      }
      const values = {
        provider_id: input.providerId,
        name: input.name,
        phone_e164: input.phone,
        photo_image_key: photo,
        active: input.active,
        updated_at: new Date(),
      }
      let savedId = id
      if (id) await trx.from('rental_drivers').where('id', id).update(values)
      else {
        const [newId] = await trx
          .table('rental_drivers')
          .insert({ ...values, created_at: new Date() })
        savedId = Number(newId)
      }
      await trx.table('audit_logs').insert({
        actor_id: actorId,
        action: `rental_driver.${id ? 'update' : 'create'}`,
        entity_type: 'rental_driver',
        entity_id: String(savedId),
        created_at: new Date(),
      })
      return { result: Number(savedId), released }
    })
  )
}

export async function setDriverActive(id: number, active: boolean, actorId: number) {
  const updated = await db
    .from('rental_drivers')
    .where('id', id)
    .update({ active, updated_at: new Date() })
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Driver not found')
  await audit(actorId, id, active ? 'activate' : 'deactivate')
}

/** Drivers who were assigned to a booking stay for the booking history; turn them off instead. */
export async function deleteDriver(id: number, actorId: number) {
  const row = await findDriver(id)
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Driver not found')
  if (await db.from('rental_bookings').where('driver_id', id).first())
    throw new ApiError(
      409,
      'DRIVER_IN_USE',
      'This driver was assigned to bookings, so it is kept for their history. Turn the driver off instead.'
    )
  await withStoredImages([], async () => {
    await db.from('rental_drivers').where('id', id).delete()
    await audit(actorId, id, 'delete')
    return { result: null, released: [row.photo_image_key] }
  })
}

const overlapping = (query: any, booking: Row) =>
  query
    .where('b.status', 'confirmed')
    .whereNot('b.id', booking.id)
    .where('b.pickup_at', '<', booking.return_at)
    .where('b.return_at', '>', booking.pickup_at)

/** The provider's active drivers for a booking, marking those busy with another booking then. */
export async function driverChoices(booking: Row) {
  const drivers = (await db
    .from('rental_drivers')
    .where('provider_id', booking.provider_id)
    .where((query) => {
      query.where('active', true)
      if (booking.driver_id) query.orWhere('id', booking.driver_id)
    })
    .orderBy('name')) as Row[]
  const busyRows = (await overlapping(db.from('rental_bookings as b'), booking)
    .whereIn(
      'b.driver_id',
      drivers.map((driver) => driver.id)
    )
    .select('b.driver_id')) as Row[]
  const busy = new Set(busyRows.map((row) => Number(row.driver_id)))
  return drivers.map((driver) => ({
    id: Number(driver.id),
    name: driver.name as string,
    phone: (driver.phone_e164 as string | null) ?? null,
    photo_image_key: (driver.photo_image_key as string | null) ?? null,
    active: Boolean(driver.active),
    busy: busy.has(Number(driver.id)),
  }))
}

/**
 * Assigns (or with `driverId` null, removes) the driver of a confirmed with-driver booking.
 * A driver cannot drive two bookings that overlap. The customer is notified of a new driver.
 */
export async function assignDriver(bookingId: number, driverId: number | null, actorId: number) {
  const outcome = await db.transaction(async (trx) => {
    const booking = await trx.from('rental_bookings').where('id', bookingId).forUpdate().first()
    if (!booking) throw new ApiError(404, 'NOT_FOUND', 'Booking not found')
    if (!booking.with_driver)
      throw new ApiError(409, 'NO_DRIVER_BOOKED', 'This booking is self-drive.')
    if (booking.status !== 'confirmed')
      throw new ApiError(
        409,
        'INVALID_BOOKING_STATUS',
        'A driver can only be assigned to a confirmed booking.'
      )
    if (driverId === null) {
      await trx
        .from('rental_bookings')
        .where('id', bookingId)
        .update({ driver_id: null, driver_assigned_at: null, updated_at: new Date() })
      return { booking, driver: null, changed: booking.driver_id !== null }
    }
    // Lock the driver so two bookings cannot take it for the same time at once.
    const driver = await trx.from('rental_drivers').where('id', driverId).forUpdate().first()
    if (!driver || Number(driver.provider_id) !== Number(booking.provider_id))
      fieldError('driverId', "Choose one of this provider's drivers.")
    if (!driver.active && Number(booking.driver_id) !== driverId)
      fieldError('driverId', 'This driver is turned off.')
    const clash = await overlapping(trx.from('rental_bookings as b'), booking)
      .where('b.driver_id', driverId)
      .select('b.reference')
      .first()
    if (clash)
      throw new ApiError(
        409,
        'DRIVER_BUSY',
        `${driver.name} already drives booking ${clash.reference} at that time.`,
        { driverId: [`Busy with booking ${clash.reference} at that time.`] }
      )
    const changed = Number(booking.driver_id) !== driverId
    if (changed)
      await trx
        .from('rental_bookings')
        .where('id', bookingId)
        .update({ driver_id: driverId, driver_assigned_at: new Date(), updated_at: new Date() })
    return { booking, driver, changed }
  })
  if (outcome.changed)
    await db.table('audit_logs').insert({
      actor_id: actorId,
      action: driverId ? 'rental_booking.assign_driver' : 'rental_booking.remove_driver',
      entity_type: 'rental_booking',
      entity_id: String(bookingId),
      created_at: new Date(),
    })
  if (outcome.driver && outcome.changed) await notifyDriverAssigned(outcome.booking, outcome.driver)
  return outcome
}

async function notifyDriverAssigned(booking: Row, driver: Row) {
  try {
    await createCustomerNotification(Number(booking.customer_id), {
      type: 'rental_driver_assigned',
      title: 'Your driver is assigned',
      body: `${driver.name} will be your driver for car rental ${booking.reference}.`,
      title_ar: 'تم تعيين السائق',
      body_ar: `سيكون ${driver.name} سائقك لحجز السيارة ${booking.reference}.`,
      action_data: {
        type: 'rental_booking',
        booking_id: Number(booking.id),
        reference: booking.reference,
      },
    })
  } catch (error) {
    logger.error({ err: error, bookingId: booking.id }, 'Driver assignment notification failed')
  }
}
