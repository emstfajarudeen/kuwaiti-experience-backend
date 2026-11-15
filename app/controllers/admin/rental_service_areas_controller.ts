import type { HttpContext } from '@adonisjs/core/http'
import { ApiError } from '../../services/api_error.js'
import * as areas from '../../services/rental_service_area_service.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'
import { rentalServiceAreaValidator } from '../../validators/rentals.js'

type Row = Record<string, any>

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

const LIST = '/admin/rentals/service-areas'

function fail(ctx: HttpContext, error: unknown, fallback: string, form?: Row) {
  const fields = validationErrorBag(error) ?? (error instanceof ApiError ? error.fields : null)
  if (fields) ctx.session.flash('inputErrorsBag', fields)
  ctx.session.flash(
    'error',
    fields ? 'Check the highlighted fields.' : error instanceof Error ? error.message : fallback
  )
  if (form) ctx.session.flash('areaForm', form)
}

const render = (ctx: HttpContext, page: string, props: Row) =>
  ctx.inertia.render(
    `rentals/${page}` as any,
    {
      adminName: ctx.admin.fullName,
      csrfToken: ctx.request.csrfToken,
      success: (ctx.session.flashMessages.get('success') as string | undefined) ?? null,
      error: (ctx.session.flashMessages.get('error') as string | undefined) ?? null,
      ...props,
    },
    { bodyClass: 'cms-body' }
  )

/** Service areas for pickup at the customer's address (with-driver bookings). */
export default class RentalServiceAreasController {
  async index(ctx: HttpContext) {
    const rows = await areas.listAreas()
    return render(ctx, 'service_areas', {
      rows: rows.map((row) => ({
        id: Number(row.id),
        name_en: row.name_en,
        name_ar: row.name_ar ?? null,
        active: Boolean(row.active),
        sort_order: Number(row.sort_order),
        excluded_count: Number(row.excluded_count),
      })),
      maxDistanceKm: areas.MAX_AREA_DISTANCE_KM,
    })
  }

  private async form(ctx: HttpContext, id?: number) {
    const row = id ? await areas.findArea(id) : null
    if (id && !row) return ctx.response.redirect(LIST)
    return render(ctx, 'service_area_edit', {
      area: row
        ? {
            id: Number(row.id),
            name_en: row.name_en,
            name_ar: row.name_ar ?? null,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            active: Boolean(row.active),
            sort_order: Number(row.sort_order),
          }
        : null,
      form: (ctx.session.flashMessages.get('areaForm') as Row | undefined) ?? null,
    })
  }

  async create(ctx: HttpContext) {
    return this.form(ctx)
  }

  async edit(ctx: HttpContext) {
    return this.form(ctx, Number(ctx.params.id))
  }

  async save(ctx: HttpContext) {
    const { request, response, session } = ctx
    const id = ctx.params.id ? Number(ctx.params.id) : undefined
    const raw = {
      nameEn: request.input('nameEn') ?? '',
      nameAr: blank(request.input('nameAr')),
      latitude: optionalNumber(request.input('latitude')),
      longitude: optionalNumber(request.input('longitude')),
      active: bool(request.input('active')),
      sortOrder: optionalNumber(request.input('sortOrder')) ?? 0,
    }
    try {
      const input = await rentalServiceAreaValidator.validate(raw)
      await areas.saveArea(input, ctx.admin.id, id)
      session.flash('success', id ? 'Area saved.' : 'Area created.')
      return response.redirect(LIST)
    } catch (error) {
      fail(ctx, error, 'Unable to save the area.', raw)
      return response.redirect(id ? `${LIST}/${id}/edit` : `${LIST}/new`)
    }
  }

  async status(ctx: HttpContext) {
    const active = bool(ctx.request.input('active'))
    try {
      await areas.setAreaActive(Number(ctx.params.id), active, ctx.admin.id)
      ctx.session.flash('success', active ? 'Area activated.' : 'Area deactivated.')
    } catch (error) {
      fail(ctx, error, 'Unable to update the area.')
    }
    return ctx.response.redirect(LIST)
  }

  async destroy(ctx: HttpContext) {
    try {
      await areas.deleteArea(Number(ctx.params.id), ctx.admin.id)
      ctx.session.flash('success', 'Area deleted.')
    } catch (error) {
      fail(ctx, error, 'Unable to delete the area.')
    }
    return ctx.response.redirect(LIST)
  }
}
