import { DateTime } from 'luxon'

type Interval = {
  weekday: number
  opens_at: string | null
  closes_at: string | null
  closes_next_day: boolean | number
  closed: boolean | number
}
const seconds = (value: string) =>
  value.split(':').reduce((n, part, index) => n + Number(part) * [3600, 60, 1][index], 0)

/** Missing schedules are unknown. Intervals are [open, close), including yesterday's overnight spill. */
export function openNow(hours: Interval[], at: DateTime = DateTime.now()): boolean | null {
  const now = at.setZone('Asia/Kuwait')
  const day = now.weekday % 7
  const previous = (day + 6) % 7
  const clock = now.hour * 3600 + now.minute * 60 + now.second
  for (const h of hours) {
    if (h.closed || !h.opens_at || !h.closes_at) continue
    const start = seconds(h.opens_at)
    const end = seconds(h.closes_at)
    if (Number(h.weekday) === day && clock >= start && (h.closes_next_day || clock < end))
      return true
    if (Number(h.weekday) === previous && h.closes_next_day && clock < end) return true
  }
  return hours.some((h) => Number(h.weekday) === day) ? false : null
}

/** Matching SQL predicate applied before pagination/count, using one request timestamp. */
export function openNowSql(at: DateTime) {
  const now = at.setZone('Asia/Kuwait')
  const day = now.weekday % 7
  const previous = (day + 6) % 7
  const clock = now.toFormat('HH:mm:ss')
  return {
    sql: `EXISTS (SELECT 1 FROM place_hours oh WHERE oh.place_id = p.id AND oh.closed = 0 AND oh.opens_at IS NOT NULL AND oh.closes_at IS NOT NULL AND ((oh.weekday = ? AND oh.opens_at <= ? AND (oh.closes_next_day = 1 OR oh.closes_at > ?)) OR (oh.weekday = ? AND oh.closes_next_day = 1 AND oh.closes_at > ?)))`,
    bindings: [day, clock, clock, previous, clock],
  }
}
