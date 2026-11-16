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

export type ColumnType = 'text' | 'money' | 'int' | 'decimal' | 'percent' | 'datetime' | 'date'
export type ReportColumn = { key: string; label: string; type: ColumnType }
export type SummaryItem = {
  label: string
  value: string | number
  type: 'money' | 'int' | 'decimal' | 'percent'
}
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
  group: 'Financial' | 'Bookings' | 'Fleet'
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

// ------------------------------------------------- 4. payment reconciliation

const ISSUES = {
  no_paid_fee: 'Active without a paid fee',
  paid_twice: 'Paid more than once',
  not_refunded: 'Paid but not refunded',
  refund_pending: 'Refund pending',
  amount_mismatch: 'Amount differs from fee',
} as const
type IssueCode = keyof typeof ISSUES

/** Loads payments for many bookings without one huge `where in`. */
async function paymentsFor(bookingIds: number[]) {
  const byBooking = new Map<number, Row[]>()
  for (let index = 0; index < bookingIds.length; index += 1000) {
    const rows = (await db
      .from('rental_payments')
      .whereIn('booking_id', bookingIds.slice(index, index + 1000))
      .orderBy('id')) as Row[]
    for (const row of rows) {
      const id = Number(row.booking_id)
      byBooking.set(id, [...(byBooking.get(id) ?? []), row])
    }
  }
  return byBooking
}

async function reconciliation(filters: ReportFilters): Promise<ReportResult> {
  await expireStaleHolds()
  const { start, end } = bounds(filters)
  const query = db
    .from('rental_bookings as b')
    .join('rental_providers as p', 'p.id', 'b.provider_id')
    .join('customers as c', 'c.id', 'b.customer_id')
    .where('b.created_at', '>=', start)
    .where('b.created_at', '<', end)
    .select(
      'b.id',
      'b.reference',
      'b.status',
      'b.booking_fee',
      'b.created_at',
      'p.name_en as provider_name',
      'c.first_name',
      'c.last_name'
    )
    .orderBy('b.id', 'desc')
    .limit(MAX_REPORT_ROWS + 1)
  if (filters.provider) query.where('b.provider_id', filters.provider)
  const bookings = limited((await query) as Row[])
  const payments = await paymentsFor(bookings.map((row) => Number(row.id)))

  const issues: Row[] = []
  for (const booking of bookings) {
    const list = payments.get(Number(booking.id)) ?? []
    const paid = list.filter((row) => row.status === 'paid')
    const refunded = list.filter((row) => row.status === 'refunded')
    const add = (code: IssueCode, detail: string, amount: number, payment?: Row) =>
      issues.push({
        code,
        issue: ISSUES[code],
        reference: booking.reference,
        booking_status: label(booking.status),
        provider: booking.provider_name,
        customer: customerName(booking),
        created_at: iso(booking.created_at),
        amount,
        detail,
        invoice_id: payment?.invoice_id ?? '',
        payment_id: payment?.payment_id ?? '',
      })
    if (['confirmed', 'completed'].includes(booking.status) && !paid.length)
      add(
        'no_paid_fee',
        refunded.length
          ? 'The fee was refunded but the booking is still active.'
          : 'No paid payment is recorded for this booking.',
        0,
        refunded[0] ?? list[list.length - 1]
      )
    if (paid.length > 1)
      add(
        'paid_twice',
        `${paid.length} paid payments for one booking. Refund the extra one.`,
        sum(paid.slice(1), (row) => fils(row.amount)),
        paid[1]
      )
    if (['cancelled', 'expired'].includes(booking.status) && paid.length)
      add(
        'not_refunded',
        `The booking is ${label(booking.status).toLowerCase()} but the fee is still paid.`,
        sum(paid, (row) => fils(row.amount)),
        paid[0]
      )
    if (booking.status === 'refund_required' && paid.length)
      add(
        'refund_pending',
        'Marked for refund; the refund has not been made yet.',
        sum(paid, (row) => fils(row.amount)),
        paid[0]
      )
    for (const payment of [...paid, ...refunded])
      if (fils(payment.amount) !== fils(booking.booking_fee))
        add(
          'amount_mismatch',
          `Payment ${kwd(fils(payment.amount))} KWD, booking fee ${kwd(fils(booking.booking_fee))} KWD.`,
          fils(payment.amount) - fils(booking.booking_fee),
          payment
        )
  }
  const shown = issues.filter((row) => !filters.status || row.code === filters.status)
  return {
    note: 'Compares each booking with the payment results stored from MyFatoorah. Bookings are taken by checkout date. Unfinished checkouts are normal and not listed.',
    summary: [
      { label: 'Bookings checked', value: bookings.length, type: 'int' },
      { label: 'Issues', value: shown.length, type: 'int' },
      {
        label: 'Bookings with issues',
        value: new Set(shown.map((row) => row.reference)).size,
        type: 'int',
      },
      {
        label: 'Amount involved',
        value: sum(shown, (row) => Math.abs(Number(row.amount))),
        type: 'money',
      },
    ],
    columns: [
      { key: 'issue', label: 'Issue', type: 'text' },
      { key: 'reference', label: 'Booking', type: 'text' },
      { key: 'booking_status', label: 'Booking status', type: 'text' },
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'created_at', label: 'Booked at', type: 'datetime' },
      { key: 'amount', label: 'Amount (KWD)', type: 'money' },
      { key: 'detail', label: 'Detail', type: 'text' },
      { key: 'invoice_id', label: 'Invoice ID', type: 'text' },
      { key: 'payment_id', label: 'Payment ID', type: 'text' },
    ],
    rows: shown,
  }
}

// ------------------------------------------------ 6. funnel and cancellations

const percent = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 1000) / 10 : 0
const isCancelled = (row: Row) => ['cancelled', 'refund_required'].includes(row.status)
const isEarning = (row: Row) => ['confirmed', 'completed'].includes(row.status)

async function funnelReport(filters: ReportFilters): Promise<ReportResult> {
  await expireStaleHolds()
  const { start, end } = bounds(filters)
  const query = db
    .from('rental_bookings as b')
    .join('rental_providers as p', 'p.id', 'b.provider_id')
    .where('b.created_at', '>=', start)
    .where('b.created_at', '<', end)
    .select(
      'b.status',
      'b.created_at',
      'b.confirmed_at',
      'b.cancelled_by',
      'b.cancel_reason',
      'b.rental_amount',
      'p.name_en as provider_name'
    )
    .limit(MAX_REPORT_ROWS + 1)
  if (filters.provider) query.where('b.provider_id', filters.provider)
  const rows = limited((await query) as Row[])
  const paid = rows.filter((row) => row.confirmed_at)
  const cancelledBy = (who: string) =>
    rows.filter((row) => isCancelled(row) && row.cancelled_by === who).length
  const summary: SummaryItem[] = [
    { label: 'Checkouts started', value: rows.length, type: 'int' },
    { label: 'Paid', value: paid.length, type: 'int' },
    { label: 'Conversion', value: percent(paid.length, rows.length), type: 'percent' },
    {
      label: 'Completed',
      value: rows.filter((row) => row.status === 'completed').length,
      type: 'int',
    },
    { label: 'Cancelled by customer', value: cancelledBy('customer'), type: 'int' },
    { label: 'Cancelled by staff', value: cancelledBy('staff'), type: 'int' },
    {
      label: 'Left unpaid',
      value: rows.filter((row) => row.status === 'expired').length,
      type: 'int',
    },
  ]
  const note =
    'Counted by the day the checkout started. Paid means the booking fee went through; left unpaid means the hold ran out before payment.'

  if (filters.view === 'reasons') {
    const groups = new Map<string, Row[]>()
    for (const row of rows.filter(isCancelled)) {
      const reason = String(row.cancel_reason ?? '').trim() || 'No reason given'
      const key = `${row.cancelled_by ?? 'unknown'}\u0000${reason}`
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    return {
      note,
      summary,
      columns: [
        { key: 'cancelled_by', label: 'Cancelled by', type: 'text' },
        { key: 'reason', label: 'Reason', type: 'text' },
        { key: 'bookings', label: 'Bookings', type: 'int' },
        { key: 'paid', label: 'Paid before cancelling', type: 'int' },
        { key: 'lost', label: 'Rental value lost (KWD)', type: 'money' },
      ],
      rows: [...groups.entries()]
        .map(([key, items]) => {
          const [who, reason] = key.split('\u0000')
          const wasPaid = items.filter((row) => row.confirmed_at)
          return {
            cancelled_by: who === 'customer' ? 'Customer' : who === 'staff' ? 'Staff' : who,
            reason,
            bookings: items.length,
            paid: wasPaid.length,
            lost: sum(wasPaid, (row) => fils(row.rental_amount)),
          }
        })
        .sort((a, b) => b.bookings - a.bookings),
    }
  }

  const group = ['month', 'provider'].includes(filters.view) ? filters.view : 'day'
  const keyOf = (row: Row) => {
    if (group === 'provider') return row.provider_name
    const at = DateTime.fromJSDate(new Date(row.created_at)).setZone(KUWAIT)
    return at.toFormat(group === 'month' ? 'yyyy-MM' : 'yyyy-MM-dd')
  }
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const key = keyOf(row)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return {
    note,
    summary,
    columns: [
      {
        key: 'group',
        label: { day: 'Day', month: 'Month', provider: 'Provider' }[group]!,
        type: 'text',
      },
      { key: 'started', label: 'Checkouts started', type: 'int' },
      { key: 'paid', label: 'Paid', type: 'int' },
      { key: 'conversion', label: 'Conversion', type: 'percent' },
      { key: 'completed', label: 'Completed', type: 'int' },
      { key: 'cancelled', label: 'Cancelled', type: 'int' },
      { key: 'expired', label: 'Left unpaid', type: 'int' },
    ],
    rows: [...groups.entries()]
      .sort(([a], [b]) => (group === 'provider' ? a.localeCompare(b) : b.localeCompare(a)))
      .map(([key, items]) => {
        const done = items.filter((row) => row.confirmed_at).length
        return {
          group: key,
          started: items.length,
          paid: done,
          conversion: percent(done, items.length),
          completed: items.filter((row) => row.status === 'completed').length,
          cancelled: items.filter(isCancelled).length,
          expired: items.filter((row) => row.status === 'expired').length,
        }
      }),
  }
}

// ---------------------------------------------- 7. vehicle and fleet performance

const DAY_MS = 24 * 60 * 60 * 1000

/** Days of a rental that fall inside the report range. */
function overlapDays(row: Row, start: Date, end: Date) {
  const from = Math.max(new Date(row.pickup_at).getTime(), start.getTime())
  const to = Math.min(new Date(row.return_at).getTime(), end.getTime())
  return Math.max(0, to - from) / DAY_MS
}

/** Published review average and count per vehicle or provider (all time). */
async function ratings(column: 'vehicle_id' | 'provider_id') {
  const rows = (await db
    .from('rental_reviews')
    .where('status', 'published')
    .groupBy(column)
    .select(column)
    .avg('rating as average')
    .count('* as total')) as Row[]
  return new Map(
    rows.map((row) => [
      Number(row[column]),
      { average: Number(row.average), total: Number(row.total) },
    ])
  )
}

/** Paid rentals that overlap the range (by pickup, return or both). */
function overlapping(start: Date, end: Date, provider: number | null) {
  const query = db
    .from('rental_bookings as b')
    .whereNotNull('b.confirmed_at')
    .whereIn('b.status', ['confirmed', 'completed', 'cancelled', 'refund_required'])
    .where('b.pickup_at', '<', end)
    .where('b.return_at', '>', start)
    .select(
      'b.id',
      'b.vehicle_id',
      'b.provider_id',
      'b.pickup_location_id',
      'b.return_location_id',
      'b.status',
      'b.cancelled_by',
      'b.with_driver',
      'b.driver_id',
      'b.pickup_at',
      'b.return_at',
      'b.rental_amount'
    )
    .limit(MAX_REPORT_ROWS + 1)
  if (provider) query.where('b.provider_id', provider)
  return query
}

async function vehicleReport(filters: ReportFilters): Promise<ReportResult> {
  const { start, end } = bounds(filters)
  const rangeDays = (end.getTime() - start.getTime()) / DAY_MS
  const vehicleQuery = db
    .from('rental_vehicles as v')
    .join('rental_providers as p', 'p.id', 'v.provider_id')
    .leftJoin('rental_vehicle_types as t', 't.code', 'v.vehicle_type')
    .select(
      'v.id',
      'v.name_en',
      'v.quantity',
      'v.status',
      'v.vehicle_type',
      't.name_en as type_name',
      'p.name_en as provider_name'
    )
    .orderBy('v.name_en')
    .limit(MAX_REPORT_ROWS + 1)
  if (filters.provider) vehicleQuery.where('v.provider_id', filters.provider)
  const [vehicles, bookings, reviews, lastRows] = await Promise.all([
    vehicleQuery as Promise<Row[]>,
    overlapping(start, end, filters.provider) as Promise<Row[]>,
    ratings('vehicle_id'),
    db
      .from('rental_bookings')
      .whereNotNull('confirmed_at')
      .groupBy('vehicle_id')
      .select('vehicle_id')
      .max('pickup_at as last') as Promise<Row[]>,
  ])
  limited(vehicles)
  limited(bookings)
  const last = new Map(lastRows.map((row) => [Number(row.vehicle_id), row.last]))
  const pickedUpInRange = (row: Row) =>
    new Date(row.pickup_at) >= start && new Date(row.pickup_at) < end
  const rows = vehicles.map((vehicle) => {
    const mine = bookings.filter((row) => Number(row.vehicle_id) === Number(vehicle.id))
    const earning = mine.filter(isEarning)
    const units = Math.max(1, Number(vehicle.quantity))
    const booked = sum(earning, (row) => overlapDays(row, start, end))
    const review = reviews.get(Number(vehicle.id))
    return {
      vehicle: vehicle.name_en,
      provider: vehicle.provider_name,
      type: vehicle.type_name ?? vehicle.vehicle_type,
      status: vehicle.status === 'published' ? 'Published' : 'Draft',
      units,
      rentals: earning.filter(pickedUpInRange).length,
      booked_days: Math.round(booked * 10) / 10,
      utilization: percent(booked, units * rangeDays),
      rental: sum(earning.filter(pickedUpInRange), (row) => fils(row.rental_amount)),
      cancelled: mine.filter(isCancelled).filter(pickedUpInRange).length,
      rating: review ? Math.round(review.average * 10) / 10 : null,
      reviews: review?.total ?? 0,
      last_booked: iso(last.get(Number(vehicle.id))),
      _booked: booked,
      _units: units,
    }
  })
  const shown = (filters.view === 'unbooked' ? rows.filter((row) => row._booked === 0) : rows).sort(
    (a, b) => b.rental - a.rental || b.booked_days - a.booked_days
  )
  return {
    note: 'Utilization is booked days divided by available days (units × days in the range). Rentals and rental value count pickups in the range; ratings are all time.',
    summary: [
      { label: 'Vehicles', value: shown.length, type: 'int' },
      {
        label: 'Not booked in period',
        value: shown.filter((row) => row._booked === 0).length,
        type: 'int',
      },
      { label: 'Rentals', value: sum(shown, (row) => row.rentals), type: 'int' },
      {
        label: 'Fleet utilization',
        value: percent(
          sum(shown, (row) => row._booked),
          sum(shown, (row) => row._units) * rangeDays
        ),
        type: 'percent',
      },
      { label: 'Rental value', value: sum(shown, (row) => row.rental), type: 'money' },
    ],
    columns: [
      { key: 'vehicle', label: 'Vehicle', type: 'text' },
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'units', label: 'Units', type: 'int' },
      { key: 'rentals', label: 'Rentals', type: 'int' },
      { key: 'booked_days', label: 'Booked days', type: 'decimal' },
      { key: 'utilization', label: 'Utilization', type: 'percent' },
      { key: 'rental', label: 'Rental value (KWD)', type: 'money' },
      { key: 'cancelled', label: 'Cancelled', type: 'int' },
      { key: 'rating', label: 'Rating', type: 'decimal' },
      { key: 'reviews', label: 'Reviews', type: 'int' },
      { key: 'last_booked', label: 'Last pickup', type: 'datetime' },
    ],
    rows: shown.map(({ _booked, _units, ...row }) => row),
  }
}

// -------------------------------------------- 8. provider and branch performance

async function providerPerformance(filters: ReportFilters): Promise<ReportResult> {
  const { start, end } = bounds(filters)
  const all = limited((await overlapping(start, end, filters.provider)) as Row[])
  // Performance counts bookings by pickup date.
  const bookings = all.filter(
    (row) => new Date(row.pickup_at) >= start && new Date(row.pickup_at) < end
  )
  const earning = bookings.filter(isEarning)
  const cancelled = bookings.filter(isCancelled)
  const reviews = await ratings('provider_id')
  const summary: SummaryItem[] = [
    { label: 'Rentals', value: earning.length, type: 'int' },
    { label: 'Rental value', value: sum(earning, (row) => fils(row.rental_amount)), type: 'money' },
    { label: 'Cancelled', value: cancelled.length, type: 'int' },
    {
      label: 'Cancellation rate',
      value: percent(cancelled.length, bookings.length),
      type: 'percent',
    },
  ]
  const note =
    'Paid bookings counted by pickup date. Cancellation rate is cancelled ÷ all paid bookings. Ratings are all time.'

  if (filters.view === 'branch') {
    const branchQuery = db
      .from('rental_locations as l')
      .join('rental_providers as p', 'p.id', 'l.provider_id')
      .leftJoin('rental_places as pl', 'pl.id', 'l.place_id')
      .select(
        'l.id',
        'l.name_en',
        'l.active',
        'pl.name_en as place_name',
        'p.name_en as provider_name'
      )
      .orderBy('p.name_en')
      .orderBy('l.name_en')
    if (filters.provider) branchQuery.where('l.provider_id', filters.provider)
    const branches = (await branchQuery) as Row[]
    return {
      note,
      summary,
      columns: [
        { key: 'branch', label: 'Branch', type: 'text' },
        { key: 'place', label: 'Pickup place', type: 'text' },
        { key: 'provider', label: 'Provider', type: 'text' },
        { key: 'active', label: 'Active', type: 'text' },
        { key: 'pickups', label: 'Pickups', type: 'int' },
        { key: 'returns', label: 'Returns', type: 'int' },
        { key: 'rental', label: 'Rental value (KWD)', type: 'money' },
        { key: 'cancelled', label: 'Cancelled', type: 'int' },
      ],
      rows: branches
        .map((branch) => {
          const id = Number(branch.id)
          const picked = earning.filter((row) => Number(row.pickup_location_id) === id)
          return {
            branch: branch.name_en,
            place: branch.place_name ?? '',
            provider: branch.provider_name,
            active: branch.active ? 'Yes' : 'No',
            pickups: picked.length,
            returns: earning.filter((row) => Number(row.return_location_id) === id).length,
            rental: sum(picked, (row) => fils(row.rental_amount)),
            cancelled: cancelled.filter((row) => Number(row.pickup_location_id) === id).length,
          }
        })
        .sort((a, b) => b.pickups - a.pickups),
    }
  }

  const providerQuery = db
    .from('rental_providers as p')
    .select(
      'p.id',
      'p.name_en',
      'p.active',
      db.raw(
        "(select count(*) from rental_vehicles v where v.provider_id = p.id and v.status = 'published') as published"
      )
    )
    .orderBy('p.name_en')
  if (filters.provider) providerQuery.where('p.id', filters.provider)
  const providers = (await providerQuery) as Row[]
  return {
    note,
    summary,
    columns: [
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'active', label: 'Active', type: 'text' },
      { key: 'published', label: 'Published vehicles', type: 'int' },
      { key: 'rentals', label: 'Rentals', type: 'int' },
      { key: 'with_driver', label: 'With driver', type: 'int' },
      { key: 'needs_driver', label: 'Needs a driver', type: 'int' },
      { key: 'rental', label: 'Rental value (KWD)', type: 'money' },
      { key: 'cancelled', label: 'Cancelled', type: 'int' },
      { key: 'by_customer', label: 'by customer', type: 'int' },
      { key: 'by_staff', label: 'by staff', type: 'int' },
      { key: 'cancel_rate', label: 'Cancellation rate', type: 'percent' },
      { key: 'rating', label: 'Rating', type: 'decimal' },
      { key: 'reviews', label: 'Reviews', type: 'int' },
    ],
    rows: providers
      .map((provider) => {
        const id = Number(provider.id)
        const mine = bookings.filter((row) => Number(row.provider_id) === id)
        const earned = mine.filter(isEarning)
        const lost = mine.filter(isCancelled)
        const review = reviews.get(id)
        return {
          provider: provider.name_en,
          active: provider.active ? 'Yes' : 'No',
          published: Number(provider.published),
          rentals: earned.length,
          with_driver: earned.filter((row) => row.with_driver).length,
          needs_driver: earned.filter(
            (row) => row.with_driver && row.status === 'confirmed' && !row.driver_id
          ).length,
          rental: sum(earned, (row) => fils(row.rental_amount)),
          cancelled: lost.length,
          by_customer: lost.filter((row) => row.cancelled_by === 'customer').length,
          by_staff: lost.filter((row) => row.cancelled_by === 'staff').length,
          cancel_rate: percent(lost.length, mine.length),
          rating: review ? Math.round(review.average * 10) / 10 : null,
          reviews: review?.total ?? 0,
        }
      })
      .sort((a, b) => b.rental - a.rental || a.provider.localeCompare(b.provider)),
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
    key: 'reconciliation',
    title: 'Payment reconciliation',
    group: 'Financial',
    description:
      'Bookings whose payments do not add up: active without a paid fee, paid twice, cancelled but not refunded, or a different amount.',
    filters: (providers) => [
      from,
      to,
      providerFilter(providers),
      {
        key: 'status',
        label: 'All issues',
        kind: 'select',
        options: Object.entries(ISSUES).map(([value, text]) => ({ value, label: text })),
      },
    ],
    run: reconciliation,
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
  {
    key: 'funnel',
    title: 'Funnel and cancellations',
    group: 'Bookings',
    description:
      'Checkouts started, paid, completed and left unpaid, with conversion. See cancellations by reason and who cancelled.',
    filters: (providers) => [
      from,
      to,
      providerFilter(providers),
      {
        key: 'view',
        label: 'By day',
        kind: 'select',
        options: [
          { value: 'month', label: 'By month' },
          { value: 'provider', label: 'By provider' },
          { value: 'reasons', label: 'Cancellation reasons' },
        ],
      },
    ],
    run: funnelReport,
  },
  {
    key: 'vehicles',
    title: 'Vehicle performance',
    group: 'Fleet',
    description:
      'Rentals, booked days, utilization, rental value and rating per vehicle, and the vehicles that were not booked.',
    filters: (providers) => [
      from,
      to,
      providerFilter(providers),
      {
        key: 'view',
        label: 'All vehicles',
        kind: 'select',
        options: [{ value: 'unbooked', label: 'Not booked in period' }],
      },
    ],
    run: vehicleReport,
  },
  {
    key: 'providers',
    title: 'Provider and branch performance',
    group: 'Fleet',
    description:
      'Per provider: rentals, value, cancellations, drivers and rating. Per branch: pickups, returns and value.',
    filters: (providers) => [
      from,
      to,
      providerFilter(providers),
      {
        key: 'view',
        label: 'Per provider',
        kind: 'select',
        options: [{ value: 'branch', label: 'Per branch' }],
      },
    ],
    run: providerPerformance,
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
  if (type === 'decimal') return Number(value).toFixed(1)
  if (type === 'percent') return `${Number(value).toFixed(1)}%`
  if (type === 'datetime')
    return DateTime.fromISO(String(value)).setZone(KUWAIT).toFormat('yyyy-MM-dd HH:mm')
  if (type === 'date') return DateTime.fromISO(String(value)).setZone(KUWAIT).toFormat('yyyy-MM-dd')
  return String(value)
}

export const displaySummary = (item: SummaryItem) => displayCell(item.type, item.value)
