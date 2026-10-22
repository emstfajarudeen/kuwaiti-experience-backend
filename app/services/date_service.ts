import { DateTime } from 'luxon'

export function formatKuwaitDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const dt =
    typeof date === 'string'
      ? DateTime.fromISO(date, { zone: 'utc' })
      : DateTime.fromJSDate(date instanceof Date ? date : new Date(date))
  if (!dt.isValid) return '—'
  return dt.setZone('Asia/Kuwait').toFormat("d LLL yyyy, HH:mm '(Kuwait)'")
}

export function formatKuwaitDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const dt =
    typeof date === 'string'
      ? DateTime.fromISO(date, { zone: 'utc' })
      : DateTime.fromJSDate(date instanceof Date ? date : new Date(date))
  if (!dt.isValid) return '—'
  return dt.setZone('Asia/Kuwait').toFormat('d LLL yyyy')
}

export function formatKuwaitTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const dt =
    typeof date === 'string'
      ? DateTime.fromISO(date, { zone: 'utc' })
      : DateTime.fromJSDate(date instanceof Date ? date : new Date(date))
  if (!dt.isValid) return '—'
  return dt.setZone('Asia/Kuwait').toFormat("HH:mm '(Kuwait)'")
}
