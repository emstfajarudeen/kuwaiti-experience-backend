import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { ApiError } from './api_error.js'
import { expireStaleHolds } from './rental_booking_service.js'
import { kwd, toFils } from './rental_money.js'
import { parseSnapshot } from '../serializers/rental.js'

type Row = Record<string, any>

const KUWAIT = 'Asia/Kuwait'
/** Hard ceiling so one export can never load an unbounded table into memory. */
export const MAX_REPORT_ROWS = 50000
const MAX_RANGE_DAYS = 366

export type ColumnType = 'text' | 'money' | 'int' | 'datetime' | 'date'
export type ReportColumn = { key: string; label: string; type: ColumnType }
export type SummaryItem = { label: string; value: string | number; type: 'money' | 'int' }
export type FilterOption = { value: string; label: string }
export type ReportFilter = {
  key: 'from' | 'to' | 'provider' | 'status' | 'view' | 'date_by' | 'method' | 'q'
  label: string
  kind: 'date' | 'select' | 'search'
  options?: FilterOption[]
}

export type ReportFilters = {
  from: string
  to: string
  provider: number | null
  status: string
  view: string
  date_by: string
  method: string
  q: string
}

/** A report's table. Money cells hold integer fils, dates hold ISO strings. */
export type ReportResult = {
  columns: ReportColumn[]
  rows: Row[]
  summary: SummaryItem[]
  note?: string
}

export type ReportDefinition = {
  key: string
  title: string
  group: 'Financial' | 'Bookings'
  description: string
  filters: (providers: FilterOption[]) => ReportFilter[]
  run: (filters: ReportFilters) => Promise<ReportResult>
}

// ------------------------------------------------------------------ filters

const DATE = /^\d{4}-\d{2}-\d{2}$/
const text = (value: unknown, max = 60) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

const today = () => DateTime.now().setZone(KUWAIT).startOf('day')

/** Reads the query string into safe filter values. The default range is the last 30 days. */
export function readFilters(input: Record<string, unknown>): ReportFilters {
  const valid = (value: unknown) => {
    const candidate = text(value, 10)
    return DATE.test(candidate) && DateTime.fromISO(candidate, { zone: KUWAIT }).isValid
      ? candidate
      : ''
  }
  let from = valid(input.from)
  let to = valid(input.to)
  if (!to) to = today().toFormat('yyyy-MM-dd')
  if (!from)
    from = DateTime.fromISO(to, { zone: KUWAIT }).minus({ days: 29 }).toFormat('yyyy-MM-dd')
  if (from > to) [from, to] = [to, from]
  const provider = Number(input.provider)
  return {
    from,
    to,
    provider: Number.isSafeInteger(provider) && provider > 0 ? provider : null,
    status: text(input.status, 24),
    view: text(input.view, 16),
    date_by: text(input.date_by, 16),
    method: text(input.method, 40),
    q: text(input.q, 120),
  }
}

/** Kuwait calendar days → UTC instants: [start of `from`, start of the day after `to`). */
function bounds(filters: ReportFilters) {
  const start = DateTime.fromISO(filters.from, { zone: KUWAIT }).startOf('day')
  const end = DateTime.fromISO(filters.to, { zone: KUWAIT }).plus({ days: 1 }).startOf('day')
  if (end.diff(start, 'days').days > MAX_RANGE_DAYS)
    throw new ApiError(422, 'RANGE_TOO_LONG', 'Choose a date range of one year or less.')
  return { start: start.toJSDate(), end: end.toJSDate() }
}

const iso = (value: unknown) => (value ? new Date(value as any).toISOString() : null)
const fils = (value: unknown) => toFils(value)
const sum = (rows: Row[], pick: (row: Row) => number) =>
  rows.reduce((total, row) => total + pick(row), 0)

function limited<T>(rows: T[]): T[] {
  if (rows.length > MAX_REPORT_ROWS)
    throw new ApiError(
      422,
      'REPORT_TOO_LARGE',
      `This report has more than ${MAX_REPORT_ROWS.toLocaleString('en')} rows. Narrow the date range or add a filter.`
    )
  return rows
}

const customerName = (row: Row) => `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim()

const PAYMENT_STATUSES = ['paid', 'refunded', 'failed', 'initiated']
const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Unpaid (on hold)',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Unpaid (expired)',
  refund_required: 'Refund required',
  initiated: 'Started',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
}
const label = (status: unknown) => STATUS_LABEL[String(status)] ?? String(status ?? '')

const BOOKING_STATUS_OPTIONS: FilterOption[] = [
  ...['confirmed', 'completed', 'cancelled', 'refund_required', 'pending_payment', 'expired'].map(
    (value) => ({ value, label: STATUS_LABEL[value] })
  ),
  { value: 'all', label: 'All, including unpaid' },
]

// ------------------------------------------------- 1. booking-fee collection

const feeBase = () =>
  db
    .from('rental_payments as rp')
    .join('rental_bookings as b', 'b.id', 'rp.booking_id')
    .join('rental_providers as p', 'p.id', 'b.provider_id')
    .join('customers as c', 'c.id', 'b.customer_id')

async function feeReport(filters: ReportFilters): Promise<ReportResult> {
  const { start, end } = bounds(filters)
  const query = feeBase()
    // A payment belongs to the day it was paid; unfinished ones to the day they were started.
    .whereRaw(
      'coalesce(rp.paid_at, rp.created_at) >= ? and coalesce(rp.paid_at, rp.created_at) < ?',
      [start, end]
    )
    .select(
      'rp.id',
      'rp.invoice_id',
      'rp.payment_id',
      'rp.payment_method',
      'rp.amount',
      'rp.status',
      'rp.paid_at',
      'rp.refunded_at',
      'rp.created_at',
      'b.reference',
      'b.provider_id',
      'p.name_en as provider_name',
      'c.first_name',
      'c.last_name'
    )
    .orderByRaw('coalesce(rp.paid_at, rp.created_at) desc')
    .limit(MAX_REPORT_ROWS + 1)
  if (filters.provider) query.where('b.provider_id', filters.provider)
  if (PAYMENT_STATUSES.includes(filters.status)) query.where('rp.status', filters.status)
  if (filters.method) query.where('rp.payment_method', filters.method)
  const rows = limited((await query) as Row[])

  const collected = rows.filter((row) => ['paid', 'refunded'].includes(row.status))
  const refunded = rows.filter((row) => row.status === 'refunded')
  const summary: SummaryItem[] = [
    { label: 'Collected', value: sum(collected, (row) => fils(row.amount)), type: 'money' },
    { label: 'Refunded', value: sum(refunded, (row) => fils(row.amount)), type: 'money' },
    {
      label: 'Net revenue',
      value: sum(collected, (row) => fils(row.amount)) - sum(refunded, (row) => fils(row.amount)),
      type: 'money',
    },
    { label: 'Paid payments', value: collected.length, type: 'int' },
    {
      label: 'Failed or unfinished',
      value: rows.filter((row) => ['failed', 'initiated'].includes(row.status)).length,
      type: 'int',
    },
  ]

  const group = filters.view
  if (!['day', 'month', 'provider', 'method'].includes(group)) {
    return {
      summary,
      columns: [
        { key: 'when', label: 'Date', type: 'datetime' },
        { key: 'reference', label: 'Booking', type: 'text' },
        { key: 'provider', label: 'Provider', type: 'text' },
        { key: 'customer', label: 'Customer', type: 'text' },
        { key: 'method', label: 'Payment method', type: 'text' },
        { key: 'amount', label: 'Amount (KWD)', type: 'money' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'refunded_at', label: 'Refunded at', type: 'datetime' },
        { key: 'invoice_id', label: 'Invoice ID', type: 'text' },
        { key: 'payment_id', label: 'Payment ID', type: 'text' },
      ],
      rows: rows.map((row) => ({
        when: iso(row.paid_at ?? row.created_at),
        reference: row.reference,
        provider: row.provider_name,
        customer: customerName(row),
        method: row.payment_method ?? '',
        amount: fils(row.amount),
        status: label(row.status),
        refunded_at: iso(row.refunded_at),
        invoice_id: row.invoice_id,
        payment_id: row.payment_id ?? '',
      })),
    }
  }

  const keyOf = (row: Row) => {
    const at = DateTime.fromJSDate(new Date(row.paid_at ?? row.created_at)).setZone(KUWAIT)
    if (group === 'day') return at.toFormat('yyyy-MM-dd')
    if (group === 'month') return at.toFormat('yyyy-MM')
    if (group === 'provider') return row.provider_name
    return row.payment_method || 'Not recorded'
  }
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const key = keyOf(row)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const heading = { day: 'Day', month: 'Month', provider: 'Provider', method: 'Payment method' }[
    group as 'day' | 'month' | 'provider' | 'method'
  ]
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    group === 'day' || group === 'month' ? b.localeCompare(a) : a.localeCompare(b)
  )
  return {
    summary,
    columns: [
      { key: 'group', label: heading, type: 'text' },
      { key: 'payments', label: 'Paid payments', type: 'int' },
      { key: 'collected', label: 'Collected (KWD)', type: 'money' },
      { key: 'refunded', label: 'Refunded (KWD)', type: 'money' },
      { key: 'net', label: 'Net (KWD)', type: 'money' },
      { key: 'failed', label: 'Failed or unfinished', type: 'int' },
    ],
    rows: ordered.map(([key, items]) => {
      const paid = items.filter((row) => ['paid', 'refunded'].includes(row.status))
      const back = items.filter((row) => row.status === 'refunded')
      const gross = sum(paid, (row) => fils(row.amount))
      const returned = sum(back, (row) => fils(row.amount))
      return {
        group: key,
        payments: paid.length,
        collected: gross,
        refunded: returned,
        net: gross - returned,
        failed: items.filter((row) => ['failed', 'initiated'].includes(row.status)).length,
      }
    }),
  }
}

// -------------------------------------------------------------- 2. refunds

async function refundReport(filters: ReportFilters): Promise<ReportResult> {
  const { start, end } = bounds(filters)
  const wanted = filters.status || 'all'
  const base = () =>
    feeBase().select(
      'rp.amount',
      'rp.paid_at',
      'rp.refunded_at',
      'rp.refund_reference',
      'b.id as booking_id',
      'b.reference',
      'b.status as booking_status',
      'b.cancelled_by',
      'b.cancel_reason',
      'p.name_en as provider_name',
      'c.first_name',
      'c.last_name',
      db.raw(
        `(select u.full_name from audit_logs a join users u on u.id = a.actor_id
           where a.entity_type = 'rental_booking' and a.entity_id = b.id
             and a.action = 'rental_booking.refund' order by a.id desc limit 1) as refunded_by`
      )
    )
  const refundedQuery = base()
    .where('rp.status', 'refunded')
    .where('rp.refunded_at', '>=', start)
    .where('rp.refunded_at', '<', end)
    .orderBy('rp.refunded_at', 'desc')
    .limit(MAX_REPORT_ROWS + 1)
  if (filters.provider) refundedQuery.where('b.provider_id', filters.provider)
  const refunded: Row[] = wanted === 'awaiting' ? [] : ((await refundedQuery) as Row[])
  // Paid bookings that must be refunded but have not been yet: shown whatever the date range.
  const awaitingQuery = base()
    .where('rp.status', 'paid')
    .where('b.status', 'refund_required')
    .orderBy('b.id', 'desc')
    .limit(MAX_REPORT_ROWS + 1)
  if (filters.provider) awaitingQuery.where('b.provider_id', filters.provider)
  const awaiting: Row[] = wanted === 'refunded' ? [] : ((await awaitingQuery) as Row[])
  limited(refunded)
  const rows: Row[] = [
    ...awaiting.map((row) => ({ kind: 'Awaiting refund', ...row })),
    ...refunded.map((row) => ({ kind: 'Refunded', ...row })),
  ]
  return {
    note: 'Bookings awaiting a refund are always listed, whatever the date range.',
    summary: [
      { label: 'Refunds issued', value: refunded.length, type: 'int' },
      { label: 'Refunded', value: sum(refunded, (row) => fils(row.amount)), type: 'money' },
      { label: 'Awaiting refund', value: awaiting.length, type: 'int' },
      { label: 'Amount awaiting', value: sum(awaiting, (row) => fils(row.amount)), type: 'money' },
    ],
    columns: [
      { key: 'kind', label: 'Type', type: 'text' },
      { key: 'refunded_at', label: 'Refunded at', type: 'datetime' },
      { key: 'reference', label: 'Booking', type: 'text' },
      { key: 'booking_status', label: 'Booking status', type: 'text' },
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'amount', label: 'Amount (KWD)', type: 'money' },
      { key: 'paid_at', label: 'Paid at', type: 'datetime' },
      { key: 'refund_reference', label: 'Refund reference', type: 'text' },
      { key: 'refunded_by', label: 'Refunded by', type: 'text' },
      { key: 'cancelled_by', label: 'Cancelled by', type: 'text' },
      { key: 'cancel_reason', label: 'Cancel reason', type: 'text' },
    ],
    rows: rows.map((row) => ({
      kind: row.kind,
      refunded_at: iso(row.refunded_at),
      reference: row.reference,
      booking_status: label(row.booking_status),
      provider: row.provider_name,
      customer: customerName(row),
      amount: fils(row.amount),
      paid_at: iso(row.paid_at),
      refund_reference: row.refund_reference ?? '',
      refunded_by: row.refunded_by ?? '',
      cancelled_by: row.cancelled_by ?? '',
      cancel_reason: row.cancel_reason ?? '',
    })),
  }
}

// -------------------------------------------------- 3. provider statement

async function providerStatement(filters: ReportFilters): Promise<ReportResult> {
  const { start, end } = bounds(filters)
  const query = db
    .from('rental_bookings as b')
    .join('rental_providers as p', 'p.id', 'b.provider_id')
    .join('customers as c', 'c.id', 'b.customer_id')
    .join('rental_vehicles as v', 'v.id', 'b.vehicle_id')
    .leftJoin('rental_drivers as dr', 'dr.id', 'b.driver_id')
    .whereIn('b.status', ['confirmed', 'completed', 'cancelled', 'refund_required'])
    .whereNotNull('b.confirmed_at')
    .where('b.pickup_at', '>=', start)
    .where('b.pickup_at', '<', end)
    .select(
      'b.id',
      'b.reference',
      'b.status',
      'b.pickup_at',
      'b.return_at',
      'b.days',
      'b.with_driver',
      'b.driver_daily_rate',
      'b.rental_amount',
      'b.booking_fee',
      'b.provider_id',
      'p.name_en as provider_name',
      'v.name_en as vehicle_name',
      'c.first_name',
      'c.last_name',
      'dr.name as driver_name',
      db.raw(
        "(select count(*) from rental_payments rp where rp.booking_id = b.id and rp.status = 'paid') as fee_paid"
      )
    )
    .orderBy('b.pickup_at', 'desc')
    .limit(MAX_REPORT_ROWS + 1)
  if (filters.provider) query.where('b.provider_id', filters.provider)
  const all = limited((await query) as Row[])
  // Rentals that count towards what the provider earns.
  const earning = (row: Row) => ['confirmed', 'completed'].includes(row.status)
  const driverCharge = (row: Row) =>
    row.with_driver ? Number(row.days) * fils(row.driver_daily_rate) : 0
  const feeOf = (row: Row) => (Number(row.fee_paid) > 0 ? fils(row.booking_fee) : 0)
  const rentals = all.filter(earning)
  const summary: SummaryItem[] = [
    { label: 'Rentals', value: rentals.length, type: 'int' },
    { label: 'Rental value', value: sum(rentals, (row) => fils(row.rental_amount)), type: 'money' },
    { label: 'of which driver', value: sum(rentals, driverCharge), type: 'money' },
    { label: 'Booking fees (ours)', value: sum(rentals, feeOf), type: 'money' },
  ]
  const note =
    'Rental value is paid by the customer to the provider at pickup. The booking fee is paid in the app to the platform. Rentals are counted by pickup date; cancelled ones are not included in the amounts.'

  if (filters.view === 'bookings') {
    return {
      note,
      summary,
      columns: [
        { key: 'provider', label: 'Provider', type: 'text' },
        { key: 'reference', label: 'Booking', type: 'text' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'pickup_at', label: 'Pickup', type: 'datetime' },
        { key: 'return_at', label: 'Return', type: 'datetime' },
        { key: 'days', label: 'Days', type: 'int' },
        { key: 'vehicle', label: 'Vehicle', type: 'text' },
        { key: 'customer', label: 'Customer', type: 'text' },
        { key: 'driver', label: 'Driver', type: 'text' },
        { key: 'rental', label: 'Rental value (KWD)', type: 'money' },
        { key: 'driver_charge', label: 'Driver charge (KWD)', type: 'money' },
        { key: 'fee', label: 'Booking fee (KWD)', type: 'money' },
      ],
      rows: [...all]
        .sort(
          (a, b) =>
            String(a.provider_name).localeCompare(String(b.provider_name)) ||
            new Date(b.pickup_at).getTime() - new Date(a.pickup_at).getTime()
        )
        .map((row) => ({
          provider: row.provider_name,
          reference: row.reference,
          status: label(row.status),
          pickup_at: iso(row.pickup_at),
          return_at: iso(row.return_at),
          days: Number(row.days),
          vehicle: row.vehicle_name,
          customer: customerName(row),
          driver: row.driver_name ?? (row.with_driver ? 'Not assigned' : ''),
          rental: earning(row) ? fils(row.rental_amount) : 0,
          driver_charge: earning(row) ? driverCharge(row) : 0,
          fee: earning(row) ? feeOf(row) : 0,
        })),
    }
  }

  const byProvider = new Map<number, Row[]>()
  for (const row of all) {
    const id = Number(row.provider_id)
    byProvider.set(id, [...(byProvider.get(id) ?? []), row])
  }
  return {
    note,
    summary,
    columns: [
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'rentals', label: 'Rentals', type: 'int' },
      { key: 'completed', label: 'Completed', type: 'int' },
      { key: 'cancelled', label: 'Cancelled', type: 'int' },
      { key: 'days', label: 'Rental days', type: 'int' },
      { key: 'rental', label: 'Rental value (KWD)', type: 'money' },
      { key: 'driver_charge', label: 'of which driver (KWD)', type: 'money' },
      { key: 'fee', label: 'Booking fees (KWD)', type: 'money' },
    ],
    rows: [...byProvider.values()]
      .map((items) => {
        const earned = items.filter(earning)
        return {
          provider: items[0].provider_name,
          rentals: earned.length,
          completed: items.filter((row) => row.status === 'completed').length,
          cancelled: items.filter((row) => ['cancelled', 'refund_required'].includes(row.status))
            .length,
          days: sum(earned, (row) => Number(row.days)),
          rental: sum(earned, (row) => fils(row.rental_amount)),
          driver_charge: sum(earned, driverCharge),
          fee: sum(earned, feeOf),
        }
      })
      .sort((a, b) => String(a.provider).localeCompare(String(b.provider))),
  }
}

// ------------------------------------------------------ 5. bookings detail

async function bookingsDetail(filters: ReportFilters): Promise<ReportResult> {
  await expireStaleHolds()
  const { start, end } = bounds(filters)
  const dateColumn = filters.date_by === 'pickup' ? 'b.pickup_at' : 'b.created_at'
  const query = db
    .from('rental_bookings as b')
    .join('customers as c', 'c.id', 'b.customer_id')
    .join('rental_vehicles as v', 'v.id', 'b.vehicle_id')
    .join('rental_providers as p', 'p.id', 'b.provider_id')
    .leftJoin('rental_drivers as dr', 'dr.id', 'b.driver_id')
    .joinRaw(
      'left join rental_payments as rp on rp.id = (select max(x.id) from rental_payments x where x.booking_id = b.id)'
    )
    .where(dateColumn, '>=', start)
    .where(dateColumn, '<', end)
    .select(
      'b.*',
      'c.first_name',
      'c.last_name',
      'c.phone_e164',
      'v.name_en as vehicle_name',
      'p.name_en as provider_name',
      'dr.name as driver_name',
      'rp.status as payment_status',
      'rp.payment_method',
      'rp.paid_at',
      'rp.refunded_at'
    )
    .orderBy('b.id', 'desc')
    .limit(MAX_REPORT_ROWS + 1)
  if (filters.provider) query.where('b.provider_id', filters.provider)
  if (filters.status && filters.status !== 'all') query.where('b.status', filters.status)
  // Unpaid checkouts are not real bookings; they only appear when asked for.
  else if (!filters.status) query.whereNotIn('b.status', ['pending_payment', 'expired'])
  if (filters.q)
    query.where((inner) =>
      inner
        .where('b.reference', 'like', `%${filters.q}%`)
        .orWhere('c.phone_e164', 'like', `%${filters.q}%`)
        .orWhere('c.first_name', 'like', `%${filters.q}%`)
        .orWhere('c.last_name', 'like', `%${filters.q}%`)
    )
  const rows = limited((await query) as Row[])
  const live = rows.filter((row) => ['confirmed', 'completed'].includes(row.status))
  return {
    summary: [
      { label: 'Bookings', value: rows.length, type: 'int' },
      { label: 'Confirmed or completed', value: live.length, type: 'int' },
      {
        label: 'Cancelled',
        value: rows.filter((row) => ['cancelled', 'refund_required'].includes(row.status)).length,
        type: 'int',
      },
      { label: 'Rental value', value: sum(live, (row) => fils(row.rental_amount)), type: 'money' },
      { label: 'Booking fees', value: sum(live, (row) => fils(row.booking_fee)), type: 'money' },
    ],
    columns: [
      { key: 'reference', label: 'Reference', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'created_at', label: 'Booked at', type: 'datetime' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'vehicle', label: 'Vehicle', type: 'text' },
      { key: 'pickup_branch', label: 'Pickup branch', type: 'text' },
      { key: 'return_branch', label: 'Return branch', type: 'text' },
      { key: 'pickup_at', label: 'Pickup', type: 'datetime' },
      { key: 'return_at', label: 'Return', type: 'datetime' },
      { key: 'days', label: 'Days', type: 'int' },
      { key: 'with_driver', label: 'With driver', type: 'text' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'daily_rate', label: 'Daily rate (KWD)', type: 'money' },
      { key: 'rental_amount', label: 'Rental value (KWD)', type: 'money' },
      { key: 'fee', label: 'Booking fee (KWD)', type: 'money' },
      { key: 'payment_status', label: 'Fee status', type: 'text' },
      { key: 'payment_method', label: 'Payment method', type: 'text' },
      { key: 'paid_at', label: 'Paid at', type: 'datetime' },
      { key: 'refunded_at', label: 'Refunded at', type: 'datetime' },
      { key: 'cancelled_by', label: 'Cancelled by', type: 'text' },
      { key: 'cancel_reason', label: 'Cancel reason', type: 'text' },
    ],
    rows: rows.map((row) => {
      const snapshot = parseSnapshot(row.snapshot)
      return {
        reference: row.reference,
        status: label(row.status),
        created_at: iso(row.created_at),
        customer: customerName(row),
        phone: row.phone_e164 ?? '',
        provider: row.provider_name,
        vehicle: row.vehicle_name,
        pickup_branch: snapshot?.pickup_location?.name_en ?? '',
        return_branch: snapshot?.return_location?.name_en ?? '',
        pickup_at: iso(row.pickup_at),
        return_at: iso(row.return_at),
        days: Number(row.days),
        with_driver: row.with_driver ? 'Yes' : 'No',
        driver: row.driver_name ?? '',
        daily_rate: fils(row.daily_rate),
        rental_amount: fils(row.rental_amount),
        fee: fils(row.booking_fee),
        payment_status: row.payment_status ? label(row.payment_status) : '',
        payment_method: row.payment_method ?? '',
        paid_at: iso(row.paid_at),
        refunded_at: iso(row.refunded_at),
        cancelled_by: row.cancelled_by ?? '',
        cancel_reason: row.cancel_reason ?? '',
      }
    }),
  }
}

// --------------------------------------------------------------- registry

const providerFilter = (providers: FilterOption[]): ReportFilter => ({
  key: 'provider',
  label: 'All providers',
  kind: 'select',
  options: providers,
})
const from: ReportFilter = { key: 'from', label: 'From', kind: 'date' }
const to: ReportFilter = { key: 'to', label: 'To', kind: 'date' }

export const reports: ReportDefinition[] = [
  {
    key: 'booking-fees',
    title: 'Booking fee collection',
    group: 'Financial',
    description:
      'Booking fees paid in the app, with refunds and net revenue. Group by day, month, provider or payment method.',
    filters: (providers) => [
      from,
      to,
      providerFilter(providers),
      {
        key: 'view',
        label: 'Every payment',
        kind: 'select',
        options: [
          { value: 'day', label: 'Group by day' },
          { value: 'month', label: 'Group by month' },
          { value: 'provider', label: 'Group by provider' },
          { value: 'method', label: 'Group by payment method' },
        ],
      },
      {
        key: 'status',
        label: 'All payment statuses',
        kind: 'select',
        options: PAYMENT_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] })),
      },
    ],
    run: feeReport,
  },
  {
    key: 'refunds',
    title: 'Refunds',
    group: 'Financial',
    description:
      'Every booking fee refunded, who issued it, and the bookings still waiting for a refund.',
    filters: (providers) => [
      from,
      to,
      providerFilter(providers),
      {
        key: 'status',
        label: 'Refunded and awaiting',
        kind: 'select',
        options: [
          { value: 'refunded', label: 'Refunded only' },
          { value: 'awaiting', label: 'Awaiting refund only' },
        ],
      },
    ],
    run: refundReport,
  },
  {
    key: 'provider-statement',
    title: 'Provider statement',
    group: 'Financial',
    description:
      'Per provider: rentals, rental value, driver charges and booking fees for settlement.',
    filters: (providers) => [
      from,
      to,
      providerFilter(providers),
      {
        key: 'view',
        label: 'Summary per provider',
        kind: 'select',
        options: [{ value: 'bookings', label: 'Booking by booking' }],
      },
    ],
    run: providerStatement,
  },
  {
    key: 'bookings',
    title: 'Bookings detail',
    group: 'Bookings',
    description:
      'Every booking with customer, vehicle, branches, amounts and payment. Filter by date, status or provider.',
    filters: (providers) => [
      from,
      to,
      {
        key: 'date_by',
        label: 'By booking date',
        kind: 'select',
        options: [{ value: 'pickup', label: 'By pickup date' }],
      },
      providerFilter(providers),
      {
        key: 'status',
        label: 'All paid bookings',
        kind: 'select',
        options: BOOKING_STATUS_OPTIONS,
      },
      { key: 'q', label: 'Reference, name or phone', kind: 'search' },
    ],
    run: bookingsDetail,
  },
]

export const findReport = (key: string) => reports.find((report) => report.key === key)

export async function providerOptions(): Promise<FilterOption[]> {
  const rows = (await db
    .from('rental_providers')
    .orderBy('name_en')
    .select('id', 'name_en')) as Row[]
  return rows.map((row) => ({ value: String(row.id), label: row.name_en }))
}

// ----------------------------------------------------------- presentation

/** Display value of a cell: money as "12.500", dates in Kuwait time. */
export function displayCell(type: ColumnType, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (type === 'money') return kwd(Number(value))
  if (type === 'int') return String(value)
  if (type === 'datetime')
    return DateTime.fromISO(String(value)).setZone(KUWAIT).toFormat('yyyy-MM-dd HH:mm')
  if (type === 'date') return DateTime.fromISO(String(value)).setZone(KUWAIT).toFormat('yyyy-MM-dd')
  return String(value)
}

export const displaySummary = (item: SummaryItem) =>
  item.type === 'money' ? kwd(Number(item.value)) : String(item.value)
