import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import limiter from '@adonisjs/limiter/services/main'
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import {
  swapPaymentGateway,
  type GatewayInvoiceStatus,
  type PaymentGateway,
} from '../../app/services/myfatoorah_service.js'
import { quoteFor, toFils, kwd, rentalDays } from '../../app/services/rental_money.js'
import { loginAdmin } from '../helpers/admin_auth.js'
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
  const [airport] = await db.table('rental_locations').insert({
    name_en: 'Kuwait Airport',
    name_ar: 'المطار',
    active: true,
    sort_order: 1,
    created_at: now,
  })
  const [city] = await db
    .table('rental_locations')
    .insert({ name_en: 'Kuwait City', active: true, sort_order: 2, created_at: now })
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
    airport: Number(airport),
    city: Number(city),
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
  async makeRefund(paymentId: string, amount: number) {
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
        return_location_id: ids.city,
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
      '/admin/rentals/locations',
      '/admin/rentals/locations/new',
      `/admin/rentals/locations/${ids.airport}/edit`,
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
      .field('locationIds', String(ids.city))
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
      .field('locationIds', String(ids.city))
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
      .field('locationIds', String(ids.city))
    assert.equal(missingRate.header('location'), '/admin/rentals/vehicles/new')

    // The edit forms post Ant Design values as JSON.
    const jsonLocation = await post('/admin/rentals/locations').json({
      nameEn: 'Jahra',
      nameAr: '',
      address: '',
      latitude: '29.3375',
      longitude: '',
      active: true,
      sortOrder: 4,
    })
    assert.equal(jsonLocation.header('location'), '/admin/rentals/locations')
    const jahra = await db.from('rental_locations').where('name_en', 'Jahra').firstOrFail()
    assert.isNull(jahra.longitude)
    assert.isTrue(Boolean(jahra.active))
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
