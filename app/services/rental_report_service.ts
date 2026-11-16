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
export type ReportColumn = {
  key: string
  label: string
  type: ColumnType
  /** Shown only in the row's detail view and in exports, not as a table column. */
  detail?: true
}
export type SummaryItem = {
  label: string
  value: string | number
  type: 'money' | 'int' | 'decimal' | 'percent'
  /** How the number is worked out, in a few words. */
  hint: string
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
}

export type ReportDefinition = {
  key: string
  title: string
  /** Short name for the sidebar. */
  menuLabel: string
  filters: (providers: FilterOption[]) => ReportFilter[]
  run: (filters: ReportFilters) => Promise<ReportResult>
}

// ------------------------------------------------------------------ filters

const DATE = /^\d{4}-\d{2}-\d{2}$/
const text = (value: unknown, max = 60) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

const today = () => DateTime.now().setZone(KUWAIT).startOf('day')

/** The range a report opens with: the last 30 days, today included (Kuwait time). */
export function defaultRange() {
  const to = today()
  return { from: to.minus({ days: 29 }).toFormat('yyyy-MM-dd'), to: to.toFormat('yyyy-MM-dd') }
}

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
      'b.id as booking_id',
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
    {
      label: 'Collected',
      value: sum(collected, (row) => fils(row.amount)),
      type: 'money',
      hint: 'All booking fees paid',
    },
    {
      label: 'Refunded',
      value: sum(refunded, (row) => fils(row.amount)),
      type: 'money',
      hint: 'Fees given back',
    },
    {
      label: 'Net revenue',
      value: sum(collected, (row) => fils(row.amount)) - sum(refunded, (row) => fils(row.amount)),
      type: 'money',
      hint: 'Collected minus refunded',
    },
    {
      label: 'Paid payments',
      value: collected.length,
      type: 'int',
      hint: 'Payments that went through',
    },
    {
      label: 'Failed or unfinished',
      value: rows.filter((row) => ['failed', 'initiated'].includes(row.status)).length,
      type: 'int',
      hint: 'Declined or not completed',
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
        { key: 'customer', label: 'Customer', type: 'text', detail: true },
        { key: 'method', label: 'Payment method', type: 'text', detail: true },
        { key: 'amount', label: 'Amount (KWD)', type: 'money' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'refunded_at', label: 'Refunded at', type: 'datetime', detail: true },
        { key: 'invoice_id', label: 'Invoice ID', type: 'text', detail: true },
        { key: 'payment_id', label: 'Payment ID', type: 'text', detail: true },
      ],
      rows: rows.map((row) => ({
        _href: `/admin/rentals/bookings/${row.booking_id}`,
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

// ------------------------------------------------------ 2. bookings detail

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
      { label: 'Bookings', value: rows.length, type: 'int', hint: 'All bookings in the period' },
      {
        label: 'Confirmed or completed',
        value: live.length,
        type: 'int',
        hint: 'Paid and not cancelled',
      },
      {
        label: 'Cancelled',
        value: rows.filter((row) => ['cancelled', 'refund_required'].includes(row.status)).length,
        type: 'int',
        hint: 'By customer or staff',
      },
      {
        label: 'Rental value',
        value: sum(live, (row) => fils(row.rental_amount)),
        type: 'money',
        hint: 'Paid to providers at pickup',
      },
      {
        label: 'Booking fees',
        value: sum(live, (row) => fils(row.booking_fee)),
        type: 'money',
        hint: 'Paid in the app',
      },
    ],
    columns: [
      { key: 'reference', label: 'Reference', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'created_at', label: 'Booked at', type: 'datetime', detail: true },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text', detail: true },
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'vehicle', label: 'Vehicle', type: 'text', detail: true },
      { key: 'pickup_branch', label: 'Pickup branch', type: 'text', detail: true },
      { key: 'return_branch', label: 'Return branch', type: 'text', detail: true },
      { key: 'pickup_at', label: 'Pickup', type: 'datetime' },
      { key: 'return_at', label: 'Return', type: 'datetime', detail: true },
      { key: 'days', label: 'Days', type: 'int', detail: true },
      { key: 'with_driver', label: 'With driver', type: 'text', detail: true },
      { key: 'driver', label: 'Driver', type: 'text', detail: true },
      { key: 'daily_rate', label: 'Daily rate (KWD)', type: 'money', detail: true },
      { key: 'rental_amount', label: 'Rental value (KWD)', type: 'money' },
      { key: 'fee', label: 'Booking fee (KWD)', type: 'money', detail: true },
      { key: 'payment_status', label: 'Fee status', type: 'text' },
      { key: 'payment_method', label: 'Payment method', type: 'text', detail: true },
      { key: 'paid_at', label: 'Paid at', type: 'datetime', detail: true },
      { key: 'refunded_at', label: 'Refunded at', type: 'datetime', detail: true },
      { key: 'cancelled_by', label: 'Cancelled by', type: 'text', detail: true },
      { key: 'cancel_reason', label: 'Cancel reason', type: 'text', detail: true },
    ],
    rows: rows.map((row) => {
      const snapshot = parseSnapshot(row.snapshot)
      return {
        _href: `/admin/rentals/bookings/${row.id}`,
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

// ----------------------------------------------------------------- shared

const percent = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 1000) / 10 : 0
const isCancelled = (row: Row) => ['cancelled', 'refund_required'].includes(row.status)
const isEarning = (row: Row) => ['confirmed', 'completed'].includes(row.status)

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

// ------------------------------------------------ 3. provider and branch performance

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
    {
      label: 'Rentals',
      value: earning.length,
      type: 'int',
      hint: 'Confirmed or completed pickups',
    },
    {
      label: 'Rental value',
      value: sum(earning, (row) => fils(row.rental_amount)),
      type: 'money',
      hint: 'Paid to providers at pickup',
    },
    { label: 'Cancelled', value: cancelled.length, type: 'int', hint: 'Paid, then cancelled' },
    {
      label: 'Cancellation rate',
      value: percent(cancelled.length, bookings.length),
      type: 'percent',
      hint: 'Cancelled ÷ all paid bookings',
    },
  ]
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
      summary,
      columns: [
        { key: 'branch', label: 'Branch', type: 'text' },
        { key: 'place', label: 'Pickup place', type: 'text', detail: true },
        { key: 'provider', label: 'Provider', type: 'text' },
        { key: 'active', label: 'Active', type: 'text', detail: true },
        { key: 'pickups', label: 'Pickups', type: 'int' },
        { key: 'returns', label: 'Returns', type: 'int' },
        { key: 'rental', label: 'Rental value (KWD)', type: 'money' },
        { key: 'cancelled', label: 'Cancelled', type: 'int', detail: true },
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
    summary,
    columns: [
      { key: 'provider', label: 'Provider', type: 'text' },
      { key: 'active', label: 'Active', type: 'text', detail: true },
      { key: 'published', label: 'Published vehicles', type: 'int', detail: true },
      { key: 'rentals', label: 'Rentals', type: 'int' },
      { key: 'with_driver', label: 'With driver', type: 'int', detail: true },
      { key: 'needs_driver', label: 'Needs a driver', type: 'int', detail: true },
      { key: 'rental', label: 'Rental value (KWD)', type: 'money' },
      { key: 'cancelled', label: 'Cancelled', type: 'int' },
      { key: 'by_customer', label: 'by customer', type: 'int', detail: true },
      { key: 'by_staff', label: 'by staff', type: 'int', detail: true },
      { key: 'cancel_rate', label: 'Cancellation rate', type: 'percent' },
      { key: 'rating', label: 'Rating', type: 'decimal' },
      { key: 'reviews', label: 'Reviews', type: 'int', detail: true },
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

// ------------------------------------------------------------ 4. customers

async function customerReport(filters: ReportFilters): Promise<ReportResult> {
  const { start, end } = bounds(filters)
  // Paid bookings made in the range.
  const query = db
    .from('rental_bookings as b')
    .join('customers as c', 'c.id', 'b.customer_id')
    .whereNotNull('b.confirmed_at')
    .where('b.created_at', '>=', start)
    .where('b.created_at', '<', end)
    .select(
      'b.customer_id',
      'b.status',
      'b.rental_amount',
      'b.booking_fee',
      'b.created_at',
      'c.first_name',
      'c.last_name',
      'c.phone_e164',
      'c.email',
      'c.created_at as registered_at'
    )
    .limit(MAX_REPORT_ROWS + 1)
  if (filters.provider) query.where('b.provider_id', filters.provider)
  const bookings = limited((await query) as Row[])
  const byCustomer = new Map<number, Row[]>()
  for (const row of bookings) {
    const id = Number(row.customer_id)
    byCustomer.set(id, [...(byCustomer.get(id) ?? []), row])
  }
  // Lifetime paid bookings tell a new customer from a returning one.
  const lifetime = new Map<number, { total: number; first: Date }>()
  const ids = [...byCustomer.keys()]
  for (let index = 0; index < ids.length; index += 1000) {
    const rows = (await db
      .from('rental_bookings')
      .whereNotNull('confirmed_at')
      .whereIn('customer_id', ids.slice(index, index + 1000))
      .groupBy('customer_id')
      .select('customer_id')
      .count('* as total')
      .min('created_at as first')) as Row[]
    for (const row of rows)
      lifetime.set(Number(row.customer_id), {
        total: Number(row.total),
        first: new Date(row.first),
      })
  }
  const rows = [...byCustomer.entries()].map(([id, items]) => {
    const earned = items.filter(isEarning)
    const lost = items.filter(isCancelled)
    const life = lifetime.get(id)
    const isNew = life ? life.first >= start : true
    return {
      customer: customerName(items[0]),
      phone: items[0].phone_e164 ?? '',
      email: items[0].email ?? '',
      registered_at: iso(items[0].registered_at),
      type: isNew ? 'New' : 'Returning',
      bookings: items.length,
      completed: items.filter((row) => row.status === 'completed').length,
      cancelled: lost.length,
      cancel_rate: percent(lost.length, items.length),
      rental: sum(earned, (row) => fils(row.rental_amount)),
      fees: sum(items, (row) => fils(row.booking_fee)),
      lifetime: life?.total ?? items.length,
      last_booking: iso(
        items.reduce(
          (latest, row) => (new Date(row.created_at) > latest ? new Date(row.created_at) : latest),
          new Date(0)
        )
      ),
    }
  })
  const shown = rows
    .filter((row) =>
      filters.view === 'repeat'
        ? row.lifetime >= 2
        : filters.view === 'cancellers'
          ? row.cancelled >= 2
          : true
    )
    .sort((a, b) => b.rental - a.rental || b.bookings - a.bookings)
  const returning = shown.filter((row) => row.type === 'Returning').length
  return {
    summary: [
      { label: 'Customers', value: shown.length, type: 'int', hint: 'With a paid booking' },
      {
        label: 'New',
        value: shown.length - returning,
        type: 'int',
        hint: 'First booking in this period',
      },
      { label: 'Returning', value: returning, type: 'int', hint: 'Booked before this period' },
      {
        label: 'Returning share',
        value: percent(returning, shown.length),
        type: 'percent',
        hint: 'Returning ÷ all customers',
      },
      {
        label: 'Value per customer',
        value: shown.length ? Math.round(sum(shown, (row) => row.rental) / shown.length) : 0,
        type: 'money',
        hint: 'Rental value ÷ customers',
      },
    ],
    columns: [
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'email', label: 'Email', type: 'text', detail: true },
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'bookings', label: 'Paid bookings', type: 'int' },
      { key: 'completed', label: 'Completed', type: 'int', detail: true },
      { key: 'cancelled', label: 'Cancelled', type: 'int', detail: true },
      { key: 'cancel_rate', label: 'Cancellation rate', type: 'percent', detail: true },
      { key: 'rental', label: 'Rental value (KWD)', type: 'money' },
      { key: 'fees', label: 'Booking fees (KWD)', type: 'money', detail: true },
      { key: 'lifetime', label: 'All-time bookings', type: 'int', detail: true },
      { key: 'last_booking', label: 'Last booking', type: 'datetime' },
      { key: 'registered_at', label: 'Registered', type: 'datetime', detail: true },
    ],
    rows: shown,
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
    menuLabel: 'Booking fees',
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
    key: 'bookings',
    title: 'Bookings detail',
    menuLabel: 'Bookings',
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
    key: 'providers',
    title: 'Provider and branch performance',
    menuLabel: 'Providers and branches',
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
  {
    key: 'customers',
    title: 'Customers',
    menuLabel: 'Customers',
    filters: (providers) => [
      from,
      to,
      providerFilter(providers),
      {
        key: 'view',
        label: 'All customers',
        kind: 'select',
        options: [
          { value: 'repeat', label: 'Repeat customers' },
          { value: 'cancellers', label: 'Cancelled 2 or more' },
        ],
      },
    ],
    run: customerReport,
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
