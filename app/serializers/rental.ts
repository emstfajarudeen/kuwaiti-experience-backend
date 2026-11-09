import { iso, type Row } from './customer.js'
import { kwd, toFils } from '../services/rental_money.js'
import type { PublicLocale } from '../services/public_localization.js'

export type BookingSnapshot = {
  vehicle: {
    id: number
    name_en: string
    name_ar: string | null
    make: string
    model: string
    year: number | null
    vehicle_type: string
    transmission: string
    seats: number
    cover_image_key: string | null
    mileage_limit_km: number | null
    min_driver_age: number
    insurance_en: string | null
    insurance_ar: string | null
    terms_en: string | null
    terms_ar: string | null
  }
  provider: {
    id: number
    name_en: string
    name_ar: string | null
    phone_e164: string | null
    email: string | null
    address: string | null
  }
  pickup_location: SnapshotLocation
  return_location: SnapshotLocation
}
type SnapshotLocation = {
  id: number
  name_en: string
  name_ar: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
}

export const BOOKING_STATUSES = [
  'pending_payment',
  'confirmed',
  'completed',
  'cancelled',
  'expired',
  'refund_required',
] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

const pick = (en: unknown, ar: unknown, locale: PublicLocale) =>
  (locale === 'ar' && typeof ar === 'string' && ar.trim() ? ar : en) ?? null

export function parseSnapshot(value: unknown): BookingSnapshot {
  return (typeof value === 'string' ? JSON.parse(value) : value) as BookingSnapshot
}

function snapshotLocation(item: SnapshotLocation, locale: PublicLocale) {
  return {
    id: item.id,
    name: pick(item.name_en, item.name_ar, locale),
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
  }
}

export function rentalPayment(row: Row | null | undefined) {
  if (!row) return null
  return {
    id: Number(row.id),
    status: row.status,
    method: row.payment_method ?? null,
    amount: kwd(toFils(row.amount)),
    currency: row.currency,
    paid_at: iso(row.paid_at),
    refunded_at: iso(row.refunded_at),
  }
}

export function rentalBooking(
  row: Row,
  locale: PublicLocale,
  payment: Row | null | undefined,
  canCancel: boolean
) {
  const snapshot = parseSnapshot(row.snapshot)
  const rental = toFils(row.rental_amount)
  const fee = toFils(row.booking_fee)
  return {
    id: Number(row.id),
    type: 'rental' as const,
    reference: row.reference,
    status: row.status as BookingStatus,
    pickup_at: iso(row.pickup_at),
    return_at: iso(row.return_at),
    with_driver: Boolean(row.with_driver),
    vehicle: {
      id: snapshot.vehicle.id,
      name: pick(snapshot.vehicle.name_en, snapshot.vehicle.name_ar, locale),
      make: snapshot.vehicle.make,
      model: snapshot.vehicle.model,
      year: snapshot.vehicle.year,
      vehicle_type: snapshot.vehicle.vehicle_type,
      transmission: snapshot.vehicle.transmission,
      seats: snapshot.vehicle.seats,
      mileage_limit_km: snapshot.vehicle.mileage_limit_km,
      unlimited_mileage: snapshot.vehicle.mileage_limit_km === null,
      min_driver_age: snapshot.vehicle.min_driver_age,
      cover_image_key: snapshot.vehicle.cover_image_key ?? null,
      insurance: pick(snapshot.vehicle.insurance_en, snapshot.vehicle.insurance_ar, locale),
      terms: pick(snapshot.vehicle.terms_en, snapshot.vehicle.terms_ar, locale),
    },
    provider: {
      id: snapshot.provider.id,
      name: pick(snapshot.provider.name_en, snapshot.provider.name_ar, locale),
      phone_e164: snapshot.provider.phone_e164,
      address: snapshot.provider.address,
    },
    pickup_location: snapshotLocation(snapshot.pickup_location, locale),
    return_location: snapshotLocation(snapshot.return_location, locale),
    price: {
      days: Number(row.days),
      daily_rate: kwd(toFils(row.daily_rate)),
      driver_daily_rate: kwd(toFils(row.driver_daily_rate)),
      rental_amount: kwd(rental),
      deposit_amount: kwd(toFils(row.deposit_amount)),
      booking_fee: kwd(fee),
      pay_now: kwd(fee),
      pay_at_pickup: kwd(rental),
      currency: row.currency,
    },
    notes: row.notes ?? null,
    hold_expires_at: row.status === 'pending_payment' ? iso(row.hold_expires_at) : null,
    payment: rentalPayment(payment),
    can_cancel: canCancel,
    cancel_reason: row.cancel_reason ?? null,
    created_at: iso(row.created_at),
    confirmed_at: iso(row.confirmed_at),
    cancelled_at: iso(row.cancelled_at),
    completed_at: iso(row.completed_at),
  }
}
