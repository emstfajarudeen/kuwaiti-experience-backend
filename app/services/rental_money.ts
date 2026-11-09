/**
 * KWD has three decimal places (1 KWD = 1000 fils). All rental arithmetic is
 * done on integer fils so totals are exact and reproducible.
 */
export function toFils(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const text = typeof value === 'number' ? value.toFixed(3) : String(value).trim()
  if (!/^-?\d+(\.\d{1,3})?$/.test(text)) throw new Error(`Invalid KWD amount: ${text}`)
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = text.replace('-', '').split('.')
  const fils = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'))
  return negative ? -fils : fils
}

/** Formats fils as the API's money string, for example 12500 → "12.500". */
export function kwd(fils: number): string {
  const negative = fils < 0
  const absolute = Math.abs(Math.round(fils))
  const text = `${Math.floor(absolute / 1000)}.${String(absolute % 1000).padStart(3, '0')}`
  return negative ? `-${text}` : text
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Billable rental days: every started 24-hour period counts, with a minimum of one. */
export function rentalDays(pickupAt: Date, returnAt: Date) {
  return Math.max(1, Math.ceil((returnAt.getTime() - pickupAt.getTime()) / DAY_MS))
}

export type RentalQuote = {
  days: number
  daily_rate: string
  driver_daily_rate: string
  rental_amount: string
  booking_fee: string
  /** Paid in the app now. */
  pay_now: string
  /** Paid directly to the rental provider at pickup. */
  pay_at_pickup: string
  currency: 'KWD'
}

export function quoteFor(input: {
  pickupAt: Date
  returnAt: Date
  dailyRate: unknown
  driverDailyRate: unknown
  withDriver: boolean
  bookingFee: unknown
}): RentalQuote {
  const days = rentalDays(input.pickupAt, input.returnAt)
  const daily = toFils(input.dailyRate)
  const driver = input.withDriver ? toFils(input.driverDailyRate) : 0
  const rental = days * (daily + driver)
  const fee = toFils(input.bookingFee)
  return {
    days,
    daily_rate: kwd(daily),
    driver_daily_rate: kwd(driver),
    rental_amount: kwd(rental),
    booking_fee: kwd(fee),
    pay_now: kwd(fee),
    pay_at_pickup: kwd(rental),
    currency: 'KWD',
  }
}
