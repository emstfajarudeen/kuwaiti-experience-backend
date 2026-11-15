import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import { ApiError } from '../../services/api_error.js'
import { cmsImageUrl, imageFiles, prepareImages } from '../../services/image_storage_service.js'
import * as admin from '../../services/rental_admin_service.js'
import { rentalMode } from '../../services/rental_catalog_service.js'
import * as reviews from '../../services/rental_review_service.js'
import * as portalLogins from '../../services/rental_provider_portal_service.js'
import * as documents from '../../services/rental_document_service.js'
import * as drivers from '../../services/rental_driver_service.js'
import { sendProviderEmail } from '../../services/rental_provider_mailer.js'
import * as serviceAreas from '../../services/rental_service_area_service.js'
import { refundBooking } from '../../services/rental_payment_service.js'
import { parseSnapshot } from '../../serializers/rental.js'
import { kwd, toFils } from '../../services/rental_money.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'
import {
  rentalBranchHoursValidator,
  rentalDriverValidator,
  rentalLocationValidator,
  rentalPlaceValidator,
  rentalOptionValidator,
  rentalProviderLoginValidator,
  rentalProviderValidator,
  rentalSettingsValidator,
  rentalVehicleValidator,
} from '../../validators/rentals.js'

type Row = Record<string, any>

const date = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value ? new Date(String(value)).toISOString() : null
const blank = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '' ? null : text
}
const optionalNumber = (value: unknown) => {
  const text = blank(typeof value === 'number' ? String(value) : value)
  return text === null ? null : Number(text)
}
const bool = (value: unknown) =>
  value === true || value === 'true' || value === '1' || value === 'on'
const ids = (value: unknown) =>
  (Array.isArray(value)
    ? value
    : value === undefined || value === null || value === ''
      ? []
      : [value]
  )
    .flatMap((item) => String(item).split(','))
    .map((item) => Number(item))
    .filter((item) => Number.isSafeInteger(item) && item > 0)

/** The provider a portal login is limited to; undefined for staff. */
const portal = (ctx: HttpContext) => ctx.admin.providerId ?? undefined

/**
 * Provider portal logins may only touch their own records. Staff pass through.
 * A record of another provider answers 404, the same as one that does not exist.
 */
async function assertOwned(
  ctx: HttpContext,
  table:
    | 'rental_vehicles'
    | 'rental_locations'
    | 'rental_bookings'
    | 'rental_drivers'
    | 'rental_provider_documents',
  id: number
) {
  const providerId = portal(ctx)
  if (!providerId) return
  const row = Number.isSafeInteger(id)
    ? await db.from(table).where('id', id).select('provider_id').first()
    : null
  if (!row || Number(row.provider_id) !== providerId)
    throw new ApiError(404, 'NOT_FOUND', 'Not found')
}

function shared({ request, session, admin: adminUser }: HttpContext) {
  return {
    adminName: adminUser.fullName,
    csrfToken: request.csrfToken,
    success: (session.flashMessages.get('success') as string | undefined) ?? null,
    error: (session.flashMessages.get('error') as string | undefined) ?? null,
  }
}

function fail(ctx: HttpContext, error: unknown, fallback: string, formKey?: string, form?: Row) {
  const fields = validationErrorBag(error) ?? (error instanceof ApiError ? error.fields : null)
  if (fields) ctx.session.flash('inputErrorsBag', fields)
  ctx.session.flash(
    'error',
    fields ? 'Check the highlighted fields.' : error instanceof Error ? error.message : fallback
  )
  if (formKey && form) ctx.session.flash(formKey, form)
}

const render = (ctx: HttpContext, page: string, props: Row) =>
  ctx.inertia.render(
    `rentals/${page}` as any,
    { ...shared(ctx), ...props },
    { bodyClass: 'cms-body' }
  )

function serializeVehicle(row: Row) {
  return {
    id: Number(row.id),
    provider_id: Number(row.provider_id),
    provider_name: row.provider_name ?? null,
    name_en: row.name_en,
    name_ar: row.name_ar,
    make: row.make,
    model: row.model,
    year: row.year === null ? null : Number(row.year),
    vehicle_type: row.vehicle_type,
    vehicle_type_name: row.vehicle_type_name ?? row.vehicle_type,
    transmission: row.transmission,
    fuel_type: row.fuel_type,
    seats: Number(row.seats),
    doors: row.doors === null ? null : Number(row.doors),
    bags: row.bags === null ? null : Number(row.bags),
    mileage_limit_km: row.mileage_limit_km === null ? null : Number(row.mileage_limit_km),
    extra_km_rate: row.extra_km_rate === null ? null : kwd(toFils(row.extra_km_rate)),
    daily_rate: kwd(toFils(row.daily_rate)),
    rental_mode: rentalMode(row),
    with_driver_available: Boolean(row.with_driver_available),
    driver_daily_rate: row.driver_daily_rate === null ? null : kwd(toFils(row.driver_daily_rate)),
    quantity: Number(row.quantity),
    insurance_option_id: row.insurance_option_id === null ? null : Number(row.insurance_option_id),
    cover_url: cmsImageUrl(row.cover_image_key),
    status: row.status,
    published_at: date(row.published_at),
  }
}

function serializeBooking(row: Row) {
  return {
    id: Number(row.id),
    reference: row.reference,
    status: row.status,
    customer: {
      id: Number(row.customer_id),
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      phone: row.phone_e164,
      email: row.email ?? null,
    },
    vehicle_name: row.vehicle_name ?? parseSnapshot(row.snapshot).vehicle.name_en,
    provider_name: row.provider_name ?? parseSnapshot(row.snapshot).provider.name_en,
    pickup_at: date(row.pickup_at),
    return_at: date(row.return_at),
    with_driver: Boolean(row.with_driver),
    driver_name: row.driver_name ?? null,
    days: Number(row.days),
    rental_amount: kwd(toFils(row.rental_amount)),
    booking_fee: kwd(toFils(row.booking_fee)),
    notes: row.notes ?? null,
    paid: Boolean(Number(row.paid_count ?? 0)),
    hold_expires_at: date(row.hold_expires_at),
    cancelled_by: row.cancelled_by ?? null,
    cancel_reason: row.cancel_reason ?? null,
    created_at: date(row.created_at),
    confirmed_at: date(row.confirmed_at),
    cancelled_at: date(row.cancelled_at),
    completed_at: date(row.completed_at),
  }
}

/** The vehicle form posts its terms repeater as a JSON list in `termsJson`. */
function parseTerms(value: unknown) {
  let list: unknown = []
  try {
    list = typeof value === 'string' && value.trim() ? JSON.parse(value) : []
  } catch {
    list = []
  }
  return (Array.isArray(list) ? list : [])
    .map((item) => ({
      labelEn: typeof item?.labelEn === 'string' ? item.labelEn.trim() : '',
      labelAr:
        typeof item?.labelAr === 'string' && item.labelAr.trim() ? item.labelAr.trim() : null,
    }))
    .filter((item) => item.labelEn || item.labelAr)
}

/** Reads the indexed `gallery[n][id|remove|sortOrder]` inputs of the gallery sorter. */
function galleryItems(value: unknown) {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value)
      : []
  return entries
    .filter((item): item is Row => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: Number(item.id),
      remove: item.remove === 'on' || item.remove === 'true',
      sortOrder: optionalNumber(item.sortOrder),
    }))
    .filter((item) => Number.isSafeInteger(item.id) && item.id > 0)
}

const numberList = (value: unknown) =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 10000)

const dayString = (value: unknown) =>
  value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value ?? '').slice(0, 10)

export default class AdminRentalsController {
  // ------------------------------------------------------------ bookings

  async bookings(ctx: HttpContext) {
    const status = String(ctx.request.input('status', ''))
    const query = String(ctx.request.input('q', '')).trim().slice(0, 120)
    const result = await admin.listBookings({
      status,
      q: query,
      page: ctx.request.input('page'),
      providerId: portal(ctx),
    })
    return render(ctx, 'bookings', {
      status,
      query,
      rows: result.rows.map(serializeBooking),
      meta: {
        total: result.total,
        page: result.page,
        lastPage: result.lastPage,
        perPage: result.pageSize,
      },
    })
  }

  async booking(ctx: HttpContext) {
    await assertOwned(ctx, 'rental_bookings', Number(ctx.params.id))
    const found = await admin.findBooking(Number(ctx.params.id))
    if (!found) return ctx.response.redirect('/admin/rentals/bookings')
    // Providers see the rental itself, not the booking-fee payments or our email log.
    const staff = !portal(ctx)
    const snapshot = parseSnapshot(found.row.snapshot)
    const choices = found.row.with_driver ? await drivers.driverChoices(found.row) : []
    return render(ctx, 'booking', {
      booking: {
        ...serializeBooking(found.row),
        pickup_location: snapshot.pickup_location.name_en,
        return_location: snapshot.return_location.name_en,
        pickup_address: snapshot.pickup_address
          ? {
              address: snapshot.pickup_address.address,
              area: snapshot.pickup_address.area?.name_en ?? null,
              map_url: `https://www.google.com/maps/search/?api=1&query=${snapshot.pickup_address.latitude},${snapshot.pickup_address.longitude}`,
            }
          : null,
        provider_phone: snapshot.provider.phone_e164,
        provider_email: snapshot.provider.email,
        driver_id: found.row.driver_id === null ? null : Number(found.row.driver_id),
      },
      driverChoices: (found.row.with_driver ? choices : []).map(
        ({ photo_image_key: photo, ...driver }) => ({
          ...driver,
          photo_url: cmsImageUrl(photo),
        })
      ),
      review: found.review
        ? {
            id: Number(found.review.id),
            rating: Number(found.review.rating),
            comment: found.review.comment ?? null,
            status: found.review.status,
            created_at: date(found.review.created_at),
          }
        : null,
      providerEmails: (staff ? found.providerEmails : []).map((email) => ({
        id: Number(email.id),
        kind: email.kind,
        recipient: email.recipient,
        status: email.status,
        error: email.error,
        created_at: date(email.created_at),
      })),
      payments: (staff ? found.payments : []).map((payment) => ({
        id: Number(payment.id),
        invoice_id: payment.invoice_id,
        payment_id: payment.payment_id,
        method: payment.payment_method,
        amount: kwd(toFils(payment.amount)),
        status: payment.status,
        refund_reference: payment.refund_reference,
        paid_at: date(payment.paid_at),
        refunded_at: date(payment.refunded_at),
        created_at: date(payment.created_at),
      })),
    })
  }

  private async bookingAction(ctx: HttpContext, action: () => Promise<unknown>, message: string) {
    try {
      await action()
      ctx.session.flash('success', message)
    } catch (error) {
      fail(ctx, error, 'Unable to update the booking.')
    }
    const returnTo = String(ctx.request.input('returnTo', ''))
    return ctx.response.redirect(
      returnTo.startsWith('/admin/rentals/bookings') || returnTo === '/admin'
        ? returnTo
        : `/admin/rentals/bookings/${Number(ctx.params.id)}`
    )
  }

  async completeBooking(ctx: HttpContext) {
    await assertOwned(ctx, 'rental_bookings', Number(ctx.params.id))
    return this.bookingAction(
      ctx,
      () => admin.completeBooking(Number(ctx.params.id), ctx.admin.id),
      'Booking marked as completed.'
    )
  }

  async cancelBooking(ctx: HttpContext) {
    return this.bookingAction(
      ctx,
      () =>
        admin.cancelBookingByStaff(
          Number(ctx.params.id),
          blank(ctx.request.input('reason'))?.slice(0, 500) ?? null,
          ctx.admin.id
        ),
      'Booking cancelled.'
    )
  }

  async refundBooking(ctx: HttpContext) {
    return this.bookingAction(
      ctx,
      () =>
        refundBooking(
          Number(ctx.params.id),
          ctx.admin.id,
          blank(ctx.request.input('reason')) ?? 'Rental booking fee refund'
        ),
      'Booking fee refunded and booking cancelled.'
    )
  }

  async sendProviderEmail(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    const found = await admin.findBooking(id)
    if (!found) return ctx.response.redirect('/admin/rentals/bookings')
    if (!found.row.confirmed_at) {
      ctx.session.flash('error', 'Only bookings that were confirmed can be sent to the provider.')
      return ctx.response.redirect(`/admin/rentals/bookings/${id}`)
    }
    const kind = found.row.status === 'cancelled' ? 'cancelled' : 'confirmed'
    const result = await sendProviderEmail(id, kind, ctx.admin.id)
    if (result.status === 'sent') ctx.session.flash('success', 'Email sent to the provider.')
    else ctx.session.flash('error', result.error ?? 'The provider email could not be sent.')
    return ctx.response.redirect(`/admin/rentals/bookings/${id}`)
  }

  // ------------------------------------------------------------ vehicle options

  /** JSON: adds a vehicle type from the vehicle form dropdown. */
  async createVehicleType(ctx: HttpContext) {
    const input = await ctx.request.validateUsing(rentalOptionValidator)
    return { data: await admin.createVehicleType(input, ctx.admin.id) }
  }

  /** JSON: adds an insurance option from the vehicle form dropdown. */
  async createInsuranceOption(ctx: HttpContext) {
    const input = await ctx.request.validateUsing(rentalOptionValidator)
    return { data: await admin.createInsuranceOption(input, ctx.admin.id) }
  }

  // ------------------------------------------------------------ reviews

  async reviews(ctx: HttpContext) {
    const status = String(ctx.request.input('status', ''))
    const rating = String(ctx.request.input('rating', ''))
    const query = String(ctx.request.input('q', '')).trim().slice(0, 120)
    const result = await reviews.adminListReviews({
      status,
      rating,
      q: query,
      page: ctx.request.input('page'),
    })
    return render(ctx, 'reviews', {
      status,
      rating,
      query,
      rows: result.rows.map((row) => ({
        id: Number(row.id),
        booking_id: Number(row.booking_id),
        reference: row.reference,
        rating: Number(row.rating),
        comment: row.comment ?? null,
        status: row.status,
        customer_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
        customer_phone: row.phone_e164,
        vehicle_name: row.vehicle_name,
        provider_name: row.provider_name,
        created_at: date(row.created_at),
      })),
      meta: {
        total: result.total,
        page: result.page,
        lastPage: result.lastPage,
        perPage: result.pageSize,
      },
    })
  }

  async reviewStatus(ctx: HttpContext) {
    const status = ctx.request.input('status')
    try {
      if (!['published', 'hidden'].includes(status))
        throw new ApiError(422, 'INVALID_STATUS', 'Choose a valid status.')
      await reviews.setReviewStatus(Number(ctx.params.id), status, ctx.admin.id)
      ctx.session.flash(
        'success',
        status === 'published' ? 'Review shown in the app.' : 'Review hidden from the app.'
      )
    } catch (error) {
      fail(ctx, error, 'Unable to update the review.')
    }
    const returnTo = String(ctx.request.input('returnTo', ''))
    return ctx.response.redirect(
      returnTo.startsWith('/admin/rentals/') ? returnTo : '/admin/rentals/reviews'
    )
  }

  async deleteReview(ctx: HttpContext) {
    try {
      await reviews.adminDeleteReview(Number(ctx.params.id), ctx.admin.id)
      ctx.session.flash('success', 'Review deleted.')
    } catch (error) {
      fail(ctx, error, 'Unable to delete the review.')
    }
    return ctx.response.redirect('/admin/rentals/reviews')
  }

  // ------------------------------------------------------------ vehicles

  async vehicles(ctx: HttpContext) {
    const status = String(ctx.request.input('status', ''))
    const query = String(ctx.request.input('q', '')).trim().slice(0, 120)
    const providerId = portal(ctx) ?? optionalNumber(ctx.request.input('provider')) ?? undefined
    const formOptions = await admin.vehicleFormOptions(portal(ctx))
    const result = await admin.listVehicles({
      status,
      q: query,
      providerId,
      page: ctx.request.input('page'),
    })
    return render(ctx, 'vehicles', {
      status,
      query,
      providerId: providerId ?? null,
      providers: formOptions.providers,
      rows: result.rows.map(serializeVehicle),
      meta: {
        total: result.total,
        page: result.page,
        lastPage: result.lastPage,
        perPage: result.pageSize,
      },
    })
  }

  private async vehicleForm(ctx: HttpContext, id?: number) {
    if (id) await assertOwned(ctx, 'rental_vehicles', id)
    const found = id ? await admin.findVehicle(id) : null
    if (id && !found) return ctx.response.redirect('/admin/rentals/vehicles')
    return render(ctx, 'vehicle_edit', {
      vehicle: found
        ? {
            ...serializeVehicle(found.row),
            location_ids: found.locationIds,
            terms: found.terms.map((term) => ({
              label_en: term.label_en,
              label_ar: term.label_ar ?? null,
            })),
            images: found.images.map((image) => ({
              id: Number(image.id),
              url: cmsImageUrl(image.storage_key),
              sort_order: Number(image.sort_order),
            })),
          }
        : null,
      form: (ctx.session.flashMessages.get('vehicleForm') as Row | undefined) ?? null,
      options: await admin.vehicleFormOptions(portal(ctx)),
    })
  }

  async newVehicle(ctx: HttpContext) {
    return this.vehicleForm(ctx)
  }

  async editVehicle(ctx: HttpContext) {
    return this.vehicleForm(ctx, Number(ctx.params.id))
  }

  async saveVehicle(ctx: HttpContext) {
    const { request, response, session } = ctx
    const id = ctx.params.id ? Number(ctx.params.id) : undefined
    if (id) await assertOwned(ctx, 'rental_vehicles', id)
    const raw = {
      providerId: portal(ctx) ?? optionalNumber(request.input('providerId')),
      nameEn: request.input('nameEn') ?? '',
      nameAr: blank(request.input('nameAr')),
      make: request.input('make') ?? '',
      model: request.input('model') ?? '',
      year: optionalNumber(request.input('year')),
      vehicleType: request.input('vehicleType'),
      transmission: request.input('transmission'),
      fuelType: request.input('fuelType') || 'petrol',
      seats: optionalNumber(request.input('seats')),
      doors: optionalNumber(request.input('doors')),
      bags: optionalNumber(request.input('bags')),
      mileageLimitKm: optionalNumber(request.input('mileageLimitKm')),
      extraKmRate: blank(String(request.input('extraKmRate') ?? '')),
      dailyRate: String(request.input('dailyRate') ?? ''),
      rentalMode: request.input('rentalMode') || 'self_drive',
      driverDailyRate: blank(String(request.input('driverDailyRate') ?? '')),
      quantity: optionalNumber(request.input('quantity')) ?? 1,
      insuranceOptionId: optionalNumber(request.input('insuranceOptionId')),
      terms: parseTerms(request.input('termsJson')),
      locationIds: ids(request.input('locationIds')),
    }
    try {
      const input = await rentalVehicleValidator.validate(raw)
      const gallery = galleryItems(request.input('gallery'))
      const images = await prepareImages(ctx.admin.id, {
        cover: imageFiles(request, 'cover'),
        gallery: imageFiles(request, 'galleryImages', 5),
      })
      const savedId = await admin.saveVehicle(
        input,
        {
          cover: images.cover[0],
          removeCover: bool(request.input('removeCover')),
          gallery: images.gallery,
          removeImageIds: gallery.filter((item) => item.remove).map((item) => item.id),
          galleryOrder: gallery
            .filter((item) => !item.remove && item.sortOrder !== null)
            .map((item) => ({ id: item.id, sortOrder: item.sortOrder as number })),
          galleryNewOrder: numberList(request.input('galleryNewOrder')),
        },
        ctx.admin.id,
        id
      )
      session.flash('success', id ? 'Vehicle saved.' : 'Vehicle created as a draft.')
      return response.redirect(`/admin/rentals/vehicles/${savedId}/edit`)
    } catch (error) {
      fail(ctx, error, 'Unable to save the vehicle.', 'vehicleForm', raw)
      return response.redirect(
        id ? `/admin/rentals/vehicles/${id}/edit` : '/admin/rentals/vehicles/new'
      )
    }
  }

  async vehicleStatus(ctx: HttpContext) {
    await assertOwned(ctx, 'rental_vehicles', Number(ctx.params.id))
    const status = ctx.request.input('status')
    try {
      if (!['draft', 'published'].includes(status))
        throw new ApiError(422, 'INVALID_STATUS', 'Choose a valid status.')
      await admin.setVehicleStatus(Number(ctx.params.id), status, ctx.admin.id)
      ctx.session.flash(
        'success',
        status === 'published' ? 'Vehicle activated.' : 'Vehicle deactivated.'
      )
    } catch (error) {
      fail(ctx, error, 'Unable to update the vehicle.')
    }
    const returnTo = String(ctx.request.input('returnTo', ''))
    return ctx.response.redirect(
      returnTo.startsWith('/admin/rentals/') ? returnTo : '/admin/rentals/vehicles'
    )
  }

  async deleteVehicle(ctx: HttpContext) {
    await assertOwned(ctx, 'rental_vehicles', Number(ctx.params.id))
    try {
      await admin.deleteVehicle(Number(ctx.params.id), ctx.admin.id)
      ctx.session.flash('success', 'Vehicle deleted.')
      return ctx.response.redirect('/admin/rentals/vehicles')
    } catch (error) {
      fail(ctx, error, 'Unable to delete the vehicle.')
      return ctx.response.redirect(`/admin/rentals/vehicles/${Number(ctx.params.id)}/edit`)
    }
  }

  // ----------------------------------------------------------- providers

  async providers(ctx: HttpContext) {
    const rows = await admin.listProviders()
    const logins = await portalLogins.providerLoginStates()
    return render(ctx, 'providers', {
      rows: rows.map((row) => ({
        id: Number(row.id),
        name_en: row.name_en,
        phone: row.phone_e164 ?? null,
        email: row.email ?? null,
        active: Boolean(row.active),
        vehicle_count: Number(row.vehicle_count),
        branch_count: Number(row.branch_count),
        logo_url: cmsImageUrl(row.logo_image_key),
        login_state: logins.get(Number(row.id)) ?? null,
      })),
    })
  }

  private async providerForm(ctx: HttpContext, id?: number) {
    const row = id ? await admin.findProvider(id) : null
    if (id && !row) return ctx.response.redirect('/admin/rentals/providers')
    const branchRows = id ? await admin.listLocations(id) : []
    const driverRows = id ? await drivers.listDrivers(id) : []
    const documentRows = id ? await documents.listDocuments(id) : []
    return render(ctx, 'provider_edit', {
      provider: row
        ? {
            id: Number(row.id),
            name_en: row.name_en,
            name_ar: row.name_ar,
            phone: row.phone_e164,
            email: row.email,
            address: row.address,
            active: Boolean(row.active),
            logo_url: cmsImageUrl(row.logo_image_key),
          }
        : null,
      areaOptions: await serviceAreas.areaOptions(),
      excludedAreaIds: id ? await serviceAreas.providerExcludedAreaIds(id) : [],
      branchCount: branchRows.length,
      driverCount: driverRows.length,
      documentCount: documentRows.length,
      login: id ? await portalLogins.providerLogin(id) : null,
      loginForm: (ctx.session.flashMessages.get('loginForm') as Row | undefined) ?? null,
      inviteLink: (ctx.session.flashMessages.get('inviteLink') as string | undefined) ?? null,
      form: (ctx.session.flashMessages.get('providerForm') as Row | undefined) ?? null,
    })
  }

  async newProvider(ctx: HttpContext) {
    return this.providerForm(ctx)
  }

  async editProvider(ctx: HttpContext) {
    return this.providerForm(ctx, Number(ctx.params.id))
  }

  async saveProvider(ctx: HttpContext) {
    const { request, response, session } = ctx
    const id = ctx.params.id ? Number(ctx.params.id) : undefined
    const raw = {
      nameEn: request.input('nameEn') ?? '',
      nameAr: blank(request.input('nameAr')),
      phone: blank(request.input('phone')),
      email: blank(request.input('email')),
      address: blank(request.input('address')),
      active: bool(request.input('active')),
      excludedAreaIds: ids(request.input('excludedAreaIds')),
    }
    try {
      const input = await rentalProviderValidator.validate(raw)
      const images = await prepareImages(ctx.admin.id, { logo: imageFiles(request, 'logo') })
      const savedId = await admin.saveProvider(
        input,
        { logo: images.logo[0], removeLogo: bool(request.input('removeLogo')) },
        ctx.admin.id,
        id
      )
      // Only when the form showed the areas field, so other posts never clear the choice.
      if (request.input('excludedAreasSent'))
        await db.transaction((trx) =>
          serviceAreas.setProviderExcludedAreas(trx, savedId, raw.excludedAreaIds)
        )
      session.flash('success', id ? 'Provider saved.' : 'Provider created.')
      // A new provider with an email gets its portal login and the invite straight away.
      if (!id && input.email) {
        try {
          const result = await portalLogins.createProviderLogin(
            savedId,
            { name: input.nameEn, email: input.email },
            ctx.admin.id
          )
          this.inviteOutcome(
            ctx,
            result,
            `Provider created. An invite was emailed to ${input.email}.`
          )
          if (result.status === 'failed')
            return response.redirect(`/admin/rentals/providers/${savedId}/edit`)
        } catch (error) {
          fail(ctx, error, 'The provider was created, but the invite could not be sent.')
          return response.redirect(`/admin/rentals/providers/${savedId}/edit`)
        }
      }
      return response.redirect('/admin/rentals/providers')
    } catch (error) {
      fail(ctx, error, 'Unable to save the provider.', 'providerForm', raw)
      return response.redirect(
        id ? `/admin/rentals/providers/${id}/edit` : '/admin/rentals/providers/new'
      )
    }
  }

  async providerStatus(ctx: HttpContext) {
    const raw = ctx.request.input('active')
    const active = [true, 'true', 1, '1', 'on'].includes(raw)
    try {
      await admin.setProviderActive(Number(ctx.params.id), active, ctx.admin.id)
      ctx.session.flash('success', active ? 'Provider activated.' : 'Provider deactivated.')
    } catch (error) {
      fail(ctx, error, 'Unable to update the provider.')
    }
    const returnTo = String(ctx.request.input('returnTo', ''))
    return ctx.response.redirect(
      returnTo.startsWith('/admin/rentals/') ? returnTo : '/admin/rentals/providers'
    )
  }

  async deleteProvider(ctx: HttpContext) {
    try {
      await admin.deleteProvider(Number(ctx.params.id), ctx.admin.id)
      ctx.session.flash('success', 'Provider deleted.')
    } catch (error) {
      fail(ctx, error, 'Unable to delete the provider.')
    }
    return ctx.response.redirect('/admin/rentals/providers')
  }

  // ------------------------------------------------------ provider portal login

  private inviteOutcome(
    ctx: HttpContext,
    result: { status: 'sent' | 'failed'; error: string | null; url: string | null },
    sent: string
  ) {
    if (result.status === 'sent') {
      ctx.session.flash('success', sent)
      return
    }
    ctx.session.flash(
      'error',
      `The invite email could not be sent (${result.error ?? 'unknown error'}). Copy the link below and send it to the provider yourself.`
    )
    if (result.url) ctx.session.flash('inviteLink', result.url)
  }

  async createProviderLogin(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    const raw = { name: ctx.request.input('name') ?? '', email: ctx.request.input('email') ?? '' }
    try {
      const input = await rentalProviderLoginValidator.validate(raw)
      const result = await portalLogins.createProviderLogin(id, input, ctx.admin.id)
      this.inviteOutcome(ctx, result, `Login created. An invite was emailed to ${input.email}.`)
    } catch (error) {
      fail(ctx, error, 'Unable to create the login.', 'loginForm', raw)
    }
    return ctx.response.redirect(`/admin/rentals/providers/${id}/edit`)
  }

  async resendProviderInvite(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    try {
      const result = await portalLogins.resendProviderInvite(id, ctx.admin.id)
      this.inviteOutcome(ctx, result, 'A new invite was emailed. Earlier links no longer work.')
    } catch (error) {
      fail(ctx, error, 'Unable to send the invite.')
    }
    return ctx.response.redirect(`/admin/rentals/providers/${id}/edit`)
  }

  async providerLoginStatus(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    const active = bool(ctx.request.input('active'))
    try {
      await portalLogins.setProviderLoginActive(id, active, ctx.admin.id)
      ctx.session.flash(
        'success',
        active ? 'Portal login turned on.' : 'Portal login turned off and signed out.'
      )
    } catch (error) {
      fail(ctx, error, 'Unable to update the login.')
    }
    return ctx.response.redirect(`/admin/rentals/providers/${id}/edit`)
  }

  async deleteProviderLogin(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    try {
      await portalLogins.deleteProviderLogin(id, ctx.admin.id)
      ctx.session.flash('success', 'Portal login removed.')
    } catch (error) {
      fail(ctx, error, 'Unable to remove the login.')
    }
    return ctx.response.redirect(`/admin/rentals/providers/${id}/edit`)
  }

  // ------------------------------------------------------------ documents

  /** A provider's legal documents (staff and that provider only; not shown in the app). */
  async documents(ctx: HttpContext) {
    const providerId = portal(ctx) ?? optionalNumber(ctx.request.input('provider')) ?? undefined
    const providers = await admin.providerOptions(portal(ctx))
    const selected = providerId ?? (providers[0] ? Number(providers[0].value) : undefined)
    const rows = selected ? await documents.listDocuments(selected) : []
    return render(ctx, 'documents', {
      provider: selected ? String(selected) : '',
      providers,
      maxMb: documents.MAX_DOCUMENT_MB,
      rows: rows.map((row) => ({
        id: Number(row.id),
        label: row.label,
        file_name: row.original_name,
        mime_type: row.mime_type,
        size_bytes: Number(row.size_bytes),
        url: `/admin/rentals/documents/${row.id}/file`,
        created_at: date(row.created_at),
      })),
    })
  }

  async uploadDocument(ctx: HttpContext) {
    const providerId = portal(ctx) ?? optionalNumber(ctx.request.input('providerId'))
    const back = portal(ctx)
      ? '/admin/rentals/documents'
      : `/admin/rentals/documents?provider=${providerId ?? ''}`
    try {
      if (!providerId) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a provider.')
      await documents.addDocument(
        providerId,
        String(ctx.request.input('label') ?? ''),
        documents.documentFile(ctx.request),
        ctx.admin.id
      )
      ctx.session.flash('success', 'Document uploaded.')
    } catch (error) {
      fail(ctx, error, 'Unable to upload the document.')
    }
    return ctx.response.redirect(back)
  }

  async documentFile(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    await assertOwned(ctx, 'rental_provider_documents', id)
    const row = await documents.findDocument(id)
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Document not found')
    return documents.streamDocument(ctx.response, row)
  }

  async updateDocument(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    await assertOwned(ctx, 'rental_provider_documents', id)
    const row = await documents.findDocument(id)
    try {
      await documents.updateDocumentLabel(
        id,
        String(ctx.request.input('label') ?? ''),
        ctx.admin.id
      )
      ctx.session.flash('success', 'Document renamed.')
    } catch (error) {
      fail(ctx, error, 'Unable to rename the document.')
    }
    return ctx.response.redirect(
      row && !portal(ctx)
        ? `/admin/rentals/documents?provider=${row.provider_id}`
        : '/admin/rentals/documents'
    )
  }

  async deleteDocument(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    await assertOwned(ctx, 'rental_provider_documents', id)
    const row = await documents.findDocument(id)
    try {
      await documents.deleteDocument(id, ctx.admin.id)
      ctx.session.flash('success', 'Document deleted.')
    } catch (error) {
      fail(ctx, error, 'Unable to delete the document.')
    }
    return ctx.response.redirect(
      row && !portal(ctx)
        ? `/admin/rentals/documents?provider=${row.provider_id}`
        : '/admin/rentals/documents'
    )
  }

  // -------------------------------------------------------------- drivers

  async drivers(ctx: HttpContext) {
    const providerId = portal(ctx) ?? optionalNumber(ctx.request.input('provider')) ?? undefined
    const rows = await drivers.listDrivers(providerId)
    return render(ctx, 'drivers', {
      provider: providerId ? String(providerId) : '',
      providers: await admin.providerOptions(portal(ctx)),
      rows: rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        phone: row.phone_e164 ?? null,
        photo_url: cmsImageUrl(row.photo_image_key),
        provider_name: row.provider_name,
        active: Boolean(row.active),
        upcoming_count: Number(row.upcoming_count),
      })),
    })
  }

  private async driverForm(ctx: HttpContext, id?: number) {
    if (id) await assertOwned(ctx, 'rental_drivers', id)
    const row = id ? await drivers.findDriver(id) : null
    if (id && !row) return ctx.response.redirect('/admin/rentals/drivers')
    const presetProvider =
      portal(ctx) ?? row?.provider_id ?? optionalNumber(ctx.request.input('providerId'))
    return render(ctx, 'driver_edit', {
      providerId: presetProvider ? Number(presetProvider) : null,
      providers: await admin.providerOptions(portal(ctx)),
      driver: row
        ? {
            id: Number(row.id),
            name: row.name,
            phone: row.phone_e164 ?? null,
            photo_url: cmsImageUrl(row.photo_image_key),
            active: Boolean(row.active),
          }
        : null,
      form: (ctx.session.flashMessages.get('driverForm') as Row | undefined) ?? null,
    })
  }

  async newDriver(ctx: HttpContext) {
    return this.driverForm(ctx)
  }

  async editDriver(ctx: HttpContext) {
    return this.driverForm(ctx, Number(ctx.params.id))
  }

  async saveDriver(ctx: HttpContext) {
    const { request, response, session } = ctx
    const id = ctx.params.id ? Number(ctx.params.id) : undefined
    if (id) await assertOwned(ctx, 'rental_drivers', id)
    const raw = {
      providerId: portal(ctx) ?? optionalNumber(request.input('providerId')),
      name: request.input('name') ?? '',
      phone: blank(request.input('phone')),
      active: bool(request.input('active')),
    }
    try {
      const input = await rentalDriverValidator.validate(raw)
      const images = await prepareImages(ctx.admin.id, { photo: imageFiles(request, 'photo') })
      await drivers.saveDriver(
        input,
        { photo: images.photo[0], removePhoto: bool(request.input('removePhoto')) },
        ctx.admin.id,
        id
      )
      session.flash('success', id ? 'Driver saved.' : 'Driver added.')
      return response.redirect(
        portal(ctx)
          ? '/admin/rentals/drivers'
          : `/admin/rentals/drivers?provider=${input.providerId}`
      )
    } catch (error) {
      fail(ctx, error, 'Unable to save the driver.', 'driverForm', raw)
      return response.redirect(
        id
          ? `/admin/rentals/drivers/${id}/edit`
          : `/admin/rentals/drivers/new?providerId=${raw.providerId ?? ''}`
      )
    }
  }

  async driverStatus(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    await assertOwned(ctx, 'rental_drivers', id)
    const active = bool(ctx.request.input('active'))
    try {
      await drivers.setDriverActive(id, active, ctx.admin.id)
      ctx.session.flash('success', active ? 'Driver turned on.' : 'Driver turned off.')
    } catch (error) {
      fail(ctx, error, 'Unable to update the driver.')
    }
    const returnTo = String(ctx.request.input('returnTo', ''))
    return ctx.response.redirect(
      returnTo.startsWith('/admin/rentals/drivers') ? returnTo : '/admin/rentals/drivers'
    )
  }

  async deleteDriver(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    await assertOwned(ctx, 'rental_drivers', id)
    try {
      await drivers.deleteDriver(id, ctx.admin.id)
      ctx.session.flash('success', 'Driver deleted.')
    } catch (error) {
      fail(ctx, error, 'Unable to delete the driver.')
    }
    return ctx.response.redirect('/admin/rentals/drivers')
  }

  /** Assigns, changes or (empty driverId) removes the driver of a with-driver booking. */
  async assignDriver(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    await assertOwned(ctx, 'rental_bookings', id)
    const driverId = optionalNumber(ctx.request.input('driverId'))
    try {
      const outcome = await drivers.assignDriver(id, driverId, ctx.admin.id)
      ctx.session.flash(
        'success',
        driverId === null
          ? 'Driver removed from the booking.'
          : outcome.changed
            ? `${outcome.driver?.name} assigned. The customer was notified in the app.`
            : 'No change: this driver is already assigned.'
      )
    } catch (error) {
      fail(ctx, error, 'Unable to assign the driver.')
    }
    const returnTo = String(ctx.request.input('returnTo', ''))
    return ctx.response.redirect(
      returnTo.startsWith('/admin/rentals/bookings') || returnTo === '/admin'
        ? returnTo
        : `/admin/rentals/bookings/${id}`
    )
  }

  // ----------------------------------------------------------- locations

  /** All branches, optionally for one provider. */
  async locations(ctx: HttpContext) {
    const providerId = portal(ctx) ?? optionalNumber(ctx.request.input('provider')) ?? undefined
    const rows = await admin.listLocations(providerId)
    return render(ctx, 'branches', {
      provider: providerId ? String(providerId) : '',
      providers: await admin.providerOptions(portal(ctx)),
      rows: rows.map((row) => ({
        id: Number(row.id),
        name_en: row.name_en,
        address: row.address ?? null,
        phone: row.phone_e164 ?? null,
        provider_id: row.provider_id === null ? null : Number(row.provider_id),
        provider_name: row.provider_name ?? null,
        place_name: row.place_name ?? null,
        active: Boolean(row.active),
        hours_enabled: Boolean(row.hours_enabled),
        vehicle_count: Number(row.vehicle_count),
      })),
    })
  }

  /** Weekly hours of every branch at a glance. */
  async workingHours(ctx: HttpContext) {
    const providerId = portal(ctx) ?? optionalNumber(ctx.request.input('provider')) ?? undefined
    const branches = await admin.listBranchHours(providerId)
    return render(ctx, 'working_hours', {
      provider: providerId ? String(providerId) : '',
      providers: await admin.providerOptions(portal(ctx)),
      rows: branches.map(({ row, schedule, closures }) => ({
        id: Number(row.id),
        name_en: row.name_en,
        provider_name: row.provider_name ?? null,
        place_name: row.place_name ?? null,
        active: Boolean(row.active),
        hours_enabled: Boolean(row.hours_enabled),
        schedule,
        closures: closures.map((closure) => ({
          startsOn: dayString(closure.starts_on),
          endsOn: dayString(closure.ends_on),
          reason: closure.reason ?? null,
        })),
      })),
    })
  }

  private async locationForm(ctx: HttpContext, id?: number) {
    if (id) await assertOwned(ctx, 'rental_locations', id)
    const found = id ? await admin.findLocation(id) : null
    if (id && !found) return ctx.response.redirect('/admin/rentals/locations')
    const row = found?.row
    const presetProvider =
      portal(ctx) ?? row?.provider_id ?? optionalNumber(ctx.request.input('providerId'))
    return render(ctx, 'location_edit', {
      providerId: presetProvider ? Number(presetProvider) : null,
      providers: await admin.providerOptions(portal(ctx)),
      places: await admin.placeOptions(),
      location: row
        ? {
            id: Number(row.id),
            phone: row.phone_e164 ?? null,
            place_id: row.place_id === null ? null : Number(row.place_id),
            name_en: row.name_en,
            name_ar: row.name_ar,
            address: row.address,
            latitude: row.latitude === null ? null : Number(row.latitude),
            longitude: row.longitude === null ? null : Number(row.longitude),
            active: Boolean(row.active),
            sort_order: Number(row.sort_order),
          }
        : null,
      form: (ctx.session.flashMessages.get('locationForm') as Row | undefined) ?? null,
    })
  }

  async newLocation(ctx: HttpContext) {
    return this.locationForm(ctx)
  }

  async editLocation(ctx: HttpContext) {
    return this.locationForm(ctx, Number(ctx.params.id))
  }

  async saveLocation(ctx: HttpContext) {
    const { request, response, session } = ctx
    const id = ctx.params.id ? Number(ctx.params.id) : undefined
    if (id) await assertOwned(ctx, 'rental_locations', id)
    const raw = {
      providerId: portal(ctx) ?? optionalNumber(request.input('providerId')),
      placeId: optionalNumber(request.input('placeId')),
      phone: blank(request.input('phone')),
      nameEn: request.input('nameEn') ?? '',
      nameAr: blank(request.input('nameAr')),
      address: blank(request.input('address')),
      latitude: optionalNumber(request.input('latitude')),
      longitude: optionalNumber(request.input('longitude')),
      active: bool(request.input('active')),
      sortOrder: optionalNumber(request.input('sortOrder')) ?? 0,
    }
    try {
      const input = await rentalLocationValidator.validate(raw)
      const savedId = await admin.saveLocation(input, ctx.admin.id, id)
      if (id) {
        session.flash('success', 'Branch saved.')
        return response.redirect(
          portal(ctx)
            ? '/admin/rentals/locations'
            : `/admin/rentals/locations?provider=${input.providerId}`
        )
      }
      session.flash('success', 'Branch created. Now set its working hours.')
      return response.redirect(`/admin/rentals/locations/${savedId}/hours`)
    } catch (error) {
      fail(ctx, error, 'Unable to save the branch.', 'locationForm', raw)
      return response.redirect(
        id
          ? `/admin/rentals/locations/${id}/edit`
          : `/admin/rentals/locations/new?providerId=${raw.providerId ?? ''}`
      )
    }
  }

  async branchHours(ctx: HttpContext) {
    await assertOwned(ctx, 'rental_locations', Number(ctx.params.id))
    const found = await admin.findLocation(Number(ctx.params.id))
    if (!found) return ctx.response.redirect('/admin/rentals/working-hours')
    const provider = found.row.provider_id ? await admin.findProvider(found.row.provider_id) : null
    return render(ctx, 'branch_hours', {
      branch: {
        id: Number(found.row.id),
        name_en: found.row.name_en,
        provider_name: provider?.name_en ?? null,
        provider_id: found.row.provider_id ? Number(found.row.provider_id) : null,
        hours_enabled: Boolean(found.row.hours_enabled),
      },
      schedule: found.schedule,
      closures: found.closures.map((closure) => ({
        startsOn: dayString(closure.starts_on),
        endsOn: dayString(closure.ends_on),
        reason: closure.reason ?? null,
      })),
      form: (ctx.session.flashMessages.get('hoursForm') as Row | undefined) ?? null,
    })
  }

  async saveBranchHours(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    await assertOwned(ctx, 'rental_locations', id)
    const { request } = ctx
    const raw = {
      hoursEnabled: bool(request.input('hoursEnabled')),
      // Only open days with filled-in times keep their shifts; a closed or 24-hour day has none.
      schedule: (Array.isArray(request.input('schedule')) ? request.input('schedule') : []).map(
        (day: Row) => ({
          mode: day?.mode,
          shifts:
            day?.mode === 'shifts' && Array.isArray(day.shifts)
              ? day.shifts.filter((item: Row) => item?.opens && item?.closes)
              : [],
        })
      ),
      closures: (Array.isArray(request.input('closures')) ? request.input('closures') : []).map(
        (item: Row) => ({
          startsOn: item?.range?.[0] ?? item?.startsOn ?? '',
          endsOn: item?.range?.[1] ?? item?.endsOn ?? '',
          reason: blank(item?.reason),
        })
      ),
    }
    try {
      const input = await rentalBranchHoursValidator.validate(raw)
      await admin.saveBranchHours(id, input, ctx.admin.id)
      ctx.session.flash('success', 'Working hours saved.')
      const saved = await admin.findLocation(id)
      return ctx.response.redirect(
        saved?.row.provider_id
          ? `/admin/rentals/working-hours?provider=${saved.row.provider_id}`
          : '/admin/rentals/working-hours'
      )
    } catch (error) {
      fail(ctx, error, 'Unable to save the working hours.', 'hoursForm', raw)
      return ctx.response.redirect(`/admin/rentals/locations/${id}/hours`)
    }
  }

  async locationStatus(ctx: HttpContext) {
    await assertOwned(ctx, 'rental_locations', Number(ctx.params.id))
    const raw = ctx.request.input('active')
    const active = [true, 'true', 1, '1', 'on'].includes(raw)
    try {
      await admin.setLocationActive(Number(ctx.params.id), active, ctx.admin.id)
      ctx.session.flash('success', active ? 'Branch activated.' : 'Branch deactivated.')
    } catch (error) {
      fail(ctx, error, 'Unable to update the branch.')
    }
    const returnTo = String(ctx.request.input('returnTo', ''))
    return ctx.response.redirect(
      returnTo.startsWith('/admin/rentals/') ? returnTo : '/admin/rentals/locations'
    )
  }

  async deleteLocation(ctx: HttpContext) {
    await assertOwned(ctx, 'rental_locations', Number(ctx.params.id))
    const found = await admin.findLocation(Number(ctx.params.id))
    try {
      await admin.deleteLocation(Number(ctx.params.id), ctx.admin.id)
      ctx.session.flash('success', 'Branch deleted.')
    } catch (error) {
      fail(ctx, error, 'Unable to delete the branch.')
    }
    return ctx.response.redirect(
      found?.row.provider_id && !portal(ctx)
        ? `/admin/rentals/locations?provider=${found.row.provider_id}`
        : '/admin/rentals/locations'
    )
  }

  // ------------------------------------------------------------ pickup places

  async places(ctx: HttpContext) {
    const rows = await admin.listPlaces()
    return render(ctx, 'places', {
      rows: rows.map((row) => ({
        id: Number(row.id),
        name_en: row.name_en,
        subtitle_en: row.subtitle_en ?? null,
        active: Boolean(row.active),
        sort_order: Number(row.sort_order),
        branch_count: Number(row.branch_count),
      })),
    })
  }

  private async placeForm(ctx: HttpContext, id?: number) {
    const row = id ? await admin.findPlace(id) : null
    if (id && !row) return ctx.response.redirect('/admin/rentals/places')
    return render(ctx, 'place_edit', {
      place: row
        ? {
            id: Number(row.id),
            name_en: row.name_en,
            name_ar: row.name_ar,
            subtitle_en: row.subtitle_en,
            subtitle_ar: row.subtitle_ar,
            latitude: row.latitude === null ? null : Number(row.latitude),
            longitude: row.longitude === null ? null : Number(row.longitude),
            active: Boolean(row.active),
            sort_order: Number(row.sort_order),
          }
        : null,
      form: (ctx.session.flashMessages.get('placeForm') as Row | undefined) ?? null,
    })
  }

  async newPlace(ctx: HttpContext) {
    return this.placeForm(ctx)
  }

  async editPlace(ctx: HttpContext) {
    return this.placeForm(ctx, Number(ctx.params.id))
  }

  async savePlace(ctx: HttpContext) {
    const { request, response, session } = ctx
    const id = ctx.params.id ? Number(ctx.params.id) : undefined
    const raw = {
      nameEn: request.input('nameEn') ?? '',
      nameAr: blank(request.input('nameAr')),
      subtitleEn: blank(request.input('subtitleEn')),
      subtitleAr: blank(request.input('subtitleAr')),
      latitude: optionalNumber(request.input('latitude')),
      longitude: optionalNumber(request.input('longitude')),
      active: bool(request.input('active')),
      sortOrder: optionalNumber(request.input('sortOrder')) ?? 0,
    }
    try {
      const input = await rentalPlaceValidator.validate(raw)
      await admin.savePlace(input, ctx.admin.id, id)
      session.flash('success', id ? 'Place saved.' : 'Place created.')
      return response.redirect('/admin/rentals/places')
    } catch (error) {
      fail(ctx, error, 'Unable to save the place.', 'placeForm', raw)
      return response.redirect(
        id ? `/admin/rentals/places/${id}/edit` : '/admin/rentals/places/new'
      )
    }
  }

  async placeStatus(ctx: HttpContext) {
    const active = [true, 'true', 1, '1', 'on'].includes(ctx.request.input('active'))
    try {
      await admin.setPlaceActive(Number(ctx.params.id), active, ctx.admin.id)
      ctx.session.flash('success', active ? 'Place activated.' : 'Place deactivated.')
    } catch (error) {
      fail(ctx, error, 'Unable to update the place.')
    }
    return ctx.response.redirect('/admin/rentals/places')
  }

  async deletePlace(ctx: HttpContext) {
    try {
      await admin.deletePlace(Number(ctx.params.id), ctx.admin.id)
      ctx.session.flash('success', 'Place deleted.')
    } catch (error) {
      fail(ctx, error, 'Unable to delete the place.')
    }
    return ctx.response.redirect('/admin/rentals/places')
  }

  // ------------------------------------------------------------ settings

  async settings(ctx: HttpContext) {
    return render(ctx, 'settings', {
      settings: await admin.rentalSettings(),
      paymentsConfigured: Boolean(env.get('MYFATOORAH_API_KEY')),
    })
  }

  async saveSettings(ctx: HttpContext) {
    try {
      const input = await rentalSettingsValidator.validate({
        bookingFee: String(ctx.request.input('bookingFee') ?? ''),
        holdMinutes: optionalNumber(ctx.request.input('holdMinutes')),
        minLeadMinutes: optionalNumber(ctx.request.input('minLeadMinutes')),
        maxRentalDays: optionalNumber(ctx.request.input('maxRentalDays')),
        cancellationCutoffHours: optionalNumber(ctx.request.input('cancellationCutoffHours')),
      })
      await admin.saveSettings(input, ctx.admin.id)
      ctx.session.flash('success', 'Rental settings saved.')
    } catch (error) {
      fail(ctx, error, 'Unable to save rental settings.')
    }
    return ctx.response.redirect('/admin/rentals/settings')
  }
}
