import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import { ApiError } from './api_error.js'

type Row = Record<string, any>
type Client = typeof db | TransactionClientContract

export const KUWAIT = 'Asia/Kuwait'
export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export type Shift = { opens: string; closes: string }
/** One day of a branch's week as edited in the CMS. */
export type DaySchedule = { mode: 'closed' | 'open24' | 'shifts'; shifts: Shift[] }

const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/

const minutes = (value: string) => {
  const [hours, mins] = value.split(':').map(Number)
  return hours * 60 + mins
}

const dateOnly = (value: unknown) =>
  value instanceof Date
    ? DateTime.fromJSDate(value).toFormat('yyyy-MM-dd')
    : String(value ?? '').slice(0, 10)

function fieldError(field: string, message: string): never {
  throw new ApiError(422, 'VALIDATION_ERROR', message, { [field]: [message] })
}

/** Validates a 7-day schedule (Sunday first) and turns it into `rental_location_hours` rows. */
export function scheduleRows(schedule: DaySchedule[]) {
  if (schedule.length !== 7) fieldError('schedule', 'Set the hours for all seven days.')
  const rows: Array<{ weekday: number; opens_at: string; closes_at: string }> = []
  schedule.forEach((day, weekday) => {
    const name = WEEKDAYS[weekday]
    if (day.mode === 'closed') return
    if (day.mode === 'open24') {
      rows.push({ weekday, opens_at: '00:00', closes_at: '24:00' })
      return
    }
    const shifts = day.shifts.filter((shift) => shift.opens || shift.closes)
    if (!shifts.length) fieldError('schedule', `Add opening hours for ${name} or mark it closed.`)
    if (shifts.length > 2) fieldError('schedule', `${name} can have at most two shifts.`)
    const sorted = [...shifts].sort((a, b) => minutes(a.opens) - minutes(b.opens))
    sorted.forEach((shift, index) => {
      if (!TIME.test(shift.opens) || !TIME.test(shift.closes))
        fieldError('schedule', `Enter ${name}'s times as HH:MM.`)
      if (minutes(shift.closes) <= minutes(shift.opens))
        fieldError('schedule', `${name}: closing time must be after opening time.`)
      if (index > 0 && minutes(shift.opens) < minutes(sorted[index - 1].closes))
        fieldError('schedule', `${name}: shifts must not overlap.`)
      rows.push({ weekday, opens_at: shift.opens, closes_at: shift.closes })
    })
  })
  return rows
}

/** The CMS editor's view of stored hours. */
export function scheduleFromRows(rows: Row[]): DaySchedule[] {
  return WEEKDAYS.map((_, weekday) => {
    const day = rows
      .filter((row) => Number(row.weekday) === weekday)
      .sort((a, b) => minutes(a.opens_at) - minutes(b.opens_at))
    if (!day.length) return { mode: 'closed', shifts: [] }
    if (day.length === 1 && day[0].opens_at === '00:00' && day[0].closes_at === '24:00')
      return { mode: 'open24', shifts: [] }
    return {
      mode: 'shifts',
      shifts: day.map((row) => ({ opens: row.opens_at, closes: row.closes_at })),
    }
  })
}

/** Hours and closed dates for several branches, loaded in two queries. */
export async function branchSchedules(ids: number[], client: Client = db) {
  const unique = [...new Set(ids)]
  const result = new Map<number, { hours: Row[]; closures: Row[] }>()
  for (const id of unique) result.set(id, { hours: [], closures: [] })
  if (!unique.length) return result
  const today = DateTime.now().setZone(KUWAIT).toFormat('yyyy-MM-dd')
  const [hours, closures] = await Promise.all([
    client.from('rental_location_hours').whereIn('location_id', unique),
    client
      .from('rental_location_closures')
      .whereIn('location_id', unique)
      .where('ends_on', '>=', today)
      .orderBy('starts_on'),
  ])
  for (const row of hours as Row[]) result.get(Number(row.location_id))?.hours.push(row)
  for (const row of closures as Row[]) result.get(Number(row.location_id))?.closures.push(row)
  return result
}

/** App shape: `null` working hours means the branch has no fixed hours. */
export function publicSchedule(location: Row, schedule: { hours: Row[]; closures: Row[] }) {
  return {
    working_hours: location.hours_enabled
      ? scheduleFromRows(schedule.hours).map((day, weekday) => ({
          weekday,
          day: WEEKDAYS[weekday].toLowerCase(),
          open_24h: day.mode === 'open24',
          closed: day.mode === 'closed',
          shifts: day.shifts,
        }))
      : null,
    closed_dates: schedule.closures.map((row) => ({
      starts_on: dateOnly(row.starts_on),
      ends_on: dateOnly(row.ends_on),
      reason: row.reason ?? null,
    })),
  }
}

/**
 * Rejects a pickup or return time when the branch is closed: outside its working hours or on a
 * closed date (Kuwait time).
 */
export async function assertBranchOpen(
  client: Client,
  location: Row,
  at: Date,
  field: 'pickup_at' | 'return_at'
) {
  const local = DateTime.fromJSDate(at).setZone(KUWAIT)
  const day = local.toFormat('yyyy-MM-dd')
  const action = field === 'pickup_at' ? 'Pickup' : 'Return'
  const closure = await client
    .from('rental_location_closures')
    .where('location_id', location.id)
    .where('starts_on', '<=', day)
    .where('ends_on', '>=', day)
    .first()
  if (closure)
    throw new ApiError(422, 'BRANCH_CLOSED', `${action} branch is closed on ${day}`, {
      [field]: [`The branch is closed on ${day}${closure.reason ? ` (${closure.reason})` : ''}`],
    })
  if (!location.hours_enabled) return
  const weekday = local.weekday % 7
  const now = local.hour * 60 + local.minute
  const shifts = (await client
    .from('rental_location_hours')
    .where({ location_id: location.id, weekday })) as Row[]
  const open = shifts.some((row) => minutes(row.opens_at) <= now && now <= minutes(row.closes_at))
  if (!open)
    throw new ApiError(
      422,
      'BRANCH_CLOSED',
      `${action} time is outside the branch's working hours`,
      { [field]: [`The branch is closed at ${local.toFormat('ccc HH:mm')}`] }
    )
}

/**
 * Adds "branch `alias` is open at this moment" to a query: inside its working hours (or without
 * fixed hours) and not on a closed date. Mirrors assertBranchOpen().
 */
export function whereBranchOpen(query: any, alias: string, at: Date) {
  const local = DateTime.fromJSDate(at).setZone(KUWAIT)
  const day = local.toFormat('yyyy-MM-dd')
  const time = local.toFormat('HH:mm')
  const weekday = local.weekday % 7
  query
    .where((open: any) =>
      open
        .where(`${alias}.hours_enabled`, false)
        .orWhereExists((hours: any) =>
          hours
            .from('rental_location_hours as h')
            .whereColumn('h.location_id', `${alias}.id`)
            .where('h.weekday', weekday)
            .where('h.opens_at', '<=', time)
            .where('h.closes_at', '>=', time)
        )
    )
    .whereNotExists((closed: any) =>
      closed
        .from('rental_location_closures as c')
        .whereColumn('c.location_id', `${alias}.id`)
        .where('c.starts_on', '<=', day)
        .where('c.ends_on', '>=', day)
    )
  return query
}
