import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { ApiError } from '../../services/api_error.js'
import { cmsImageUrl, imageFiles, prepareImages } from '../../services/image_storage_service.js'
import * as admin from '../../services/rental_admin_service.js'
import { refundBooking, syncPayment } from '../../services/rental_payment_service.js'
import { parseSnapshot } from '../../serializers/rental.js'
import { kwd, toFils } from '../../services/rental_money.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'
import {
  rentalBlockValidator,
  rentalLocationValidator,
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
    transmission: row.transmission,
    fuel_type: row.fuel_type,
    seats: Number(row.seats),
    doors: row.doors === null ? null : Number(row.doors),
    bags: row.bags === null ? null : Number(row.bags),
    mileage_limit_km: row.mileage_limit_km === null ? null : Number(row.mileage_limit_km),
    daily_rate: kwd(toFils(row.daily_rate)),
    deposit_amount: kwd(toFils(row.deposit_amount)),
    with_driver_available: Boolean(row.with_driver_available),
    driver_daily_rate: row.driver_daily_rate === null ? null : kwd(toFils(row.driver_daily_rate)),
    min_driver_age: Number(row.min_driver_age),
    quantity: Number(row.quantity),
    insurance_en: row.insurance_en,
    insurance_ar: row.insurance_ar,
    terms_en: row.terms_en,
    terms_ar: row.terms_ar,
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
    days: Number(row.days),
    rental_amount: kwd(toFils(row.rental_amount)),
    deposit_amount: kwd(toFils(row.deposit_amount)),
    booking_fee: kwd(toFils(row.booking_fee)),
    notes: row.notes ?? null,
    hold_expires_at: date(row.hold_expires_at),
    cancelled_by: row.cancelled_by ?? null,
    cancel_reason: row.cancel_reason ?? null,
    created_at: date(row.created_at),
    confirmed_at: date(row.confirmed_at),
    cancelled_at: date(row.cancelled_at),
    completed_at: date(row.completed_at),
  }
}

export default class AdminRentalsController {
  // ------------------------------------------------------------ bookings

  async bookings(ctx: HttpContext) {
    const status = String(ctx.request.input('status', ''))
    const query = String(ctx.request.input('q', '')).trim().slice(0, 120)
    const result = await admin.listBookings({ status, q: query, page: ctx.request.input('page') })
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
    const found = await admin.findBooking(Number(ctx.params.id))
    if (!found) return ctx.response.redirect('/admin/rentals/bookings')
    const snapshot = parseSnapshot(found.row.snapshot)
    return render(ctx, 'booking', {
      booking: {
        ...serializeBooking(found.row),
        pickup_location: snapshot.pickup_location.name_en,
        return_location: snapshot.return_location.name_en,
        provider_phone: snapshot.provider.phone_e164,
      },
      payments: found.payments.map((payment) => ({
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
    return ctx.response.redirect(`/admin/rentals/bookings/${Number(ctx.params.id)}`)
  }

  async completeBooking(ctx: HttpContext) {
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

  async verifyPayment(ctx: HttpContext) {
    return this.bookingAction(
      ctx,
      async () => {
        const found = await admin.findBooking(Number(ctx.params.id))
        const latest = found?.payments[0]
        if (!latest)
          throw new ApiError(409, 'NO_PAYMENT', 'No payment was started for this booking.')
        await syncPayment(String(latest.invoice_id), 'InvoiceId')
      },
      'Payment status refreshed from MyFatoorah.'
    )
  }

  // ------------------------------------------------------------ vehicles

  async vehicles(ctx: HttpContext) {
    const status = String(ctx.request.input('status', ''))
    const query = String(ctx.request.input('q', '')).trim().slice(0, 120)
    const providerId = optionalNumber(ctx.request.input('provider')) ?? undefined
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
      providers: (await admin.vehicleFormOptions()).providers,
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
    const found = id ? await admin.findVehicle(id) : null
    if (id && !found) return ctx.response.redirect('/admin/rentals/vehicles')
    return render(ctx, 'vehicle_edit', {
      vehicle: found
        ? {
            ...serializeVehicle(found.row),
            location_ids: found.locationIds,
            images: found.images.map((image) => ({
              id: Number(image.id),
              url: cmsImageUrl(image.storage_key),
            })),
            blocks: found.blocks.map((block) => ({
              id: Number(block.id),
              starts_at: date(block.starts_at),
              ends_at: date(block.ends_at),
              reason: block.reason ?? null,
            })),
          }
        : null,
      form: (ctx.session.flashMessages.get('vehicleForm') as Row | undefined) ?? null,
      options: await admin.vehicleFormOptions(),
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
    const raw = {
      providerId: optionalNumber(request.input('providerId')),
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
      dailyRate: String(request.input('dailyRate') ?? ''),
      depositAmount: String(request.input('depositAmount') || '0'),
      withDriverAvailable: bool(request.input('withDriverAvailable')),
      driverDailyRate: blank(String(request.input('driverDailyRate') ?? '')),
      minDriverAge: optionalNumber(request.input('minDriverAge')) ?? 21,
      quantity: optionalNumber(request.input('quantity')) ?? 1,
      insuranceEn: blank(request.input('insuranceEn')),
      insuranceAr: blank(request.input('insuranceAr')),
      termsEn: blank(request.input('termsEn')),
      termsAr: blank(request.input('termsAr')),
      locationIds: ids(request.input('locationIds')),
    }
    try {
      const input = await rentalVehicleValidator.validate(raw)
      const images = await prepareImages(ctx.admin.id, {
        cover: imageFiles(request, 'cover'),
        gallery: imageFiles(request, 'gallery', 5),
      })
      const savedId = await admin.saveVehicle(
        input,
        {
          cover: images.cover[0],
          removeCover: bool(request.input('removeCover')),
          gallery: images.gallery,
          removeImageIds: ids(request.input('removeImageIds')),
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
    const status = ctx.request.input('status')
    try {
      if (!['draft', 'published'].includes(status))
        throw new ApiError(422, 'INVALID_STATUS', 'Choose a valid status.')
      await admin.setVehicleStatus(Number(ctx.params.id), status, ctx.admin.id)
      ctx.session.flash(
        'success',
        status === 'published' ? 'Vehicle published.' : 'Vehicle moved to drafts.'
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
    try {
      await admin.deleteVehicle(Number(ctx.params.id), ctx.admin.id)
      ctx.session.flash('success', 'Vehicle deleted.')
      return ctx.response.redirect('/admin/rentals/vehicles')
    } catch (error) {
      fail(ctx, error, 'Unable to delete the vehicle.')
      return ctx.response.redirect(`/admin/rentals/vehicles/${Number(ctx.params.id)}/edit`)
    }
  }

  async addBlock(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    try {
      const input = await rentalBlockValidator.validate({
        startsAt: ctx.request.input('startsAt') ?? '',
        endsAt: ctx.request.input('endsAt') ?? '',
        reason: blank(ctx.request.input('reason')),
      })
      await admin.addBlock(id, input, ctx.admin.id)
      ctx.session.flash('success', 'Unavailable period added.')
    } catch (error) {
      fail(ctx, error, 'Unable to add the unavailable period.')
    }
    return ctx.response.redirect(`/admin/rentals/vehicles/${id}/edit`)
  }

  async removeBlock(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    try {
      await admin.removeBlock(id, Number(ctx.params.blockId), ctx.admin.id)
      ctx.session.flash('success', 'Unavailable period removed.')
    } catch (error) {
      fail(ctx, error, 'Unable to remove the unavailable period.')
    }
    return ctx.response.redirect(`/admin/rentals/vehicles/${id}/edit`)
  }

  // ----------------------------------------------------------- providers

  async providers(ctx: HttpContext) {
    const rows = await admin.listProviders()
    return render(ctx, 'providers', {
      rows: rows.map((row) => ({
        id: Number(row.id),
        name_en: row.name_en,
        phone: row.phone_e164 ?? null,
        email: row.email ?? null,
        active: Boolean(row.active),
        vehicle_count: Number(row.vehicle_count),
        logo_url: cmsImageUrl(row.logo_image_key),
      })),
    })
  }

  private async providerForm(ctx: HttpContext, id?: number) {
    const row = id ? await admin.findProvider(id) : null
    if (id && !row) return ctx.response.redirect('/admin/rentals/providers')
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
    }
    try {
      const input = await rentalProviderValidator.validate(raw)
      const images = await prepareImages(ctx.admin.id, { logo: imageFiles(request, 'logo') })
      await admin.saveProvider(
        input,
        { logo: images.logo[0], removeLogo: bool(request.input('removeLogo')) },
        ctx.admin.id,
        id
      )
      session.flash('success', id ? 'Provider saved.' : 'Provider created.')
      return response.redirect('/admin/rentals/providers')
    } catch (error) {
      fail(ctx, error, 'Unable to save the provider.', 'providerForm', raw)
      return response.redirect(
        id ? `/admin/rentals/providers/${id}/edit` : '/admin/rentals/providers/new'
      )
    }
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

  // ----------------------------------------------------------- locations

  async locations(ctx: HttpContext) {
    const rows = await admin.listLocations()
    return render(ctx, 'locations', {
      rows: rows.map((row) => ({
        id: Number(row.id),
        name_en: row.name_en,
        name_ar: row.name_ar,
        address: row.address,
        active: Boolean(row.active),
        sort_order: Number(row.sort_order),
        vehicle_count: Number(row.vehicle_count),
      })),
    })
  }

  private async locationForm(ctx: HttpContext, id?: number) {
    const row = id ? await admin.findLocation(id) : null
    if (id && !row) return ctx.response.redirect('/admin/rentals/locations')
    return render(ctx, 'location_edit', {
      location: row
        ? {
            id: Number(row.id),
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
    const raw = {
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
      await admin.saveLocation(input, ctx.admin.id, id)
      session.flash('success', id ? 'Location saved.' : 'Location created.')
      return response.redirect('/admin/rentals/locations')
    } catch (error) {
      fail(ctx, error, 'Unable to save the location.', 'locationForm', raw)
      return response.redirect(
        id ? `/admin/rentals/locations/${id}/edit` : '/admin/rentals/locations/new'
      )
    }
  }

  async deleteLocation(ctx: HttpContext) {
    try {
      await admin.deleteLocation(Number(ctx.params.id), ctx.admin.id)
      ctx.session.flash('success', 'Location deleted.')
    } catch (error) {
      fail(ctx, error, 'Unable to delete the location.')
    }
    return ctx.response.redirect('/admin/rentals/locations')
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
