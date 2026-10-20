import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { openNow } from '../../app/services/explore_hours.js'
import { validateHours } from '../../app/services/explore_write_service.js'

const interval = (
  weekday: number,
  opens_at: string | null,
  closes_at: string | null,
  closes_next_day = false,
  closed = false
) => ({ weekday, interval_index: 0, opens_at, closes_at, closes_next_day, closed })
const monday = (clock: string) => DateTime.fromISO(`2026-10-19T${clock}+03:00`)

test('Open Now handles unknown days, split intervals, boundaries and Kuwait timezone', ({
  assert,
}) => {
  assert.isNull(openNow([], monday('10:00:00')))
  assert.isNull(openNow([interval(2, '09:00:00', '12:00:00')], monday('10:00:00')))
  assert.isFalse(openNow([interval(1, null, null, false, true)], monday('10:00:00')))
  const hours = [interval(1, '09:00:00', '12:00:00'), interval(1, '14:00:00', '18:00:00')]
  assert.isTrue(openNow(hours, monday('09:00:00')))
  assert.isFalse(openNow(hours, monday('12:00:00')))
  assert.isFalse(openNow(hours, monday('13:00:00')))
  assert.isTrue(openNow(hours, DateTime.fromISO('2026-10-19T11:30:00Z')))
})

test('Open Now handles previous-day overnight spill, week rollover and 24-hour hours', ({
  assert,
}) => {
  const hours = [interval(0, '22:00:00', '02:00:00', true)]
  assert.isTrue(openNow(hours, monday('01:59:59')))
  assert.isNull(openNow(hours, monday('02:00:00')))
  assert.isTrue(
    openNow(
      [interval(6, '22:00:00', '02:00:00', true)],
      DateTime.fromISO('2026-10-18T01:00:00+03:00')
    )
  )
  assert.isTrue(openNow([interval(1, '00:00:00', '00:00:00', true)], monday('23:59:59')))
})

test('Structured hours reject ambiguous intervals, overlaps, duplicate slots and invalid closures', ({
  assert,
}) => {
  for (const hours of [
    [interval(1, '12:00', '09:00')],
    [interval(1, '09:00', '12:00', true)],
    [interval(1, '09:00', '12:00'), interval(1, '14:00', '18:00')],
    [interval(1, null, null, false, true), { ...interval(1, '12:00', '14:00'), interval_index: 1 }],
    [interval(0, '22:00', '02:00', true), interval(1, '01:00', '03:00')],
  ])
    assert.throws(() => validateHours(hours))
  assert.doesNotThrows(() =>
    validateHours([
      interval(1, '09:00', '12:00'),
      { ...interval(1, '14:00', '18:00'), interval_index: 1 },
    ])
  )
})
