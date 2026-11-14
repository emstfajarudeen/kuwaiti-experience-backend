import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import * as catalog from '../../services/rental_catalog_service.js'
import * as bookings from '../../services/rental_booking_service.js'
import * as payments from '../../services/rental_payment_service.js'
import * as reviews from '../../services/rental_review_service.js'
import { publicLanguage } from '../../services/public_localization.js'
import { optionalCustomer } from '../../middleware/customer_auth_middleware.js'
import {
  cancelRentalBookingValidator,
  rentalReviewValidator,
  createRentalBookingValidator,
  startRentalPaymentValidator,
} from '../../validators/rentals.js'

const locale = (ctx: HttpContext) => publicLanguage(ctx.request.header('accept-language'))

export default class RentalsController {
  async options(ctx: HttpContext) {
    return catalog.searchOptions(locale(ctx))
  }

  async locations(ctx: HttpContext) {
    return catalog.activeLocations(locale(ctx))
  }

  async vehicles(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'no-store')
    const identity = await optionalCustomer(ctx)
    return catalog.listVehicles(ctx.request.qs(), locale(ctx), identity?.customer.id)
  }

  async vehicle(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'no-store')
    const identity = await optionalCustomer(ctx)
    return catalog.vehicleDetail(
      ctx.params.id,
      ctx.request.qs(),
      locale(ctx),
      identity?.customer.id
    )
  }

  async saved(ctx: HttpContext) {
    return catalog.savedVehicles(ctx.customerIdentity.customer.id, ctx.request.qs(), locale(ctx))
  }

  async save(ctx: HttpContext) {
    return catalog.saveVehicle(ctx.customerIdentity.customer.id, ctx.params.id)
  }

  async unsave(ctx: HttpContext) {
    await catalog.unsaveVehicle(ctx.customerIdentity.customer.id, ctx.params.id)
    return ctx.response.noContent()
  }

  async quote(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'no-store')
    return catalog.vehicleQuote(ctx.params.id, ctx.request.qs(), locale(ctx))
  }

  async vehicleReviews(ctx: HttpContext) {
    return reviews.listPublicReviews('vehicle_id', ctx.params.id, ctx.request.qs(), locale(ctx))
  }

  async providerReviews(ctx: HttpContext) {
    return reviews.listPublicReviews('provider_id', ctx.params.id, ctx.request.qs(), locale(ctx))
  }

  async saveReview(ctx: HttpContext) {
    const input = await ctx.request.validateUsing(rentalReviewValidator)
    const result = await reviews.saveReview(ctx.customerIdentity.customer.id, ctx.params.id, input)
    return ctx.response.status(result.created ? 201 : 200).send({ data: result.data })
  }

  async deleteReview(ctx: HttpContext) {
    await reviews.deleteReview(ctx.customerIdentity.customer.id, ctx.params.id)
    return ctx.response.noContent()
  }

  async store(ctx: HttpContext) {
    const key = bookings.idempotencyKey(ctx.request.header('idempotency-key'))
    const input = await ctx.request.validateUsing(createRentalBookingValidator)
    const result = await bookings.createBooking(
      ctx.customerIdentity.customer.id,
      key,
      input,
      locale(ctx)
    )
    return ctx.response
      .status(result.created ? 201 : 200)
      .send({ data: result.data, meta: result.meta })
  }

  async index(ctx: HttpContext) {
    return bookings.listBookings(ctx.customerIdentity.customer.id, ctx.request.qs(), locale(ctx))
  }

  async show(ctx: HttpContext) {
    return bookings.showBooking(ctx.customerIdentity.customer.id, ctx.params.id, locale(ctx))
  }

  async cancel(ctx: HttpContext) {
    const input = await ctx.request.validateUsing(cancelRentalBookingValidator)
    return bookings.cancelBooking(
      ctx.customerIdentity.customer.id,
      ctx.params.id,
      input.reason,
      locale(ctx)
    )
  }

  async paymentMethods(ctx: HttpContext) {
    return payments.paymentMethods(ctx.customerIdentity.customer.id, ctx.params.id, locale(ctx))
  }

  async pay(ctx: HttpContext) {
    const input = await ctx.request.validateUsing(startRentalPaymentValidator)
    return ctx.response.created(
      await payments.startPayment(
        ctx.customerIdentity.customer.id,
        ctx.params.id,
        input.payment_method_id,
        locale(ctx)
      )
    )
  }

  async verifyPayment(ctx: HttpContext) {
    return payments.verifyPayment(ctx.customerIdentity.customer.id, ctx.params.id, locale(ctx))
  }

  /** Browser redirect target after the hosted payment page. */
  async callback({ request, response }: HttpContext) {
    const { booking, status } = await payments.handleCallback(
      request.input('paymentId') ?? request.input('PaymentId')
    )
    response.header('Cache-Control', 'no-store')
    const returnUrl = env.get('RENTAL_PAYMENT_RETURN_URL')
    if (returnUrl) {
      const target = new URL(returnUrl)
      target.searchParams.set('status', status)
      if (booking) {
        target.searchParams.set('booking_id', String(booking.id))
        target.searchParams.set('reference', String(booking.reference))
      }
      return response.redirect(target.toString())
    }
    const message =
      status === 'paid'
        ? 'Payment received. Your booking is confirmed — you can return to the app.'
        : 'Payment not completed. Return to the app to check your booking.'
    response.header('Content-Type', 'text/html; charset=utf-8')
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment</title></head><body style="font-family:system-ui;padding:24px"><p>${message}</p></body></html>`
  }

  async webhook({ request, response }: HttpContext) {
    const result = await payments.handleWebhook(request.body())
    return response.ok({ data: result })
  }
}
