import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { ApiError } from './api_error.js'
import { paymentGateway, type GatewayInvoiceStatus } from './myfatoorah_service.js'
import { freeUnits, rentalSettings } from './rental_catalog_service.js'
import {
  expireStaleHolds,
  latestPayment,
  ownedBooking,
  serializeBooking,
  bookingResponse,
} from './rental_booking_service.js'
import { kwd, toFils } from './rental_money.js'
import { createCustomerNotification } from './customer_notification_service.js'
import type { PublicLocale } from './public_localization.js'

type Row = Record<string, any>

const SUCCESS_TRANSACTION = new Set(['succss', 'success', 'succeeded'])

function publicOrigin() {
  return new URL(env.get('APP_API_BASE_URL') ?? env.get('APP_URL')).origin
}

function payableHold(row: Row) {
  if (row.status !== 'pending_payment' || new Date(row.hold_expires_at).getTime() <= Date.now())
    throw new ApiError(
      409,
      'BOOKING_NOT_PAYABLE',
      row.status === 'pending_payment' || row.status === 'expired'
        ? 'The reservation hold has expired. Start a new booking.'
        : 'This booking does not need a payment'
    )
}

export async function paymentMethods(customerId: number, bookingId: unknown, locale: PublicLocale) {
  await expireStaleHolds()
  const booking = await ownedBooking(db, customerId, bookingId)
  payableHold(booking)
  const methods = await paymentGateway().initiatePayment(toFils(booking.booking_fee) / 1000)
  return {
    data: methods.map((method) => ({
      id: Number(method.PaymentMethodId),
      code: method.PaymentMethodCode,
      name:
        locale === 'ar' && method.PaymentMethodAr ? method.PaymentMethodAr : method.PaymentMethodEn,
      image_url: method.ImageUrl ?? null,
      service_charge: kwd(toFils(method.ServiceCharge ?? 0)),
      total_amount: kwd(toFils(method.TotalAmount)),
      currency: method.CurrencyIso,
    })),
  }
}

/**
 * Creates a gateway invoice for the booking fee and returns the hosted payment
 * page URL. The hold is extended once so the customer has time to pay.
 */
export async function startPayment(
  customerId: number,
  bookingId: unknown,
  paymentMethodId: number,
  locale: PublicLocale
) {
  await expireStaleHolds()
  const settings = await rentalSettings()
  const { booking: held, customer } = await db.transaction(async (trx) => {
    const row: Row = await ownedBooking(trx, customerId, bookingId, true)
    payableHold(row)
    const paid = await trx
      .from('rental_payments')
      .where('booking_id', row.id)
      .where('status', 'paid')
      .first()
    if (paid) throw new ApiError(409, 'ALREADY_PAID', 'This booking is already paid')
    const extended = new Date(
      Math.min(
        Date.now() + settings.hold_minutes * 60_000,
        new Date(row.created_at).getTime() + 2 * settings.hold_minutes * 60_000
      )
    )
    if (extended > new Date(row.hold_expires_at))
      await trx
        .from('rental_bookings')
        .where('id', row.id)
        .update({ hold_expires_at: extended, updated_at: new Date() })
    const booking: Row = {
      ...row,
      hold_expires_at: extended > new Date(row.hold_expires_at) ? extended : row.hold_expires_at,
    }
    return {
      booking,
      customer: await trx.from('customers').where('id', customerId).firstOrFail(),
    }
  })
  const amount = toFils(held.booking_fee) / 1000
  const callbackUrl = `${publicOrigin()}/api/v2/rentals/payments/callback`
  const invoice = await paymentGateway().executePayment({
    paymentMethodId,
    amount,
    callbackUrl,
    errorUrl: callbackUrl,
    customerName: `${customer.first_name} ${customer.last_name}`.trim() || 'Customer',
    customerMobile: customer.phone_e164 ?? null,
    customerEmail: customer.email ?? null,
    language: locale,
    customerReference: held.reference,
    userDefinedField: `rental_booking:${held.id}`,
  })
  const now = new Date()
  await db.table('rental_payments').insert({
    booking_id: held.id,
    gateway: 'myfatoorah',
    invoice_id: String(invoice.InvoiceId),
    payment_method_id: paymentMethodId,
    amount: kwd(toFils(held.booking_fee)),
    currency: 'KWD',
    status: 'initiated',
    payment_url: invoice.PaymentURL,
    created_at: now,
    updated_at: now,
  })
  return {
    data: {
      invoice_id: String(invoice.InvoiceId),
      payment_url: invoice.PaymentURL,
      callback_url: callbackUrl,
      hold_expires_at: new Date(held.hold_expires_at).toISOString(),
    },
  }
}

function successfulTransaction(status: GatewayInvoiceStatus) {
  return [...(status.InvoiceTransactions ?? [])]
    .reverse()
    .find((transaction) =>
      SUCCESS_TRANSACTION.has(String(transaction.TransactionStatus).toLowerCase())
    )
}

/**
 * Pulls the authoritative invoice status from MyFatoorah and applies it.
 * Safe to call repeatedly from the callback, the webhook and the app.
 */
export async function syncPayment(key: string, keyType: 'InvoiceId' | 'PaymentId') {
  const status = await paymentGateway().getPaymentStatus(key, keyType)
  const invoiceId = String(status.InvoiceId)
  let confirmedBooking: Row | null = null
  const result = await db.transaction(async (trx) => {
    const payment = await trx
      .from('rental_payments')
      .where('invoice_id', invoiceId)
      .forUpdate()
      .first()
    if (!payment) return null
    const booking = await trx
      .from('rental_bookings')
      .where('id', payment.booking_id)
      .forUpdate()
      .firstOrFail()
    const now = new Date()
    const response = JSON.stringify(status)
    const transaction = successfulTransaction(status)
    if (status.InvoiceStatus === 'Paid' && transaction) {
      if (payment.status !== 'initiated' && payment.status !== 'failed') return booking
      if (toFils(status.InvoiceValue) !== toFils(payment.amount)) {
        logger.error(
          { invoiceId, expected: payment.amount, received: status.InvoiceValue },
          'Rental payment amount does not match the booking fee'
        )
        throw new ApiError(409, 'PAYMENT_AMOUNT_MISMATCH', 'The paid amount does not match')
      }
      await trx
        .from('rental_payments')
        .where('id', payment.id)
        .update({
          status: 'paid',
          payment_id: transaction.PaymentId,
          payment_method: transaction.PaymentGateway ?? null,
          gateway_response: response,
          paid_at: now,
          updated_at: now,
        })
      let next: string = booking.status
      if (booking.status === 'pending_payment' || booking.status === 'expired') {
        const window = {
          pickupAt: new Date(booking.pickup_at),
          returnAt: new Date(booking.return_at),
        }
        const vehicle = await trx
          .from('rental_vehicles')
          .where('id', booking.vehicle_id)
          .forUpdate()
          .firstOrFail()
        next =
          (await freeUnits(trx, vehicle, window, Number(booking.id))) > 0
            ? 'confirmed'
            : 'refund_required'
      } else if (booking.status === 'cancelled') {
        next = 'refund_required'
      }
      if (next !== booking.status) {
        await trx
          .from('rental_bookings')
          .where('id', booking.id)
          .update({
            status: next,
            confirmed_at: next === 'confirmed' ? now : booking.confirmed_at,
            hold_expires_at: null,
            updated_at: now,
          })
        if (next === 'confirmed') confirmedBooking = booking
      }
    } else if (
      payment.status === 'initiated' &&
      (status.InvoiceStatus === 'Canceled' ||
        (status.InvoiceTransactions ?? []).some(
          (item) => String(item.TransactionStatus).toLowerCase() === 'failed'
        ))
    ) {
      await trx
        .from('rental_payments')
        .where('id', payment.id)
        .update({ status: 'failed', gateway_response: response, updated_at: now })
    }
    return trx.from('rental_bookings').where('id', booking.id).firstOrFail()
  })
  if (confirmedBooking) await notifyConfirmed(confirmedBooking)
  return result
}

async function notifyConfirmed(booking: Row) {
  try {
    await createCustomerNotification(Number(booking.customer_id), {
      type: 'rental_booking_confirmed',
      title: 'Rental booking confirmed',
      body: `Your car rental ${booking.reference} is confirmed. Bring your driving licence and ID at pickup.`,
      title_ar: 'تم تأكيد حجز السيارة',
      body_ar: `تم تأكيد حجز السيارة ${booking.reference}. يرجى إحضار رخصة القيادة والهوية عند الاستلام.`,
      action_data: {
        type: 'rental_booking',
        booking_id: Number(booking.id),
        reference: booking.reference,
      },
    })
  } catch (error) {
    logger.error({ err: error, bookingId: booking.id }, 'Rental confirmation notification failed')
  }
}

export async function verifyPayment(customerId: number, bookingId: unknown, locale: PublicLocale) {
  const booking = await ownedBooking(db, customerId, bookingId)
  const payment = await latestPayment(db, Number(booking.id))
  if (!payment) throw new ApiError(409, 'NO_PAYMENT', 'No payment was started for this booking')
  await syncPayment(String(payment.invoice_id), 'InvoiceId')
  const fresh = await ownedBooking(db, customerId, bookingId)
  return bookingResponse(await serializeBooking(db, fresh, locale))
}

/** Where the gateway's browser redirect ends. The app watches for this URL. */
export async function handleCallback(paymentId: unknown) {
  let booking: Row | null = null
  if (typeof paymentId === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(paymentId)) {
    try {
      booking = await syncPayment(paymentId, 'PaymentId')
    } catch (error) {
      logger.warn({ err: error }, 'Rental payment callback could not be verified')
    }
  }
  const status = booking?.status === 'confirmed' ? 'paid' : booking ? 'pending' : 'unknown'
  return { booking, status }
}

function webhookInvoiceId(body: Row): string | null {
  const data = body?.Data ?? body?.data
  const id = data?.InvoiceId ?? data?.Invoice?.Id ?? data?.invoice?.id
  return id === undefined || id === null ? null : String(id)
}

/**
 * Webhooks only trigger a status pull; the gateway API is the source of truth,
 * so a forged webhook cannot confirm a booking.
 */
export async function handleWebhook(body: Row) {
  const invoiceId = webhookInvoiceId(body)
  if (!invoiceId || !/^\d{1,20}$/.test(invoiceId)) return { processed: false }
  if (!(await db.from('rental_payments').where('invoice_id', invoiceId).first()))
    return { processed: false }
  await syncPayment(invoiceId, 'InvoiceId')
  return { processed: true }
}

/** Refunds the paid booking fee in full through the gateway (CMS action). */
export async function refundBooking(bookingId: number, actorId: number, comment: string) {
  const payment = await db
    .from('rental_payments')
    .where('booking_id', bookingId)
    .where('status', 'paid')
    .orderBy('id', 'desc')
    .first()
  if (!payment || !payment.payment_id)
    throw new ApiError(409, 'NOTHING_TO_REFUND', 'This booking has no paid booking fee to refund')
  const refund = await paymentGateway().makeRefund(
    String(payment.payment_id),
    toFils(payment.amount) / 1000,
    comment.slice(0, 200) || 'Rental booking fee refund'
  )
  await db.transaction(async (trx) => {
    const now = new Date()
    await trx
      .from('rental_payments')
      .where('id', payment.id)
      .update({
        status: 'refunded',
        refund_reference: String(refund.RefundReference ?? refund.RefundId),
        refunded_at: now,
        updated_at: now,
      })
    const booking = await trx
      .from('rental_bookings')
      .where('id', bookingId)
      .forUpdate()
      .firstOrFail()
    if (['refund_required', 'confirmed', 'pending_payment', 'expired'].includes(booking.status))
      await trx
        .from('rental_bookings')
        .where('id', bookingId)
        .update({
          status: 'cancelled',
          cancelled_at: booking.cancelled_at ?? now,
          cancelled_by: booking.cancelled_by ?? 'staff',
          updated_at: now,
        })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'rental_booking.refund',
      entity_type: 'rental_booking',
      entity_id: String(bookingId),
      created_at: now,
    })
  })
}
