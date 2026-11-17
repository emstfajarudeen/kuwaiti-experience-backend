import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import limiter from '@adonisjs/limiter/services/main'
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import {
  GatewayRejectedError,
  swapPaymentGateway,
  type GatewayInvoiceStatus,
  type PaymentGateway,
} from '../../app/services/myfatoorah_service.js'
import { quoteFor, toFils, kwd, rentalDays } from '../../app/services/rental_money.js'
import { loginAdmin } from '../helpers/admin_auth.js'
import { refundBooking } from '../../app/services/rental_payment_service.js'
import {
  sendProviderEmail,
  swapRentalMailer,
  type OutgoingEmail,
  type RentalMailer,
} from '../../app/services/rental_provider_mailer.js'

const DAY = 24 * 60 * 60 * 1000

async function customer() {
  const phone = `+965${randomInt(10000000, 99999999)}`
  const [id] = await db.table('customers').insert({
    phone_e164: phone,
    first_name: 'Mariam',
    last_name: 'Al-Khaled',
    phone_verified_at: new Date(),
    created_at: new Date(),
  })
  const token = `ca_${randomBytes(48).toString('base64url')}`
  await db.table('customer_sessions').insert({
    id: randomUUID(),
    customer_id: id,
    access_token_hash: createHash('sha256').update(token).digest('hex'),
    access_expires_at: new Date(Date.now() + 900000),
    authenticated_at: new Date(),
    expires_at: new Date(Date.now() + 86400000),
    created_at: new Date(),
  })
  return { id: Number(id), phone, token: `Bearer ${token}` }
}

async function catalog(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  const [providerId] = await db.table('rental_providers').insert({
    name_en: 'Gulf Rent',
    name_ar: 'الخليج للتأجير',
    phone_e164: '+96522223333',
    active: true,
    created_at: now,
  })
  const [airportPlace] = await db.table('rental_places').insert({
    name_en: 'Kuwait Airport',
    name_ar: 'المطار',
    subtitle_en: 'Farwaniya · Terminal 4',
    active: true,
    sort_order: 1,
    created_at: now,
  })
  const [cityPlace] = await db
    .table('rental_places')
    .insert({ name_en: 'Kuwait City', active: true, sort_order: 2, created_at: now })
  const [airport] = await db.table('rental_locations').insert({
    provider_id: providerId,
    place_id: airportPlace,
    name_en: 'Kuwait Airport',
    name_ar: 'المطار',
    active: true,
    sort_order: 1,
    created_at: now,
  })
  const [city] = await db.table('rental_locations').insert({
    provider_id: providerId,
    place_id: cityPlace,
    name_en: 'Kuwait City',
    active: true,
    sort_order: 2,
    created_at: now,
  })
  const [vehicleId] = await db.table('rental_vehicles').insert({
    provider_id: providerId,
    name_en: 'Toyota Camry',
    name_ar: 'تويوتا كامري',
    make: 'Toyota',
    model: 'Camry',
    year: 2025,
    vehicle_type: 'sedan',
    transmission: 'automatic',
    fuel_type: 'petrol',
    seats: 5,
    daily_rate: '12.500',
    extra_km_rate: '0.120',
    mileage_limit_km: 250,
    with_driver_available: true,
    driver_daily_rate: '8.000',
    quantity: 1,
    status: 'published',
    published_at: new Date(Date.now() - 60000),
    created_at: now,
    ...overrides,
  })
  await db.table('rental_vehicle_terms').multiInsert([
    {
      vehicle_id: vehicleId,
      label_en: '21+ age',
      label_ar: 'العمر 21+',
      sort_order: 0,
      created_at: now,
    },
    {
      vehicle_id: vehicleId,
      label_en: 'KD 50 deposit',
      label_ar: null,
      sort_order: 1,
      created_at: now,
    },
  ])
  await db.table('rental_vehicle_locations').multiInsert([
    { vehicle_id: vehicleId, location_id: airport },
    { vehicle_id: vehicleId, location_id: city },
  ])
  return {
    providerId: Number(providerId),
    vehicleId: Number(vehicleId),
    /** Pickup place ids, as the app sends them. */
    airport: Number(airportPlace),
    city: Number(cityPlace),
    /** The provider's branches at those places. */
    airportBranch: Number(airport),
    cityBranch: Number(city),
  }
}

function period(startDays = 3, days = 2.5) {
  const pickup = new Date(Date.now() + startDays * DAY)
  pickup.setUTCSeconds(0, 0)
  const ret = new Date(pickup.getTime() + days * DAY)
  return { pickup_at: pickup.toISOString(), return_at: ret.toISOString() }
}

class FakeGateway implements PaymentGateway {
  invoices = new Map<number, GatewayInvoiceStatus>()
  nextInvoice = 5000
  refunds: Array<{ paymentId: string; amount: number }> = []
  async initiatePayment(amount: number) {
    return [
      {
        PaymentMethodId: 1,
        PaymentMethodEn: 'KNET',
        PaymentMethodAr: 'كي نت',
        PaymentMethodCode: 'kn',
        IsDirectPayment: false,
        ServiceCharge: 0,
        TotalAmount: amount,
        CurrencyIso: 'KWD',
        ImageUrl: null,
      },
    ]
  }
  async executePayment(input: { amount: number; customerReference: string }) {
    const id = this.nextInvoice++
    this.invoices.set(id, {
      InvoiceId: id,
      InvoiceStatus: 'Pending',
      InvoiceValue: input.amount,
      CustomerReference: input.customerReference,
      UserDefinedField: null,
      InvoiceTransactions: [],
    })
    return { InvoiceId: id, PaymentURL: `https://pay.test/invoice/${id}` }
  }
  pay(id: number, value?: number) {
    const invoice = this.invoices.get(id)!
    invoice.InvoiceStatus = 'Paid'
    if (value !== undefined) invoice.InvoiceValue = value
    invoice.InvoiceTransactions = [
      { PaymentId: `PAY-${id}`, TransactionStatus: 'Succss', PaymentGateway: 'KNET' },
    ]
  }
  async getPaymentStatus(key: string, keyType: 'InvoiceId' | 'PaymentId') {
    const id = keyType === 'InvoiceId' ? Number(key) : Number(key.replace('PAY-', ''))
    const invoice = this.invoices.get(id)
    if (!invoice) throw new Error('unknown invoice')
    return structuredClone(invoice)
  }
  refuseRefunds: string | null = null
  async makeRefund(paymentId: string, amount: number) {
    if (this.refuseRefunds) throw new GatewayRejectedError(this.refuseRefunds)
    this.refunds.push({ paymentId, amount })
    return { RefundId: 77, RefundReference: 'RF-77' }
  }
}

test.group('Rental money', () => {
  test('computes exact KWD amounts in fils', ({ assert }) => {
    assert.equal(toFils('12.5'), 12500)
    assert.equal(kwd(12500), '12.500')
    assert.equal(kwd(toFils('0.001') * 3), '0.003')
    const pickup = new Date('2026-12-01T10:00:00Z')
    assert.equal(rentalDays(pickup, new Date('2026-12-01T11:00:00Z')), 1)
    assert.equal(rentalDays(pickup, new Date('2026-12-03T10:00:00Z')), 2)
    assert.equal(rentalDays(pickup, new Date('2026-12-03T10:01:00Z')), 3)
    const quote = quoteFor({
      pickupAt: pickup,
      returnAt: new Date('2026-12-04T09:00:00Z'),
      dailyRate: '12.500',
      driverDailyRate: '8.000',
      withDriver: true,
      bookingFee: '3',
    })
    assert.deepInclude(quote, {
      days: 3,
      rental_amount: '61.500',
      pay_at_pickup: '61.500',
      pay_now: '3.000',
    })
  })
})

class FakeMailer implements RentalMailer {
  sent: OutgoingEmail[] = []
  configured() {
    return true
  }
  async send(email: OutgoingEmail) {
    this.sent.push(email)
    return { id: `msg-${this.sent.length}` }
  }
}

test.group('Rental catalog and bookings', (group) => {
  let gateway: FakeGateway
  let mailer: FakeMailer
  let restore: () => void
  let restoreMailer: () => void
  group.each.setup(async () => {
    await limiter.clear()
    gateway = new FakeGateway()
    mailer = new FakeMailer()
    restore = swapPaymentGateway(gateway)
    restoreMailer = swapRentalMailer(mailer)
    const rollback = await testUtils.db().withGlobalTransaction()
    return () => {
      restore()
      restoreMailer()
      return rollback()
    }
  })

  async function confirmedBooking(
    client: any,
    user: { token: string },
    ids: { vehicleId: number; airport: number },
    key: string,
    window = period()
  ) {
    const created = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', user.token)
      .header('Idempotency-Key', key)
      .json({ vehicle_id: ids.vehicleId, pickup_location_id: ids.airport, ...window })
    const id = created.body().data.id
    const started = await client
      .post(`/api/v2/customer/me/rental-bookings/${id}/payment`)
      .header('Authorization', user.token)
      .json({ payment_method_id: 1 })
    gateway.pay(Number(started.body().data.invoice_id))
    await client
      .post(`/api/v2/customer/me/rental-bookings/${id}/payment/verify`)
      .header('Authorization', user.token)
    return Number(id)
  }

  test('books with and without a driver and prices each correctly', async ({ client, assert }) => {
    const ids = await catalog({ quantity: 2 })
    const user = await customer()
    const window = period(3, 3)
    const book = (key: string, withDriver: boolean) =>
      client
        .post('/api/v2/customer/me/rental-bookings')
        .header('Authorization', user.token)
        .header('Idempotency-Key', key)
        .json({
          vehicle_id: ids.vehicleId,
          pickup_location_id: ids.airport,
          ...window,
          with_driver: withDriver,
        })

    const selfDrive = await book('driver-key-01', false)
    selfDrive.assertStatus(201)
    assert.isFalse(selfDrive.body().data.with_driver)
    assert.deepInclude(selfDrive.body().data.price, {
      days: 3,
      daily_rate: '12.500',
      driver_daily_rate: '0.000',
      rental_amount: '37.500',
      pay_now: '3.000',
      pay_at_pickup: '37.500',
    })

    const withDriver = await book('driver-key-02', true)
    withDriver.assertStatus(201)
    assert.isTrue(withDriver.body().data.with_driver)
    assert.deepInclude(withDriver.body().data.price, {
      days: 3,
      daily_rate: '12.500',
      driver_daily_rate: '8.000',
      rental_amount: '61.500',
      pay_now: '3.000',
      pay_at_pickup: '61.500',
    })
    const stored = await db
      .from('rental_bookings')
      .where('id', withDriver.body().data.id)
      .firstOrFail()
    assert.isTrue(Boolean(stored.with_driver))
    assert.equal(kwd(toFils(stored.rental_amount)), '61.500')
  })

  test('driver-only vehicles are only searched, quoted and booked with a driver', async ({
    client,
    assert,
  }) => {
    const ids = await catalog({ self_drive_available: false })
    const user = await customer()
    const window = period()

    const selfDrive = await client.get('/api/v2/rentals/vehicles').qs(window)
    assert.notInclude(
      selfDrive.body().data.map((item: { id: number }) => item.id),
      ids.vehicleId
    )
    const driverSearch = await client
      .get('/api/v2/rentals/vehicles')
      .qs({ ...window, with_driver: 'true' })
    const card = driverSearch.body().data.find((item: { id: number }) => item.id === ids.vehicleId)
    assert.equal(card.rental_mode, 'with_driver')
    assert.isFalse(card.self_drive_available)

    const quote = await client.get(`/api/v2/rentals/vehicles/${ids.vehicleId}/quote`).qs(window)
    quote.assertStatus(422)
    assert.equal(quote.body().error.code, 'DRIVER_REQUIRED')

    const book = (key: string, withDriver: boolean) =>
      client
        .post('/api/v2/customer/me/rental-bookings')
        .header('Authorization', user.token)
        .header('Idempotency-Key', key)
        .json({
          vehicle_id: ids.vehicleId,
          pickup_location_id: ids.airport,
          ...window,
          with_driver: withDriver,
        })
    const withoutDriver = await book('driver-only-1', false)
    withoutDriver.assertStatus(422)
    assert.equal(withoutDriver.body().error.code, 'DRIVER_REQUIRED')
    const withDriver = await book('driver-only-2', true)
    withDriver.assertStatus(201)
    assert.isTrue(withDriver.body().data.with_driver)
  })

  test('branch hours and closed dates limit pickups and returns', async ({ client, assert }) => {
    const ids = await catalog()
    const user = await customer()
    await db.from('rental_locations').where('id', ids.airportBranch).update({ hours_enabled: true })
    // Open 09:00-13:00 and 16:00-22:00 every day except Friday (Kuwait time).
    await db.table('rental_location_hours').multiInsert(
      [0, 1, 2, 3, 4, 6].flatMap((weekday) => [
        { location_id: ids.airportBranch, weekday, opens_at: '09:00', closes_at: '13:00' },
        { location_id: ids.airportBranch, weekday, opens_at: '16:00', closes_at: '22:00' },
      ])
    )
    const kuwait = (days: number, hour: number) => {
      const date = new Date(Date.now() + days * DAY)
      const local = new Date(date.getTime() + 3 * 60 * 60 * 1000)
      local.setUTCHours(hour, 0, 0, 0)
      return new Date(local.getTime() - 3 * 60 * 60 * 1000)
    }
    // A day at least two days ahead such that it and the next three days (the two-day
    // rentals below pick up and return within them) are not Fridays in Kuwait.
    const isFriday = (days: number) =>
      new Date(kuwait(days, 12).getTime() + 3 * 60 * 60 * 1000).getUTCDay() === 5
    let offset = 2
    while ([0, 1, 2, 3].some((step) => isFriday(offset + step))) offset++
    const book = (key: string, pickup: Date, extra: Record<string, unknown> = {}) =>
      client
        .post('/api/v2/customer/me/rental-bookings')
        .header('Authorization', user.token)
        .header('Idempotency-Key', key)
        .json({
          vehicle_id: ids.vehicleId,
          pickup_location_id: ids.airport,
          pickup_at: pickup.toISOString(),
          return_at: new Date(pickup.getTime() + 2 * DAY).toISOString(),
          ...extra,
        })

    const lunchBreak = await book('hours-key-01', kuwait(offset, 14))
    lunchBreak.assertStatus(422)
    assert.equal(lunchBreak.body().error.code, 'BRANCH_CLOSED')

    // The summary screen's quote runs the same place and hours checks, without booking.
    const quote = (pickup: Date, extra: Record<string, unknown> = {}) =>
      client.get(`/api/v2/rentals/vehicles/${ids.vehicleId}/quote`).qs({
        pickup_at: pickup.toISOString(),
        return_at: new Date(pickup.getTime() + 2 * DAY).toISOString(),
        ...extra,
      })
    const closedQuote = await quote(kuwait(offset, 14), { pickup_location_id: ids.airport })
    closedQuote.assertStatus(422)
    assert.equal(closedQuote.body().error.code, 'BRANCH_CLOSED')
    const priceOnly = await quote(kuwait(offset, 14))
    priceOnly.assertStatus(200)
    assert.isNull(priceOnly.body().data.pickup_location)
    const openQuote = await quote(kuwait(offset, 10), { pickup_location_id: ids.airport })
    openQuote.assertStatus(200)
    assert.equal(openQuote.body().data.pickup_location.id, ids.airport)
    assert.equal(openQuote.body().data.pickup_location.branch.id, ids.airportBranch)
    // The list applies the same gate at pickup and at return, so it never shows a car the
    // quote would refuse.
    let returnDay = offset + 1
    while (new Date(kuwait(returnDay, 12).getTime() + 3 * 60 * 60 * 1000).getUTCDay() === 5)
      returnDay++
    const searchWithReturn = (returnAt: Date) =>
      client.get('/api/v2/rentals/vehicles').qs({
        pickup_location_id: ids.airport,
        pickup_at: kuwait(offset, 10).toISOString(),
        return_at: returnAt.toISOString(),
      })
    const openReturn = await searchWithReturn(kuwait(returnDay, 10))
    assert.include(
      openReturn.body().data.map((item: { id: number }) => item.id),
      ids.vehicleId
    )
    const closedReturn = await searchWithReturn(kuwait(returnDay, 14))
    assert.notInclude(
      closedReturn.body().data.map((item: { id: number }) => item.id),
      ids.vehicleId
    )
    const otherReturn = await quote(kuwait(offset, 10), {
      pickup_location_id: ids.airport,
      return_location_id: ids.city,
    })
    otherReturn.assertStatus(422)
    assert.equal(otherReturn.body().error.code, 'INVALID_LOCATION')
    const bookingCount = await db.from('rental_bookings').count('* as total').first()
    assert.equal(Number(bookingCount.total), 0, 'quotes never create bookings')

    const places = await client.get('/api/v2/rentals/locations')
    const place = places.body().data.find((item: { id: number }) => item.id === ids.airport)
    assert.deepEqual(place, {
      id: ids.airport,
      name: 'Kuwait Airport',
      address: 'Farwaniya · Terminal 4',
      latitude: null,
      longitude: null,
    })
    const detail = await client.get(`/api/v2/rentals/vehicles/${ids.vehicleId}`)
    const airport = detail
      .body()
      .data.locations.find((item: { id: number }) => item.id === ids.airport)
    assert.equal(airport.branch.id, ids.airportBranch)
    assert.lengthOf(airport.branch.working_hours, 7)
    assert.isTrue(airport.branch.working_hours[5].closed)
    assert.deepEqual(airport.branch.working_hours[0].shifts, [
      { opens: '09:00', closes: '13:00' },
      { opens: '16:00', closes: '22:00' },
    ])

    const day = new Date(kuwait(offset, 10).getTime() + 3 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    await db.table('rental_location_closures').insert({
      location_id: ids.airportBranch,
      starts_on: day,
      ends_on: day,
      reason: 'Holiday',
      created_at: new Date(),
    })
    const holiday = await book('hours-key-02', kuwait(offset, 10))
    holiday.assertStatus(422)
    assert.equal(holiday.body().error.code, 'BRANCH_CLOSED')
    const listed = await client.get(`/api/v2/rentals/vehicles/${ids.vehicleId}`)
    assert.deepEqual(
      listed.body().data.locations.find((item: { id: number }) => item.id === ids.airport).branch
        .closed_dates,
      [{ starts_on: day, ends_on: day, reason: 'Holiday' }]
    )

    const open = await book('hours-key-03', kuwait(offset + 1, 10))
    // Only when neither the pickup day nor the return day (two days later) is a Friday.
    const weekdayIn = (days: number) =>
      new Date(kuwait(days, 10).getTime() + 3 * 60 * 60 * 1000).getUTCDay()
    if (weekdayIn(offset + 1) !== 5 && weekdayIn(offset + 3) !== 5) {
      open.assertStatus(201)
      assert.equal(open.body().data.return_location.id, ids.airport)
    }

    const [otherProvider] = await db
      .table('rental_providers')
      .insert({ name_en: 'Other Rent', active: true, created_at: new Date() })
    const [foreignPlace] = await db
      .table('rental_places')
      .insert({ name_en: 'Elsewhere', active: true, sort_order: 9, created_at: new Date() })
    await db.table('rental_locations').insert({
      provider_id: otherProvider,
      place_id: foreignPlace,
      name_en: 'Other branch',
      active: true,
      sort_order: 0,
      created_at: new Date(),
    })
    const wrongReturn = await book('hours-key-04', kuwait(offset + 3, 10), {
      return_location_id: foreignPlace,
    })
    wrongReturn.assertStatus(422)
    assert.equal(wrongReturn.body().error.code, 'INVALID_LOCATION')
    const otherPlace = await book('hours-key-05', kuwait(offset + 3, 10), {
      return_location_id: ids.city,
    })
    otherPlace.assertStatus(422)
    assert.equal(otherPlace.body().error.code, 'INVALID_LOCATION')
  })

  test('the provider is emailed when a booking is confirmed and when it is cancelled', async ({
    client,
    assert,
  }) => {
    const ids = await catalog()
    await db
      .from('rental_providers')
      .where('id', ids.providerId)
      .update({ email: 'bookings@gulfrent.test' })
    const user = await customer()
    const id = await confirmedBooking(client, user, ids, 'mail-key-0001')
    const booking = await db.from('rental_bookings').where('id', id).firstOrFail()
    assert.equal(booking.status, 'confirmed')
    assert.lengthOf(mailer.sent, 1)
    assert.equal(mailer.sent[0].to, 'bookings@gulfrent.test')
    assert.include(mailer.sent[0].subject, booking.reference)
    assert.include(mailer.sent[0].text, user.phone)
    assert.include(mailer.sent[0].text, 'Toyota Camry')

    const cancelled = await client
      .post(`/api/v2/customer/me/rental-bookings/${id}/cancel`)
      .header('Authorization', user.token)
      .json({ reason: 'Plans changed' })
    cancelled.assertStatus(200)
    assert.lengthOf(mailer.sent, 2)
    assert.include(mailer.sent[1].subject, 'cancelled')
    assert.include(mailer.sent[1].text, 'Plans changed')

    const log = await db.from('rental_provider_emails').where('booking_id', id).orderBy('id')
    assert.deepEqual(
      log.map((row) => [row.kind, row.status]),
      [
        ['confirmed', 'sent'],
        ['cancelled', 'sent'],
      ]
    )

    await db.from('rental_providers').where('id', ids.providerId).update({ email: null })
    const skipped = await sendProviderEmail(id, 'cancelled')
    assert.equal(skipped.status, 'skipped')
    assert.lengthOf(mailer.sent, 2)
  })

  test('customers review finished rentals and ratings appear on vehicles', async ({
    client,
    assert,
  }) => {
    const ids = await catalog()
    const user = await customer()
    const stranger = await customer()
    const id = await confirmedBooking(client, user, ids, 'review-key-01')
    const review = (who: { token: string }, body: Record<string, unknown>) =>
      client
        .put(`/api/v2/customer/me/rental-bookings/${id}/review`)
        .header('Authorization', who.token)
        .json(body)

    const early = await review(user, { rating: 5 })
    early.assertStatus(409)
    assert.equal(early.body().error.code, 'REVIEW_NOT_ALLOWED')

    await db.from('rental_bookings').where('id', id).update({ status: 'completed' })
    const invalid = await review(user, { rating: 6 })
    invalid.assertStatus(422)
    const other = await review(stranger, { rating: 1 })
    other.assertStatus(404)

    const created = await review(user, { rating: 5, comment: '  Clean car  ' })
    created.assertStatus(201)
    assert.equal(created.body().data.comment, 'Clean car')
    const updated = await review(user, { rating: 4, comment: 'Clean car, late pickup' })
    updated.assertStatus(200)
    assert.equal(updated.body().data.rating, 4)

    const detail = await client
      .get(`/api/v2/customer/me/rental-bookings/${id}`)
      .header('Authorization', user.token)
    assert.equal(detail.body().data.review.rating, 4)
    assert.isTrue(detail.body().data.can_review)

    const list = await client.get(`/api/v2/rentals/vehicles/${ids.vehicleId}/reviews`)
    list.assertStatus(200)
    assert.lengthOf(list.body().data, 1)
    assert.equal(list.body().data[0].author_name, 'Mariam A.')
    assert.deepEqual(list.body().meta.rating, {
      average: 4,
      count: 1,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 },
    })
    const providerList = await client.get(`/api/v2/rentals/providers/${ids.providerId}/reviews`)
    assert.lengthOf(providerList.body().data, 1)

    const cards = await client.get('/api/v2/rentals/vehicles')
    const card = cards.body().data.find((item: { id: number }) => item.id === ids.vehicleId)
    assert.deepEqual(card.rating, { average: 4, count: 1 })
    assert.deepEqual(card.provider.rating, { average: 4, count: 1 })

    await db.from('rental_reviews').where('booking_id', id).update({ status: 'hidden' })
    const hidden = await client.get(`/api/v2/rentals/vehicles/${ids.vehicleId}/reviews`)
    assert.lengthOf(hidden.body().data, 0)
    assert.isNull(hidden.body().meta.rating.average)

    const removed = await client
      .delete(`/api/v2/customer/me/rental-bookings/${id}/review`)
      .header('Authorization', user.token)
    removed.assertStatus(204)
    const again = await client
      .delete(`/api/v2/customer/me/rental-bookings/${id}/review`)
      .header('Authorization', user.token)
    again.assertStatus(404)
  })

  test('search lists available published vehicles with quotes and localized detail', async ({
    client,
    assert,
  }) => {
    const ids = await catalog()
    await catalog({ status: 'draft', name_en: 'Hidden draft' })
    const window = period()

    const options = await client.get('/api/v2/rentals/options')
    options.assertStatus(200)
    assert.equal(options.body().data.booking_fee, '3.000')
    assert.isAtLeast(options.body().data.locations.length, 2)

    const list = await client.get('/api/v2/rentals/vehicles').qs({
      ...window,
      pickup_location_id: ids.airport,
      with_driver: 'true',
      vehicle_type: 'sedan',
    })
    list.assertStatus(200)
    assert.lengthOf(list.body().data, 1)
    const card = list.body().data[0]
    assert.equal(card.id, ids.vehicleId)
    assert.equal(card.quote.days, 3)
    assert.equal(card.quote.rental_amount, '61.500')
    assert.equal(card.quote.pay_now, '3.000')

    const filtered = await client.get('/api/v2/rentals/vehicles').qs({ vehicle_type: 'suv' })
    assert.lengthOf(filtered.body().data, 0)
    const invalid = await client.get('/api/v2/rentals/vehicles').qs({ sort: 'cheapest' })
    invalid.assertStatus(422)

    const detail = await client
      .get(`/api/v2/rentals/vehicles/${ids.vehicleId}`)
      .header('Accept-Language', 'ar')
      .qs(window)
    detail.assertStatus(200)
    assert.equal(detail.body().data.name, 'تويوتا كامري')
    assert.isTrue(detail.body().data.available)
    assert.lengthOf(detail.body().data.locations, 2)
    assert.deepEqual(detail.body().data.rental_terms, [
      { label: 'العمر 21+' },
      { label: 'KD 50 deposit' },
    ])
    assert.equal(detail.body().data.extra_km_rate, '0.120')
    assert.equal(detail.body().data.mileage_limit_km, 250)
    assert.notProperty(detail.body().data, 'terms')
    assert.notProperty(detail.body().data, 'min_driver_age')
    assert.notProperty(detail.body().data, 'deposit_amount')
    assert.property(detail.body().data, 'cover_image_key')
    assert.isUndefined(detail.body().data.cover_image_url)
    assert.isArray(detail.body().data.gallery)
    assert.isArray(detail.body().meta.images)
    assert.isArray(list.body().meta.images)

    const quote = await client.get(`/api/v2/rentals/vehicles/${ids.vehicleId}/quote`).qs(window)
    quote.assertStatus(200)
    assert.equal(quote.body().data.rental_amount, '37.500')

    const pastPickup = await client.get(`/api/v2/rentals/vehicles/${ids.vehicleId}/quote`).qs({
      pickup_at: new Date().toISOString(),
      return_at: new Date(Date.now() + DAY).toISOString(),
    })
    pastPickup.assertStatus(422)
  })

  test('reservations are idempotent, owner-scoped and block double booking', async ({
    client,
    assert,
  }) => {
    const ids = await catalog()
    const a = await customer()
    const b = await customer()
    const body = { vehicle_id: ids.vehicleId, pickup_location_id: ids.airport, ...period() }

    const missingKey = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', a.token)
      .json(body)
    missingKey.assertStatus(422)

    const first = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', a.token)
      .header('Idempotency-Key', 'booking-key-0001')
      .json(body)
    first.assertStatus(201)
    const booking = first.body().data
    assert.equal(booking.status, 'pending_payment')
    assert.match(booking.reference, /^RN-[A-Z0-9]{8}$/)
    assert.equal(booking.return_location.id, ids.airport)
    assert.equal(booking.price.booking_fee, '3.000')
    assert.isString(booking.hold_expires_at)

    const replay = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', a.token)
      .header('Idempotency-Key', 'booking-key-0001')
      .json(body)
    replay.assertStatus(200)
    assert.equal(replay.body().data.id, booking.id)

    const conflict = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', a.token)
      .header('Idempotency-Key', 'booking-key-0001')
      .json({ ...body, with_driver: true })
    conflict.assertStatus(409)

    const taken = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', b.token)
      .header('Idempotency-Key', 'booking-key-0002')
      .json(body)
    taken.assertStatus(409)
    assert.equal(taken.body().error.code, 'VEHICLE_UNAVAILABLE')

    const search = await client
      .get('/api/v2/rentals/vehicles')
      .qs({ pickup_at: body.pickup_at, return_at: body.return_at })
    assert.lengthOf(search.body().data, 0)

    const foreign = await client
      .get(`/api/v2/customer/me/rental-bookings/${booking.id}`)
      .header('Authorization', b.token)
    foreign.assertStatus(404)
    const mine = await client
      .get('/api/v2/customer/me/rental-bookings?status=active')
      .header('Authorization', a.token)
    assert.lengthOf(mine.body().data, 1)

    // An expired hold frees the car for someone else.
    await db
      .from('rental_bookings')
      .where('id', booking.id)
      .update({ hold_expires_at: new Date(Date.now() - 1000) })
    const second = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', b.token)
      .header('Idempotency-Key', 'booking-key-0003')
      .json(body)
    second.assertStatus(201)
    const expired = await client
      .get(`/api/v2/customer/me/rental-bookings/${booking.id}`)
      .header('Authorization', a.token)
    assert.equal(expired.body().data.status, 'expired')
  })

  test('rejects locations and driver option the vehicle does not offer, and full bookings', async ({
    client,
  }) => {
    const ids = await catalog({ with_driver_available: false, driver_daily_rate: null })
    const user = await customer()
    const [elsewhere] = await db
      .table('rental_locations')
      .insert({ name_en: 'Jahra', active: true, sort_order: 3, created_at: new Date() })
    const window = period()
    const post = (key: string, extra: Record<string, unknown>) =>
      client
        .post('/api/v2/customer/me/rental-bookings')
        .header('Authorization', user.token)
        .header('Idempotency-Key', key)
        .json({ vehicle_id: ids.vehicleId, pickup_location_id: ids.airport, ...window, ...extra })
    const wrongLocation = await post('key-location', { pickup_location_id: elsewhere })
    wrongLocation.assertStatus(422)
    const noDriver = await post('key-driver-1', { with_driver: true })
    noDriver.assertStatus(422)
    const taken = await post('key-first', {})
    taken.assertStatus(201)
    const fullyBooked = await post('key-second', {})
    fullyBooked.assertStatus(409)
  })

  test('a pickup place with two branches uses the one that is open', async ({ client, assert }) => {
    const ids = await catalog()
    const user = await customer()
    const [airportPlace] = await db
      .from('rental_locations')
      .where('id', ids.airportBranch)
      .select('place_id')
    // The first branch closes at 13:00; a second branch at the same place has no fixed hours.
    await db.from('rental_locations').where('id', ids.airportBranch).update({ hours_enabled: true })
    await db.table('rental_location_hours').multiInsert(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        location_id: ids.airportBranch,
        weekday,
        opens_at: '09:00',
        closes_at: '13:00',
      }))
    )
    const [second] = await db.table('rental_locations').insert({
      provider_id: ids.providerId,
      place_id: airportPlace.place_id,
      name_en: 'Airport Terminal 2',
      active: true,
      sort_order: 3,
      created_at: new Date(),
    })
    await db
      .table('rental_vehicle_locations')
      .insert({ vehicle_id: ids.vehicleId, location_id: second })
    const kuwait = (days: number, hour: number) => {
      const local = new Date(Date.now() + days * DAY + 3 * 60 * 60 * 1000)
      local.setUTCHours(hour, 0, 0, 0)
      return new Date(local.getTime() - 3 * 60 * 60 * 1000)
    }
    const pickup = kuwait(3, 15)
    const range = {
      pickup_at: pickup.toISOString(),
      return_at: new Date(pickup.getTime() + DAY).toISOString(),
    }
    const search = () =>
      client.get('/api/v2/rentals/vehicles').qs({ pickup_location_id: ids.airport, ...range })
    const quote = () =>
      client
        .get(`/api/v2/rentals/vehicles/${ids.vehicleId}/quote`)
        .qs({ pickup_location_id: ids.airport, ...range })

    // 15:00: the first branch is closed, the second one is open, so the car is offered...
    const listed = await search()
    assert.include(
      listed.body().data.map((item: { id: number }) => item.id),
      ids.vehicleId
    )
    // ...and the quote and the booking go through the open branch instead of failing.
    const quoted = await quote()
    quoted.assertStatus(200)
    assert.equal(quoted.body().data.pickup_location.branch.id, Number(second))
    const booked = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', user.token)
      .header('Idempotency-Key', 'two-branch-01')
      .json({ vehicle_id: ids.vehicleId, pickup_location_id: ids.airport, ...range })
    booked.assertStatus(201)

    // When every branch at the place is closed, the car is hidden and the quote says why.
    await db.from('rental_locations').where('id', second).update({ hours_enabled: true })
    const hidden = await search()
    assert.notInclude(
      hidden.body().data.map((item: { id: number }) => item.id),
      ids.vehicleId
    )
    const refused = await quote()
    refused.assertStatus(422)
    assert.equal(refused.body().error.code, 'BRANCH_CLOSED')
  })

  test('MyFatoorah payment confirms the booking once and notifies the customer', async ({
    client,
    assert,
  }) => {
    const ids = await catalog()
    const user = await customer()
    const created = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', user.token)
      .header('Idempotency-Key', 'pay-key-0001')
      .json({
        vehicle_id: ids.vehicleId,
        pickup_location_id: ids.airport,
        return_location_id: ids.airport,
        ...period(),
      })
    const id = created.body().data.id

    const methods = await client
      .get(`/api/v2/customer/me/rental-bookings/${id}/payment-methods`)
      .header('Authorization', user.token)
    methods.assertStatus(200)
    assert.equal(methods.body().data[0].code, 'kn')

    const started = await client
      .post(`/api/v2/customer/me/rental-bookings/${id}/payment`)
      .header('Authorization', user.token)
      .json({ payment_method_id: 1 })
    started.assertStatus(201)
    const invoiceId = Number(started.body().data.invoice_id)
    assert.match(started.body().data.payment_url, /pay\.test/)

    const pending = await client
      .post(`/api/v2/customer/me/rental-bookings/${id}/payment/verify`)
      .header('Authorization', user.token)
    assert.equal(pending.body().data.status, 'pending_payment')

    gateway.pay(invoiceId)
    const hook = await client
      .post('/api/v2/rentals/payments/webhook')
      .json({ Data: { InvoiceId: invoiceId } })
    hook.assertStatus(200)
    assert.isTrue(hook.body().data.processed)

    const callback = await client
      .get(`/api/v2/rentals/payments/callback?paymentId=PAY-${invoiceId}`)
      .redirects(0)
    assert.include(callback.text(), 'confirmed')

    const detail = await client
      .get(`/api/v2/customer/me/rental-bookings/${id}`)
      .header('Authorization', user.token)
    assert.equal(detail.body().data.status, 'confirmed')
    assert.equal(detail.body().data.payment.status, 'paid')
    assert.isNull(detail.body().data.hold_expires_at)
    const notifications = await db
      .from('customer_notifications')
      .where({ customer_id: user.id, type: 'rental_booking_confirmed' })
    assert.lengthOf(notifications, 1)

    const again = await client
      .post(`/api/v2/customer/me/rental-bookings/${id}/payment`)
      .header('Authorization', user.token)
      .json({ payment_method_id: 1 })
    again.assertStatus(409)
    const unknownHook = await client
      .post('/api/v2/rentals/payments/webhook')
      .json({ Data: { InvoiceId: 999999 } })
    assert.isFalse(unknownHook.body().data.processed)
  })

  test('a late payment for a car that was taken meanwhile needs a refund', async ({
    client,
    assert,
  }) => {
    const ids = await catalog()
    const a = await customer()
    const b = await customer()
    const body = { vehicle_id: ids.vehicleId, pickup_location_id: ids.airport, ...period() }
    const first = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', a.token)
      .header('Idempotency-Key', 'late-key-0001')
      .json(body)
    const id = first.body().data.id
    const started = await client
      .post(`/api/v2/customer/me/rental-bookings/${id}/payment`)
      .header('Authorization', a.token)
      .json({ payment_method_id: 1 })
    await db
      .from('rental_bookings')
      .where('id', id)
      .update({ hold_expires_at: new Date(Date.now() - 1000) })
    const rebooked = await client
      .post('/api/v2/customer/me/rental-bookings')
      .header('Authorization', b.token)
      .header('Idempotency-Key', 'late-key-0002')
      .json(body)
    rebooked.assertStatus(201)
    gateway.pay(Number(started.body().data.invoice_id))
    const verified = await client
      .post(`/api/v2/customer/me/rental-bookings/${id}/payment/verify`)
      .header('Authorization', a.token)
    assert.equal(verified.body().data.status, 'refund_required')
  })

  test('a refund MyFatoorah turns down shows their reason and changes nothing', async ({
    client,
    assert,
  }) => {
    const ids = await catalog()
    const user = await customer()
    const id = await confirmedBooking(client, user, ids, 'refund-key-01')
    gateway.refuseRefunds = 'Insufficient balance for vendor'
    await assert.rejects(
      () => refundBooking(id, 1, ''),
      'MyFatoorah refused the refund: Insufficient balance for vendor. Nothing was changed.'
    )
    const booking = await db.from('rental_bookings').where('id', id).firstOrFail()
    assert.equal(booking.status, 'confirmed')
    const payment = await db.from('rental_payments').where('booking_id', id).firstOrFail()
    assert.equal(payment.status, 'paid')
    assert.lengthOf(gateway.refunds, 0)
  })

  test('customers can cancel only before the cut-off', async ({ client, assert }) => {
    const ids = await catalog({ quantity: 2 })
    const user = await customer()
    const make = (key: string, startDays: number) =>
      client
        .post('/api/v2/customer/me/rental-bookings')
        .header('Authorization', user.token)
        .header('Idempotency-Key', key)
        .json({
          vehicle_id: ids.vehicleId,
          pickup_location_id: ids.airport,
          ...period(startDays, 1),
        })
    const earlyResponse = await make('cancel-key-1', 5)
    const lateResponse = await make('cancel-key-2', 0.5)
    const early = earlyResponse.body().data
    const late = lateResponse.body().data
    await db
      .from('rental_bookings')
      .whereIn('id', [early.id, late.id])
      .update({ status: 'confirmed', hold_expires_at: null })
    const ok = await client
      .post(`/api/v2/customer/me/rental-bookings/${early.id}/cancel`)
      .header('Authorization', user.token)
      .json({ reason: 'Plans changed' })
    ok.assertStatus(200)
    assert.equal(ok.body().data.status, 'cancelled')
    const tooLate = await client
      .post(`/api/v2/customer/me/rental-bookings/${late.id}/cancel`)
      .header('Authorization', user.token)
      .json({})
    tooLate.assertStatus(409)
    assert.equal(tooLate.body().error.code, 'CANCELLATION_WINDOW_CLOSED')
  })
})

test.group('Rentals CMS', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('staff can open every rental screen and manage the catalogue', async ({
    client,
    assert,
  }) => {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'test@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const tokens = await loginAdmin('test@example.com', 'a-very-long-test-password')
    const ids = await catalog()
    const get = (path: string) =>
      client
        .get(path)
        .cookie('admin_access', tokens.accessToken)
        .cookie('admin_refresh', tokens.refreshToken)
    for (const path of [
      '/admin/rentals/bookings',
      '/admin/rentals/vehicles',
      '/admin/rentals/vehicles/new',
      `/admin/rentals/vehicles/${ids.vehicleId}/edit`,
      '/admin/rentals/providers',
      '/admin/rentals/providers/new',
      `/admin/rentals/providers/${ids.providerId}/edit`,
      `/admin/rentals/locations/new?providerId=${ids.providerId}`,
      `/admin/rentals/locations/${ids.airportBranch}/edit`,
      `/admin/rentals/locations/${ids.airportBranch}/hours`,
      '/admin/rentals/locations',
      `/admin/rentals/locations?provider=${ids.providerId}`,
      '/admin/rentals/locations/new',
      '/admin/rentals/working-hours',
      '/admin/rentals/places',
      '/admin/rentals/places/new',
      `/admin/rentals/places/${ids.airport}/edit`,
      '/admin/rentals/settings',
      '/admin/rentals/reviews',
    ]) {
      const page = await get(path)
      assert.equal(page.status(), 200, path)
    }

    const post = (path: string) =>
      client
        .post(path)
        .redirects(0)
        .withCsrfToken()
        .cookie('admin_access', tokens.accessToken)
        .cookie('admin_refresh', tokens.refreshToken)

    const saved = await post('/admin/rentals/vehicles')
      .field('providerId', String(ids.providerId))
      .field('nameEn', 'Nissan Patrol')
      .field('make', 'Nissan')
      .field('model', 'Patrol')
      .field('vehicleType', 'suv')
      .field('transmission', 'automatic')
      .field('fuelType', 'petrol')
      .field('seats', '7')
      .field('dailyRate', '25')
      .field('extraKmRate', '0.150')
      .field(
        'termsJson',
        JSON.stringify([{ labelEn: '25+ age', labelAr: 'العمر 25+' }, { labelEn: 'No smoking' }])
      )
      .field('quantity', '2')
      .field('locationIds', String(ids.cityBranch))
    assert.match(saved.header('location') ?? '', /^\/admin\/rentals\/vehicles\/\d+\/edit$/)
    const vehicle = await db.from('rental_vehicles').where('name_en', 'Nissan Patrol').firstOrFail()
    assert.equal(vehicle.status, 'draft')
    assert.equal(kwd(toFils(vehicle.daily_rate)), '25.000')
    const savedTerms = await db
      .from('rental_vehicle_terms')
      .where('vehicle_id', vehicle.id)
      .orderBy('sort_order')
    assert.deepEqual(
      savedTerms.map((term) => [term.label_en, term.label_ar]),
      [
        ['25+ age', 'العمر 25+'],
        ['No smoking', null],
      ]
    )
    assert.isNull(vehicle.extra_km_rate)

    const [first] = await db.table('rental_vehicle_images').insert({
      vehicle_id: vehicle.id,
      storage_key: `${randomUUID()}.webp`,
      sort_order: 1,
      created_at: new Date(),
    })
    const [second] = await db.table('rental_vehicle_images').insert({
      vehicle_id: vehicle.id,
      storage_key: `${randomUUID()}.webp`,
      sort_order: 2,
      created_at: new Date(),
    })
    const [third] = await db.table('rental_vehicle_images').insert({
      vehicle_id: vehicle.id,
      storage_key: `${randomUUID()}.webp`,
      sort_order: 3,
      created_at: new Date(),
    })
    const resaved = await post(`/admin/rentals/vehicles/${vehicle.id}/save`)
      .field('providerId', String(ids.providerId))
      .field('nameEn', 'Nissan Patrol')
      .field('make', 'Nissan')
      .field('model', 'Patrol')
      .field('vehicleType', 'suv')
      .field('transmission', 'automatic')
      .field('fuelType', 'petrol')
      .field('seats', '7')
      .field('dailyRate', '25')
      .field('quantity', '2')
      .field('locationIds', String(ids.cityBranch))
      .field('gallery[0][id]', String(first))
      .field('gallery[0][remove]', 'on')
      .field('gallery[0][sortOrder]', '1')
      .field('gallery[1][id]', String(second))
      .field('gallery[1][remove]', '')
      .field('gallery[1][sortOrder]', '3')
      .field('gallery[2][id]', String(third))
      .field('gallery[2][remove]', '')
      .field('gallery[2][sortOrder]', '2')
    assert.equal(resaved.status(), 302)
    const gallery = await db
      .from('rental_vehicle_images')
      .where('vehicle_id', vehicle.id)
      .orderBy('sort_order')
    assert.deepEqual(
      gallery.map((image) => Number(image.id)),
      [Number(third), Number(second)]
    )

    const published = await post(`/admin/rentals/vehicles/${vehicle.id}/status`).form({
      status: 'published',
    })
    assert.equal(published.status(), 302)
    const publishedRow = await db.from('rental_vehicles').where('id', vehicle.id).firstOrFail()
    assert.equal(publishedRow.status, 'published')

    const missingRate = await post('/admin/rentals/vehicles')
      .field('providerId', String(ids.providerId))
      .field('nameEn', 'Broken')
      .field('make', 'X')
      .field('model', 'Y')
      .field('vehicleType', 'sedan')
      .field('transmission', 'manual')
      .field('seats', '4')
      .field('dailyRate', 'abc')
      .field('locationIds', String(ids.cityBranch))
    assert.equal(missingRate.header('location'), '/admin/rentals/vehicles/new')

    // The edit forms post Ant Design values as JSON.
    const shifts = { mode: 'shifts', shifts: [{ opens: '09:00', closes: '21:00' }] }
    const jsonLocation = await post('/admin/rentals/locations').json({
      providerId: ids.providerId,
      placeId: ids.city,
      nameEn: 'Jahra',
      nameAr: '',
      address: '',
      latitude: '29.3375',
      longitude: '',
      phone: '+96522334455',
      active: true,
      sortOrder: 4,
    })
    const jahra = await db.from('rental_locations').where('name_en', 'Jahra').firstOrFail()
    // A new branch goes straight to its working-hours page.
    assert.equal(jsonLocation.header('location'), `/admin/rentals/locations/${jahra.id}/hours`)
    // Closed days may still carry leftover shift values from the form; they must not fail.
    const closedDays = await post(`/admin/rentals/locations/${jahra.id}/hours`).json({
      hoursEnabled: true,
      schedule: [
        { mode: 'closed', shifts: [{ opens: '', closes: '' }] },
        { mode: 'closed', shifts: [{ opens: '09:00', closes: '21:00' }] },
        shifts,
        shifts,
        shifts,
        { mode: 'closed' },
        { mode: 'open24', shifts: [{ opens: '', closes: '' }] },
      ],
      closures: [],
    })
    assert.equal(
      closedDays.header('location'),
      `/admin/rentals/working-hours?provider=${ids.providerId}`
    )
    const savedHours = await post(`/admin/rentals/locations/${jahra.id}/hours`).json({
      hoursEnabled: true,
      schedule: [
        { mode: 'open24', shifts: [] },
        shifts,
        shifts,
        shifts,
        shifts,
        { mode: 'closed', shifts: [] },
        {
          mode: 'shifts',
          shifts: [
            { opens: '16:00', closes: '22:00' },
            { opens: '09:00', closes: '13:00' },
          ],
        },
      ],
      closures: [{ range: ['2026-12-01', '2026-12-02'], reason: 'National Day' }],
    })
    assert.equal(
      savedHours.header('location'),
      `/admin/rentals/working-hours?provider=${ids.providerId}`
    )
    assert.isNull(jahra.longitude)
    assert.isTrue(Boolean(jahra.active))
    assert.equal(Number(jahra.provider_id), ids.providerId)
    assert.equal(Number(jahra.place_id), ids.city)

    const newPlace = await post('/admin/rentals/places').json({
      nameEn: 'The Avenues',
      nameAr: 'الأفنيوز',
      subtitleEn: 'Al Rai · Sheikh Zayed Road',
      subtitleAr: '',
      latitude: '29.3030',
      longitude: '47.9370',
      active: true,
      sortOrder: 5,
    })
    assert.equal(newPlace.header('location'), '/admin/rentals/places')
    const avenues = await db.from('rental_places').where('name_en', 'The Avenues').firstOrFail()
    assert.equal(avenues.subtitle_en, 'Al Rai · Sheikh Zayed Road')
    const inUse = await post(`/admin/rentals/places/${ids.city}/delete`).form({})
    assert.equal(inUse.status(), 302)
    assert.isNotNull(await db.from('rental_places').where('id', ids.city).first())
    const jahraHours = await db.from('rental_location_hours').where('location_id', jahra.id)
    assert.lengthOf(jahraHours, 7)
    const closures = await db.from('rental_location_closures').where('location_id', jahra.id)
    assert.lengthOf(closures, 1)
    const overlapping = await post(`/admin/rentals/locations/${jahra.id}/hours`).json({
      hoursEnabled: true,
      schedule: Array.from({ length: 7 }, () => ({
        mode: 'shifts',
        shifts: [
          { opens: '09:00', closes: '14:00' },
          { opens: '13:00', closes: '18:00' },
        ],
      })),
      closures: [],
    })
    assert.equal(overlapping.header('location'), `/admin/rentals/locations/${jahra.id}/hours`)
    assert.lengthOf(await db.from('rental_location_hours').where('location_id', jahra.id), 7)
    const newType = await client
      .post('/admin/rentals/vehicle-types')
      .withCsrfToken()
      .cookie('admin_access', tokens.accessToken)
      .cookie('admin_refresh', tokens.refreshToken)
      .header('Accept', 'application/json')
      .json({ nameEn: 'Electric SUV', nameAr: 'دفع رباعي كهربائي' })
    newType.assertStatus(200)
    assert.deepEqual(newType.body().data, { value: 'electric_suv', label: 'Electric SUV' })
    const options = await client.get('/api/v2/rentals/options').header('Accept-Language', 'ar')
    assert.include(
      options.body().data.vehicle_types.map((type: { label: string }) => type.label),
      'دفع رباعي كهربائي'
    )
    const sameType = await client
      .post('/admin/rentals/vehicle-types')
      .withCsrfToken()
      .cookie('admin_access', tokens.accessToken)
      .cookie('admin_refresh', tokens.refreshToken)
      .header('Accept', 'application/json')
      .json({ nameEn: 'electric suv' })
    assert.equal(sameType.body().data.value, 'electric_suv')

    const newInsurance = await client
      .post('/admin/rentals/insurance-options')
      .withCsrfToken()
      .cookie('admin_access', tokens.accessToken)
      .cookie('admin_refresh', tokens.refreshToken)
      .header('Accept', 'application/json')
      .json({ nameEn: 'Gold cover', nameAr: 'تغطية ذهبية' })
    newInsurance.assertStatus(200)
    await db
      .from('rental_vehicles')
      .where('id', ids.vehicleId)
      .update({ insurance_option_id: Number(newInsurance.body().data.value) })
    const insured = await client
      .get(`/api/v2/rentals/vehicles/${ids.vehicleId}`)
      .header('Accept-Language', 'ar')
    assert.equal(insured.body().data.insurance, 'تغطية ذهبية')

    await post('/admin/rentals/settings').form({
      bookingFee: '4.250',
      holdMinutes: '20',
      minLeadMinutes: '60',
      maxRentalDays: '14',
      cancellationCutoffHours: '12',
    })
    const settings = await db.from('rental_settings').where('id', 1).firstOrFail()
    assert.equal(kwd(toFils(settings.booking_fee)), '4.250')
    assert.equal(Number(settings.hold_minutes), 20)
  })
})

test.group('Rental provider portal', (group) => {
  let mailer: FakeMailer
  let restoreMailer: () => void
  group.each.setup(async () => {
    const truncate = await testUtils.db().truncate()
    await limiter.clear()
    mailer = new FakeMailer()
    restoreMailer = swapRentalMailer(mailer)
    return async () => {
      restoreMailer()
      await truncate()
    }
  })

  const statusOf = async (request: PromiseLike<{ status(): number }>) => {
    const response = await request
    return response.status()
  }
  const column = async (table: string, id: number, name: string) => {
    const row = await db.from(table).where('id', id).firstOrFail()
    return row[name]
  }

  const page = (response: { text(): string }) => {
    const match = response
      .text()
      .match(/<script data-page="[^"]+" type="application\/json">([^<]+)<\/script>/)
    if (!match) throw new Error('Expected an Inertia page')
    return JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&')) as {
      component: string
      props: Record<string, any>
    }
  }

  async function staff() {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'staff@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    return loginAdmin('staff@example.com', 'a-very-long-test-password')
  }

  async function booking(
    ids: Awaited<ReturnType<typeof catalog>>,
    values: {
      pickupInDays: number
      days: number
      status: string
      confirmed?: boolean
      withDriver?: boolean
      buyer?: { id: number }
    }
  ) {
    const buyer = values.buyer ?? (await customer())
    const pickup = new Date(Date.now() + values.pickupInDays * DAY)
    const snapshot = {
      vehicle: { name_en: 'Toyota Camry', make: 'Toyota', model: 'Camry' },
      provider: { name_en: 'Gulf Rent', phone_e164: '+96522223333', email: null },
      pickup_location: { id: ids.airport, name_en: 'Kuwait Airport' },
      return_location: { id: ids.airport, name_en: 'Kuwait Airport' },
    }
    const [id] = await db.table('rental_bookings').insert({
      reference: `KR-${randomInt(100000, 999999)}`,
      customer_id: buyer.id,
      vehicle_id: ids.vehicleId,
      provider_id: ids.providerId,
      pickup_location_id: ids.airportBranch,
      return_location_id: ids.airportBranch,
      pickup_at: pickup,
      return_at: new Date(pickup.getTime() + values.days * DAY),
      with_driver: Boolean(values.withDriver),
      days: Math.ceil(values.days),
      daily_rate: '12.500',
      driver_daily_rate: '0.000',
      rental_amount: '25.000',
      booking_fee: '2.000',
      currency: 'KWD',
      snapshot: JSON.stringify(snapshot),
      status: values.status,
      idempotency_key: randomUUID(),
      request_hash: randomUUID(),
      confirmed_at: values.confirmed === false ? null : new Date(),
      created_at: new Date(),
    })
    return Number(id)
  }

  async function payment(bookingId: number, status: string, amount = '2.000') {
    const now = new Date()
    await db.table('rental_payments').insert({
      booking_id: bookingId,
      invoice_id: `INV-${randomUUID()}`,
      payment_id: status === 'initiated' ? null : `PAY-${randomUUID()}`,
      payment_method: 'KNET',
      amount,
      status,
      paid_at: status === 'initiated' ? null : now,
      refunded_at: status === 'refunded' ? now : null,
      refund_reference: status === 'refunded' ? 'RF-1' : null,
      created_at: now,
    })
  }

  test('booking fee and bookings reports total correctly and export', async ({
    client,
    assert,
  }) => {
    const admin = await staff()
    const ids = await catalog()
    const paid = await booking(ids, { pickupInDays: 1, days: 2, status: 'confirmed' })
    const done = await booking(ids, { pickupInDays: 2, days: 2, status: 'completed' })
    const refunded = await booking(ids, { pickupInDays: 3, days: 2, status: 'cancelled' })
    // Paid too late, so never confirmed: still a paid order.
    const waiting = await booking(ids, {
      pickupInDays: 4,
      days: 2,
      status: 'refund_required',
      confirmed: false,
    })
    const unpaid = await booking(ids, {
      pickupInDays: 5,
      days: 1,
      status: 'pending_payment',
      confirmed: false,
    })
    // Cancelled by the customer before paying: never a real booking.
    const dropped = await booking(ids, {
      pickupInDays: 5,
      days: 1,
      status: 'cancelled',
      confirmed: false,
    })
    await payment(paid, 'paid')
    await payment(done, 'paid')
    await payment(refunded, 'refunded')
    await payment(waiting, 'paid')
    await payment(unpaid, 'initiated')
    await payment(dropped, 'failed')
    const day = (offset: number) =>
      new Date(Date.now() + offset * DAY + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const range = `from=${day(-2)}&to=${day(10)}`
    const get = (path: string) =>
      client.get(path).cookie('admin_access', admin.accessToken).redirects(0)
    const summary = (response: any) =>
      Object.fromEntries(page(response).props.summary.map((item: any) => [item.label, item.value]))

    // The reports live in the sidebar; the old index opens the first one.
    const index = await get('/admin/rentals/reports')
    assert.equal(index.header('location'), '/admin/rentals/reports/booking-fees')

    // 4 paid payments of 2.000, one of them refunded; the unpaid checkout is not revenue.
    const fees = summary(await get(`/admin/rentals/reports/booking-fees?${range}`))
    assert.equal(fees.Collected, '8.000')
    assert.equal(fees.Refunded, '2.000')
    assert.equal(fees['Net revenue'], '6.000')
    // Failed and unfinished attempts are not money: the report never lists them.
    assert.notProperty(fees, 'Failed or unfinished')
    const feeRows = page(await get(`/admin/rentals/reports/booking-fees?${range}`)).props
    assert.equal(feeRows.meta.total, 4)
    const attempts = page(await get(`/admin/rentals/reports/booking-fees?${range}&status=failed`))
    assert.equal(attempts.props.meta.total, 4)
    const grouped = page(await get(`/admin/rentals/reports/booking-fees?${range}&view=provider`))
    assert.equal(grouped.props.rows.length, 1)
    assert.equal(grouped.props.rows[0].net, '6.000')

    const detail = page(await get(`/admin/rentals/reports/bookings?${range}`))
    assert.equal(detail.props.meta.total, 4)
    // Fees kept match the fee report's net revenue; rental value counts live bookings only.
    const detailSummary = summary(await get(`/admin/rentals/reports/bookings?${range}`))
    assert.equal(detailSummary['Booking fees'], fees['Net revenue'])
    assert.equal(detailSummary['Rental value'], '50.000')
    // Unpaid checkouts never appear, whatever the filter; a paid order that needs a refund does.
    for (const status of ['all', 'pending_payment', 'expired'])
      assert.equal(
        page(await get(`/admin/rentals/reports/bookings?${range}&status=${status}`)).props.meta
          .total,
        4,
        status
      )
    const statusOptions = page(await get(`/admin/rentals/reports/bookings?${range}`))
      .props.filterFields.find((filter: any) => filter.key === 'status')
      .options.map((option: any) => option.value)
    assert.sameMembers(statusOptions, ['confirmed', 'completed', 'cancelled', 'refund_required'])
    // The same totals come out of the customers and provider reports for the same range.
    const customerRows = page(await get(`/admin/rentals/reports/customers?${range}`)).props.rows
    const total = (key: string) =>
      customerRows.reduce((sum: number, row: any) => sum + Number(row[key]), 0).toFixed(3)
    assert.equal(total('rental'), '50.000')
    assert.equal(total('fees'), '6.000')
    const providerTotals = summary(await get(`/admin/rentals/reports/providers?${range}`))
    assert.equal(providerTotals['Rental value'], '50.000')

    // Export: same filters, CSV and Excel, and the export is logged.
    const csv = await get(`/admin/rentals/reports/bookings/export?${range}&format=csv`)
    assert.equal(csv.status(), 200)
    assert.include(csv.header('content-type'), 'text/csv')
    assert.include(csv.header('content-disposition'), 'attachment')
    assert.isTrue(csv.text().startsWith('\uFEFFReference,Status'))
    assert.include(csv.text(), await column('rental_bookings', paid, 'reference'))
    assert.notInclude(csv.text(), await column('rental_bookings', unpaid, 'reference'))
    const xlsx = await get(`/admin/rentals/reports/booking-fees/export?${range}&format=xlsx`)
    assert.equal(xlsx.status(), 200)
    assert.include(xlsx.header('content-type'), 'spreadsheetml')
    assert.isTrue(xlsx.text().startsWith('PK'))
    const logged = await db.from('audit_logs').where('action', 'rental_report.export')
    assert.equal(logged.length, 2)

    // Bad ranges are refused with a message, not a crash.
    const tooLong = await get(`/admin/rentals/reports/bookings?from=${day(-500)}&to=${day(0)}`)
    assert.include(page(tooLong).props.problem, 'one year')
  })

  test('provider and branch performance counts rentals and cancellations', async ({
    client,
    assert,
  }) => {
    const admin = await staff()
    const ids = await catalog()
    const make = (pickupInDays: number, status: string, confirmed = true) =>
      booking(ids, { pickupInDays, days: 2, status, confirmed })
    const fine = await make(1, 'confirmed')
    const done = await make(2, 'completed')
    const cancelled = await make(3, 'cancelled')
    await make(4, 'confirmed') // active, but no payment recorded
    const twice = await make(5, 'confirmed')
    const odd = await make(6, 'confirmed')
    const lapsed = await make(7, 'expired', false)
    await db.from('rental_bookings').where('id', cancelled).update({
      cancelled_by: 'customer',
      cancel_reason: 'Plans changed',
      cancelled_at: new Date(),
    })
    for (const id of [fine, done, cancelled, twice, twice]) await payment(id, 'paid')
    await payment(odd, 'paid', '3.000')
    await payment(lapsed, 'initiated')
    const day = (offset: number) =>
      new Date(Date.now() + offset * DAY + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const range = `from=${day(-2)}&to=${day(10)}`
    const open = async (path: string) =>
      page(await client.get(path).cookie('admin_access', admin.accessToken).redirects(0)).props
    const providers = await open(
      `/admin/rentals/reports/providers?${range}&provider=${ids.providerId}`
    )
    assert.equal(providers.rows.length, 1)
    assert.equal(providers.rows[0].rentals, '5')
    assert.equal(providers.rows[0].cancelled, '1')
    assert.equal(providers.rows[0].cancel_rate, '16.7%')
    const branches = await open(`/admin/rentals/reports/providers?${range}&view=branch`)
    const airport = branches.rows.find((row: any) => row.pickups === '5')
    assert.exists(airport)

    const xlsx = await client
      .get(`/admin/rentals/reports/providers/export?${range}&format=xlsx&view=branch`)
      .cookie('admin_access', admin.accessToken)
    assert.equal(xlsx.status(), 200)
    // The removed reports are gone.
    for (const key of [
      'refunds',
      'provider-statement',
      'reconciliation',
      'funnel',
      'vehicles',
      'drivers',
    ]) {
      const gone = await client
        .get(`/admin/rentals/reports/${key}`)
        .cookie('admin_access', admin.accessToken)
        .redirects(0)
      assert.equal(gone.header('location'), '/admin/rentals/reports/booking-fees')
    }
  })

  test('customers report tells new from returning customers and finds cancellers', async ({
    client,
    assert,
  }) => {
    const admin = await staff()
    const ids = await catalog()
    const loyal = await customer()
    const first = await customer()
    // An old booking makes `loyal` a returning customer.
    const old = await booking(ids, {
      pickupInDays: -60,
      days: 1,
      status: 'completed',
      buyer: loyal,
    })
    await db
      .from('rental_bookings')
      .where('id', old)
      .update({ created_at: new Date(Date.now() - 61 * DAY) })
    await booking(ids, { pickupInDays: 1, days: 2, status: 'confirmed', buyer: loyal })
    await booking(ids, { pickupInDays: 2, days: 2, status: 'confirmed', buyer: first })
    await booking(ids, { pickupInDays: 3, days: 2, status: 'cancelled', buyer: first })
    await booking(ids, { pickupInDays: 4, days: 2, status: 'cancelled', buyer: first })

    const day = (offset: number) =>
      new Date(Date.now() + offset * DAY + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const range = `from=${day(-2)}&to=${day(10)}`
    const get = (path: string) => client.get(path).cookie('admin_access', admin.accessToken)
    const open = async (path: string) => page(await get(path)).props
    const summary = (props: any) =>
      Object.fromEntries(props.summary.map((item: any) => [item.label, item.value]))

    const customers = await open(
      `/admin/rentals/reports/customers?${range}&provider=${ids.providerId}`
    )
    const loyalRow = customers.rows.find((row: any) => row.type === 'Returning')
    assert.equal(loyalRow.lifetime, '2')
    assert.equal(summary(customers).Returning, '1')
    const cancellers = await open(`/admin/rentals/reports/customers?${range}&view=cancellers`)
    assert.equal(cancellers.rows.length, 1)
    assert.equal(cancellers.rows[0].cancelled, '2')
    assert.equal(cancellers.rows[0].cancel_rate, '66.7%')
  })

  test('report exports keep text cells from running as spreadsheet formulas', async ({
    assert,
  }) => {
    const { toCsv } = await import('../../app/services/rental_report_export.js')
    const csv = toCsv({
      columns: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'money' },
      ],
      rows: [{ name: '=HYPERLINK("http://x")', amount: -1500 }],
      summary: [],
    })
    assert.include(csv, `"'=HYPERLINK(""http://x"")"`)
    assert.include(csv, '-1.500')
  })

  test('providers cannot open the reports', async ({ client, assert }) => {
    const ids = await catalog()
    await db.table('users').insert({
      full_name: 'Gulf desk',
      email: 'desk@gulfrent.example',
      password: await hash.make('provider-long-password'),
      role: 'provider',
      rental_provider_id: ids.providerId,
      password_set_at: new Date(),
      active: true,
      created_at: new Date(),
    })
    const { loginAdmin: signIn } = await import('../../app/services/auth_service.js')
    const tokens = await signIn('desk@gulfrent.example', 'provider-long-password', {
      allowProvider: true,
    })
    for (const path of [
      '/admin/rentals/reports',
      '/admin/rentals/reports/booking-fees',
      '/admin/rentals/reports/bookings/export?format=csv',
    ]) {
      const response = await client
        .get(path)
        .redirects(0)
        .cookie('admin_access', tokens.accessToken)
      assert.equal(response.status(), 403, path)
    }
  })

  test('the staff bookings list leaves out unpaid checkouts unless asked', async ({
    client,
    assert,
  }) => {
    const admin = await staff()
    const ids = await catalog()
    const paid = await booking(ids, { pickupInDays: 2, days: 2, status: 'confirmed' })
    const held = await booking(ids, {
      pickupInDays: 3,
      days: 1,
      status: 'pending_payment',
      confirmed: false,
    })
    const lapsed = await booking(ids, {
      pickupInDays: 3,
      days: 1,
      status: 'expired',
      confirmed: false,
    })
    const listed = async (query: string) => {
      const response = await client
        .get(`/admin/rentals/bookings${query}`)
        .cookie('admin_access', admin.accessToken)
      return page(response).props.rows.map((row: any) => row.id)
    }
    assert.deepEqual(await listed(''), [paid])
    assert.deepEqual(await listed('?status=pending_payment'), [held])
    assert.sameMembers(await listed('?status=all'), [paid, held, lapsed])
    const reference = await column('rental_bookings', held, 'reference')
    assert.deepEqual(await listed(`?q=${reference}`), [held])
  })

  test('recommended puts well-rated cars first, then cars with a photo, then the cheaper', async ({
    client,
    assert,
  }) => {
    const ids = await catalog()
    const base = await db.from('rental_vehicles').where('id', ids.vehicleId).firstOrFail()
    const copy = async (name: string, rate: string, cover: string | null) => {
      const rest: Record<string, unknown> = { ...base }
      delete rest.id
      const [id] = await db.table('rental_vehicles').insert({
        ...rest,
        name_en: name,
        daily_rate: rate,
        cover_image_key: cover,
        created_at: new Date(),
      })
      return Number(id)
    }
    const cheap = await copy('Cheap, no photo', '5.000', null)
    const pictured = await copy('With a photo', '9.000', 'vehicles/pictured.webp')
    // The Camry (12.500) has three 5-star reviews, and one hidden 1-star review that doesn't count.
    for (const rating of [5, 5, 5, 1]) {
      const done = await booking(ids, { pickupInDays: -5, days: 1, status: 'completed' })
      const row = await db.from('rental_bookings').where('id', done).firstOrFail()
      await db.table('rental_reviews').insert({
        booking_id: done,
        customer_id: row.customer_id,
        vehicle_id: ids.vehicleId,
        provider_id: ids.providerId,
        rating,
        status: rating === 1 ? 'hidden' : 'published',
        created_at: new Date(),
      })
    }
    const order = async (sort?: string) => {
      const response = await client.get('/api/v2/rentals/vehicles').qs(sort ? { sort } : {})
      response.assertStatus(200)
      return response.body().data.map((card: { id: number }) => card.id)
    }
    assert.deepEqual(await order(), [ids.vehicleId, pictured, cheap])
    assert.deepEqual(await order('recommended'), [ids.vehicleId, pictured, cheap])
    assert.deepEqual(await order('price_asc'), [cheap, pictured, ids.vehicleId])
  })

  test('staff invite a provider, who sets a password and signs in', async ({ client, assert }) => {
    const admin = await staff()
    const ids = await catalog()
    const created = await client
      .post(`/admin/rentals/providers/${ids.providerId}/login`)
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .form({ name: 'Gulf Rent desk', email: 'Desk@GulfRent.example' })
    assert.equal(created.header('location'), `/admin/rentals/providers/${ids.providerId}/edit`)
    const user = await db.from('users').where('email', 'desk@gulfrent.example').firstOrFail()
    assert.equal(user.role, 'provider')
    assert.equal(Number(user.rental_provider_id), ids.providerId)
    assert.lengthOf(mailer.sent, 1)
    assert.equal(mailer.sent[0].to, 'desk@gulfrent.example')
    const link = mailer.sent[0].text.match(/https?:\/\/\S+reset-password\?token=([A-Za-z0-9_-]+)/)
    assert.isNotNull(link)
    const token = link![1]

    // One login per provider.
    await client
      .post(`/admin/rentals/providers/${ids.providerId}/login`)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .form({ name: 'Second', email: 'second@gulfrent.example' })
    assert.isNull(await db.from('users').where('email', 'second@gulfrent.example').first())

    const editPage = page(
      await client
        .get(`/admin/rentals/providers/${ids.providerId}/edit`)
        .cookie('admin_access', admin.accessToken)
    )
    assert.equal(editPage.props.login.state, 'invited')

    // The invite opens a "set your password" page and sets the first password.
    const setPage = page(await client.get(`/admin/reset-password?token=${token}`))
    assert.isTrue(setPage.props.invite)
    const saved = await client.post('/admin/reset-password').redirects(0).withCsrfToken().form({
      token,
      newPassword: 'provider-long-password',
      confirmPassword: 'provider-long-password',
    })
    assert.equal(saved.header('location'), '/admin/login')
    assert.isNotNull(await column('users', user.id, 'password_set_at'))

    // The CMS login page signs providers in; the staff JSON API does not.
    const signedIn = await client
      .post('/admin/login')
      .redirects(0)
      .withCsrfToken()
      .form({ email: 'desk@gulfrent.example', password: 'provider-long-password' })
    assert.equal(signedIn.header('location'), '/admin')
    const api = await client
      .post('/api/v1/admin/auth/login')
      .json({ email: 'desk@gulfrent.example', password: 'provider-long-password' })
    assert.equal(api.status(), 401)

    const listPage = page(
      await client.get('/admin/rentals/providers').cookie('admin_access', admin.accessToken)
    )
    assert.equal(
      listPage.props.rows.find((row: any) => row.id === ids.providerId).login_state,
      'active'
    )
  })

  test('a provider only sees and changes its own rental business', async ({ client, assert }) => {
    const ids = await catalog()
    const other = await catalog({ name_en: 'Other Patrol' })
    await db.from('rental_providers').where('id', other.providerId).update({ name_en: 'Other Co' })
    await db.table('users').insert({
      full_name: 'Gulf desk',
      email: 'desk@gulfrent.example',
      password: await hash.make('provider-long-password'),
      role: 'provider',
      rental_provider_id: ids.providerId,
      password_set_at: new Date(),
      active: true,
      created_at: new Date(),
    })
    const { loginAdmin: signIn } = await import('../../app/services/auth_service.js')
    const tokens = await signIn('desk@gulfrent.example', 'provider-long-password', {
      allowProvider: true,
    })
    const get = (path: string) => client.get(path).cookie('admin_access', tokens.accessToken)
    const post = (path: string) =>
      client.post(path).redirects(0).withCsrfToken().cookie('admin_access', tokens.accessToken)

    const ownDone = await booking(ids, { pickupInDays: -3, days: 1, status: 'confirmed' })
    const ownUpcoming = await booking(ids, { pickupInDays: 2, days: 2, status: 'confirmed' })
    await booking(ids, { pickupInDays: 4, days: 1, status: 'pending_payment', confirmed: false })
    const othersBooking = await booking(other, { pickupInDays: -3, days: 1, status: 'confirmed' })

    const home = page(await get('/admin'))
    assert.equal(home.component, 'rentals/provider_dashboard')
    assert.equal(home.props.auth.provider.id, ids.providerId)
    assert.equal(home.props.stats.toComplete, 1)
    assert.deepEqual(
      home.props.upcoming.map((row: any) => row.id),
      [ownUpcoming]
    )

    for (const path of [
      '/admin/rentals/bookings',
      `/admin/rentals/bookings/${ownDone}`,
      '/admin/rentals/vehicles',
      '/admin/rentals/vehicles/new',
      `/admin/rentals/vehicles/${ids.vehicleId}/edit`,
      '/admin/rentals/locations',
      '/admin/rentals/locations/new',
      `/admin/rentals/locations/${ids.airportBranch}/edit`,
      `/admin/rentals/locations/${ids.airportBranch}/hours`,
      '/admin/rentals/working-hours',
      '/admin/account',
    ])
      assert.equal(await statusOf(get(path)), 200, path)

    const vehicles = page(await get(`/admin/rentals/vehicles?provider=${other.providerId}`))
    assert.deepEqual(
      vehicles.props.rows.map((row: any) => row.id),
      [ids.vehicleId]
    )
    const bookings = page(await get('/admin/rentals/bookings'))
    assert.sameMembers(
      bookings.props.rows.map((row: any) => row.id),
      [ownDone, ownUpcoming]
    )
    const detail = page(await get(`/admin/rentals/bookings/${ownDone}`))
    assert.deepEqual(detail.props.payments, [])
    const branches = page(await get(`/admin/rentals/locations?provider=${other.providerId}`))
    assert.sameMembers(
      branches.props.rows.map((row: any) => row.id),
      [ids.airportBranch, ids.cityBranch]
    )
    const form = page(await get('/admin/rentals/vehicles/new'))
    assert.deepEqual(
      form.props.options.providers.map((row: any) => row.id),
      [ids.providerId]
    )

    // Another provider's records answer 404.
    for (const path of [
      `/admin/rentals/vehicles/${other.vehicleId}/edit`,
      `/admin/rentals/locations/${other.airportBranch}/edit`,
      `/admin/rentals/locations/${other.airportBranch}/hours`,
      `/admin/rentals/bookings/${othersBooking}`,
    ])
      assert.equal(await statusOf(get(path)), 404, path)
    assert.equal(
      await statusOf(
        post(`/admin/rentals/vehicles/${other.vehicleId}/status`).form({ status: 'draft' })
      ),
      404
    )
    assert.equal(
      await statusOf(post(`/admin/rentals/locations/${other.airportBranch}/delete`)),
      404
    )
    assert.equal(await statusOf(post(`/admin/rentals/bookings/${othersBooking}/complete`)), 404)
    assert.equal(await column('rental_vehicles', other.vehicleId, 'status'), 'published')

    // Staff-only screens and actions are closed.
    for (const path of [
      '/admin/rentals/providers',
      `/admin/rentals/providers/${ids.providerId}/edit`,
      '/admin/rentals/places',
      '/admin/rentals/settings',
      '/admin/rentals/reviews',
      '/admin/places',
      '/admin/users',
      '/admin/customers',
    ])
      assert.equal(await statusOf(get(path)), 403, path)
    assert.equal(await statusOf(post(`/admin/rentals/bookings/${ownUpcoming}/cancel`)), 403)
    assert.equal(
      await statusOf(
        post('/admin/rentals/vehicle-types')
          .header('Accept', 'application/json')
          .json({ nameEn: 'Limo' })
      ),
      403
    )
    assert.equal(
      await statusOf(client.get('/api/v1/admin/auth/me').bearerToken(tokens.accessToken)),
      403
    )

    // New records always belong to the provider, whatever the form says.
    if (!(await db.from('rental_vehicle_types').where('code', 'sedan').first()))
      await db
        .table('rental_vehicle_types')
        .insert({ code: 'sedan', name_en: 'Sedan', sort_order: 1, created_at: new Date() })
    const savedVehicle = await post('/admin/rentals/vehicles')
      .field('providerId', String(other.providerId))
      .field('nameEn', 'Kia Pegas')
      .field('make', 'Kia')
      .field('model', 'Pegas')
      .field('vehicleType', 'sedan')
      .field('transmission', 'automatic')
      .field('fuelType', 'petrol')
      .field('seats', '5')
      .field('dailyRate', '9')
      .field('quantity', '1')
      .field('locationIds', String(ids.cityBranch))
    assert.match(savedVehicle.header('location') ?? '', /^\/admin\/rentals\/vehicles\/\d+\/edit$/)
    const kia = await db.from('rental_vehicles').where('name_en', 'Kia Pegas').firstOrFail()
    assert.equal(Number(kia.provider_id), ids.providerId)
    await post('/admin/rentals/locations').json({
      providerId: other.providerId,
      placeId: ids.city,
      nameEn: 'Salmiya counter',
      active: true,
      sortOrder: 3,
    })
    const branch = await db
      .from('rental_locations')
      .where('name_en', 'Salmiya counter')
      .firstOrFail()
    assert.equal(Number(branch.provider_id), ids.providerId)

    // Bookings: mark a finished rental as completed.
    const completed = await post(`/admin/rentals/bookings/${ownDone}/complete`).form({
      returnTo: '/admin',
    })
    assert.equal(completed.header('location'), '/admin')
    assert.equal(await column('rental_bookings', ownDone, 'status'), 'completed')

    // Only own images.
    await db
      .from('rental_vehicles')
      .where('id', other.vehicleId)
      .update({
        cover_image_key: `${randomUUID()}.webp`,
      })
    const otherImage = await db.from('rental_vehicles').where('id', other.vehicleId).first()
    assert.equal(await statusOf(get(`/admin/images/${otherImage.cover_image_key}`)), 404)
  })

  async function providerLogin(providerId: number) {
    await db.table('users').insert({
      full_name: 'Provider desk',
      email: `desk-${providerId}@provider.example`,
      password: await hash.make('provider-long-password'),
      role: 'provider',
      rental_provider_id: providerId,
      password_set_at: new Date(),
      active: true,
      created_at: new Date(),
    })
    const { loginAdmin: signIn } = await import('../../app/services/auth_service.js')
    return signIn(`desk-${providerId}@provider.example`, 'provider-long-password', {
      allowProvider: true,
    })
  }

  const tinyPng = async () => {
    const { default: sharp } = await import('sharp')
    return sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer()
  }

  test('providers and staff keep legal documents', async ({ client, assert }) => {
    const admin = await staff()
    const ids = await catalog()
    const other = await catalog()
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')
    const uploaded = await client
      .post('/admin/rentals/documents')
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .field('providerId', String(ids.providerId))
      .field('label', 'Trade licence')
      .file('file', pdf, { filename: 'licence.pdf', contentType: 'application/pdf' })
    assert.equal(uploaded.header('location'), `/admin/rentals/documents?provider=${ids.providerId}`)
    const document = await db
      .from('rental_provider_documents')
      .where('provider_id', ids.providerId)
      .firstOrFail()
    assert.equal(document.label, 'Trade licence')
    assert.equal(document.mime_type, 'application/pdf')
    assert.match(document.storage_key, /^documents\/[0-9a-f-]{36}\.pdf$/)

    // A text file renamed to .pdf is refused.
    await client
      .post('/admin/rentals/documents')
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .field('providerId', String(ids.providerId))
      .field('label', 'Fake')
      .file('file', Buffer.from('not a pdf'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      })
    assert.isNull(await db.from('rental_provider_documents').where('label', 'Fake').first())

    const opened = await client
      .get(`/admin/rentals/documents/${document.id}/file`)
      .cookie('admin_access', admin.accessToken)
    assert.equal(opened.status(), 200)
    assert.equal(opened.header('content-type'), 'application/pdf')

    // The provider sees its own documents, not another provider's.
    const tokens = await providerLogin(ids.providerId)
    const list = page(
      await client.get('/admin/rentals/documents').cookie('admin_access', tokens.accessToken)
    )
    assert.deepEqual(
      list.props.rows.map((row: any) => row.id),
      [Number(document.id)]
    )
    const othersTokens = await providerLogin(other.providerId)
    assert.equal(
      await statusOf(
        client
          .get(`/admin/rentals/documents/${document.id}/file`)
          .cookie('admin_access', othersTokens.accessToken)
      ),
      404
    )
    assert.equal(
      await statusOf(
        client
          .post(`/admin/rentals/documents/${document.id}/delete`)
          .redirects(0)
          .withCsrfToken()
          .cookie('admin_access', othersTokens.accessToken)
      ),
      404
    )
    const own = await client
      .post('/admin/rentals/documents')
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_access', tokens.accessToken)
      .field('providerId', String(other.providerId))
      .field('label', 'Insurance certificate')
      .file('file', await tinyPng(), {
        filename: 'insurance.png',
        contentType: 'image/png',
      })
    assert.equal(own.header('location'), '/admin/rentals/documents')
    const insurance = await db
      .from('rental_provider_documents')
      .where('label', 'Insurance certificate')
      .firstOrFail()
    assert.equal(Number(insurance.provider_id), ids.providerId)

    await client
      .post(`/admin/rentals/documents/${document.id}/delete`)
      .withCsrfToken()
      .cookie('admin_access', tokens.accessToken)
    assert.isNull(await db.from('rental_provider_documents').where('id', document.id).first())
  })

  test('drivers are assigned to with-driver bookings without overlaps', async ({
    client,
    assert,
  }) => {
    const ids = await catalog()
    const other = await catalog()
    const tokens = await providerLogin(ids.providerId)
    const post = (path: string) =>
      client.post(path).redirects(0).withCsrfToken().cookie('admin_access', tokens.accessToken)

    const created = await post('/admin/rentals/drivers')
      .field('providerId', String(other.providerId))
      .field('name', 'Fahad Al-Azmi')
      .field('phone', '+96555501234')
      .field('active', 'true')
    assert.equal(created.header('location'), '/admin/rentals/drivers')
    const fahad = await db.from('rental_drivers').where('name', 'Fahad Al-Azmi').firstOrFail()
    assert.equal(Number(fahad.provider_id), ids.providerId)
    await post('/admin/rentals/drivers').field('name', 'Salem').field('active', 'true')
    const salem = await db.from('rental_drivers').where('name', 'Salem').firstOrFail()
    const [stranger] = await db.table('rental_drivers').insert({
      provider_id: other.providerId,
      name: 'Other driver',
      active: true,
      created_at: new Date(),
    })

    const buyer = await customer()
    const first = await booking(ids, {
      pickupInDays: 2,
      days: 2,
      status: 'confirmed',
      withDriver: true,
      buyer,
    })
    const overlapping = await booking(ids, {
      pickupInDays: 3,
      days: 2,
      status: 'confirmed',
      withDriver: true,
    })
    const selfDrive = await booking(ids, { pickupInDays: 2, days: 1, status: 'confirmed' })

    const detail = page(
      await client
        .get(`/admin/rentals/bookings/${first}`)
        .cookie('admin_access', tokens.accessToken)
    )
    assert.sameMembers(
      detail.props.driverChoices.map((driver: any) => driver.name),
      ['Fahad Al-Azmi', 'Salem']
    )

    await post(`/admin/rentals/bookings/${first}/driver`).form({ driverId: String(fahad.id) })
    assert.equal(Number(await column('rental_bookings', first, 'driver_id')), Number(fahad.id))
    const notice = await db
      .from('customer_notifications')
      .where('customer_id', buyer.id)
      .where('type', 'rental_driver_assigned')
      .firstOrFail()
    assert.include(notice.body, 'Fahad Al-Azmi')

    // The customer sees the driver in the app.
    const shown = await client
      .get(`/api/v2/customer/me/rental-bookings/${first}`)
      .header('Authorization', buyer.token)
    assert.equal(shown.status(), 200)
    assert.equal(shown.body().data.driver.name, 'Fahad Al-Azmi')
    assert.equal(shown.body().data.driver.phone_e164, '+96555501234')

    // The same driver cannot drive an overlapping booking; another one can.
    await post(`/admin/rentals/bookings/${overlapping}/driver`).form({
      driverId: String(fahad.id),
    })
    assert.isNull(await column('rental_bookings', overlapping, 'driver_id'))
    const busy = page(
      await client
        .get(`/admin/rentals/bookings/${overlapping}`)
        .cookie('admin_access', tokens.accessToken)
    )
    assert.isTrue(busy.props.driverChoices.find((d: any) => d.id === Number(fahad.id)).busy)
    await post(`/admin/rentals/bookings/${overlapping}/driver`).form({
      driverId: String(salem.id),
    })
    assert.equal(
      Number(await column('rental_bookings', overlapping, 'driver_id')),
      Number(salem.id)
    )

    // Not for self-drive bookings, nor with another provider's driver.
    await post(`/admin/rentals/bookings/${selfDrive}/driver`).form({ driverId: String(salem.id) })
    assert.isNull(await column('rental_bookings', selfDrive, 'driver_id'))
    await post(`/admin/rentals/bookings/${first}/driver`).form({ driverId: String(stranger) })
    assert.equal(Number(await column('rental_bookings', first, 'driver_id')), Number(fahad.id))
    assert.equal(
      await statusOf(
        client
          .get(`/admin/rentals/drivers/${stranger}/edit`)
          .cookie('admin_access', tokens.accessToken)
      ),
      404
    )

    // An assigned driver is kept for history: deleting is refused, turning off works.
    await post(`/admin/rentals/drivers/${fahad.id}/delete`)
    assert.isNotNull(await db.from('rental_drivers').where('id', fahad.id).first())
    await post(`/admin/rentals/drivers/${fahad.id}/status`).form({ active: 'false' })
    assert.equal(Boolean(await column('rental_drivers', Number(fahad.id), 'active')), false)

    // Removing the driver from the booking.
    await post(`/admin/rentals/bookings/${overlapping}/driver`).form({ driverId: '' })
    assert.isNull(await column('rental_bookings', overlapping, 'driver_id'))

    const home = page(await client.get('/admin').cookie('admin_access', tokens.accessToken))
    assert.deepEqual(
      home.props.needsDriver.map((row: any) => row.id),
      [overlapping]
    )
  })

  test('a new provider with an email is invited to the portal straight away', async ({
    client,
    assert,
  }) => {
    const admin = await staff()
    const created = await client
      .post('/admin/rentals/providers')
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .form({ nameEn: 'Sunset Cars', email: 'Hello@Sunset.example', active: 'true' })
    assert.equal(created.header('location'), '/admin/rentals/providers')
    const user = await db.from('users').where('email', 'hello@sunset.example').firstOrFail()
    assert.equal(user.role, 'provider')
    assert.equal(user.full_name, 'Sunset Cars')
    assert.lengthOf(mailer.sent, 1)
    assert.equal(mailer.sent[0].to, 'hello@sunset.example')

    // Without an email there is nobody to invite: the provider is created and no login exists.
    await client
      .post('/admin/rentals/providers')
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .form({ nameEn: 'No Email Cars', active: 'true' })
    assert.lengthOf(mailer.sent, 1)
  })

  test('turning a provider login off signs it out', async ({ client, assert }) => {
    const admin = await staff()
    const ids = await catalog()
    await db.table('users').insert({
      full_name: 'Gulf desk',
      email: 'desk@gulfrent.example',
      password: await hash.make('provider-long-password'),
      role: 'provider',
      rental_provider_id: ids.providerId,
      password_set_at: new Date(),
      active: true,
      created_at: new Date(),
    })
    const { loginAdmin: signIn } = await import('../../app/services/auth_service.js')
    const tokens = await signIn('desk@gulfrent.example', 'provider-long-password', {
      allowProvider: true,
    })
    assert.equal(
      await statusOf(client.get('/admin').cookie('admin_access', tokens.accessToken)),
      200
    )
    await client
      .post(`/admin/rentals/providers/${ids.providerId}/login/status`)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .form({ active: 'false' })
    const after = await client.get('/admin').redirects(0).cookie('admin_access', tokens.accessToken)
    assert.equal(after.header('location'), '/admin/login')
    await assert.rejects(() =>
      signIn('desk@gulfrent.example', 'provider-long-password', { allowProvider: true })
    )
  })
})
