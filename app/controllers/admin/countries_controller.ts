import type { HttpContext } from '@adonisjs/core/http'
import {
  countryByCode,
  createCountry,
  deleteCountry,
  listCountries,
  updateCountry,
  updateCountryStatus,
} from '../../services/country_service.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'
import { countryValidator, newCountryValidator } from '../../validators/countries.js'

function formInput(request: HttpContext['request']) {
  return {
    nameEn: request.input('nameEn'),
    nameAr: request.input('nameAr') || null,
    active:
      request.input('active') === true ||
      request.input('active') === 'true' ||
      request.input('active') === '1',
    sortOrder: Number(request.input('sortOrder')),
  }
}

function safeForm(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  return {
    code: typeof data.code === 'string' ? data.code : null,
    nameEn: typeof data.nameEn === 'string' ? data.nameEn : null,
    nameAr: typeof data.nameAr === 'string' ? data.nameAr : null,
    active: data.active === true || data.active === 'true' || data.active === '1',
    sortOrder: typeof data.sortOrder === 'string' ? data.sortOrder : null,
  }
}

export default class AdminCountriesController {
  async index({ inertia, request, session, admin }: HttpContext) {
    const countries = await listCountries()
    return inertia.render(
      'countries/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        rows: countries.map((country) => ({
          code: country.code,
          name_en: country.name_en,
          name_ar: country.name_ar,
          active: Boolean(country.active),
          sort_order: Number(country.sort_order),
        })),
      },
      { bodyClass: 'cms-body' }
    )
  }

  async create({ inertia, request, session, admin }: HttpContext) {
    return inertia.render(
      'countries/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: safeForm(session.flashMessages.get('countryForm')),
        country: null,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async edit({ params, inertia, request, response, session, admin }: HttpContext) {
    const country = await countryByCode(params.code)
    if (!country) return response.redirect('/admin/countries')
    return inertia.render(
      'countries/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: safeForm(session.flashMessages.get('countryForm')),
        country: {
          code: country.code,
          name_en: country.name_en,
          name_ar: country.name_ar,
          active: Boolean(country.active),
          sort_order: Number(country.sort_order),
        },
      },
      { bodyClass: 'cms-body' }
    )
  }

  async save({ params, request, response, session, admin }: HttpContext) {
    try {
      if (params.code) {
        const input = await countryValidator.validate(formInput(request))
        await updateCountry(params.code, input, admin.id)
        session.flash('success', 'Country saved.')
      } else {
        const input = await newCountryValidator.validate({
          ...formInput(request),
          code: String(request.input('code') || '')
            .trim()
            .toUpperCase(),
        })
        await createCountry(input, admin.id)
        session.flash('success', 'Country created.')
      }
      return response.redirect('/admin/countries')
    } catch (error) {
      const fieldErrors = validationErrorBag(error)
      if (fieldErrors) session.flash('inputErrorsBag', fieldErrors)
      session.flash('error', error instanceof Error ? error.message : 'Unable to save country.')
      session.flash(
        'countryForm',
        request.only(['code', 'nameEn', 'nameAr', 'active', 'sortOrder'])
      )
      return response.redirect(
        params.code
          ? `/admin/countries/${encodeURIComponent(params.code)}/edit`
          : '/admin/countries/new'
      )
    }
  }

  async destroy({ params, response, session, admin }: HttpContext) {
    try {
      await deleteCountry(params.code, admin.id)
      session.flash('success', 'Country deleted.')
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to delete country.')
    }
    return response.redirect('/admin/countries')
  }

  async updateStatus({ params, request, response, session, admin }: HttpContext) {
    try {
      const value = request.input('active')
      if (![true, false, 'true', 'false', '1', '0'].includes(value)) {
        throw new Error('Choose a valid country status.')
      }
      const active = value === true || value === 'true' || value === '1'
      await updateCountryStatus(params.code, active, admin.id)
      session.flash('success', `Country ${active ? 'activated' : 'deactivated'}.`)
    } catch (error) {
      session.flash(
        'error',
        error instanceof Error ? error.message : 'Unable to update country status.'
      )
    }
    return response.redirect('/admin/countries')
  }
}
