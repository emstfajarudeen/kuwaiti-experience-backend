import type { HttpContext } from '@adonisjs/core/http'
import { ApiError } from '../../services/api_error.js'
import { enquiryValidator } from '../../validators/public.js'
import * as content from '../../services/public_content_service.js'
import { assertPlaceType } from '../../services/category_type_service.js'
import { publicLanguage } from '../../services/public_localization.js'

function appLocale(request: HttpContext['request']) {
  const header = request.header('accept-language')
  return header ? publicLanguage(header) : content.localeFrom(request.input('locale'))
}

export default class PublicController {
  async home({ request }: HttpContext) {
    return content.homeContent(appLocale(request))
  }

  async site() {
    return content.publicSettings()
  }

  async categories({ request }: HttpContext) {
    return content.listCategories(await assertPlaceType(request.input('type')), appLocale(request))
  }

  async places({ request }: HttpContext) {
    const page = Number(request.input('page', 1))
    const perPage = Number(request.input('perPage', 12))
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 10000 ||
      !Number.isInteger(perPage) ||
      perPage < 1 ||
      perPage > 50
    ) {
      throw new ApiError(422, 'INVALID_PAGINATION', 'Invalid page or page size')
    }
    const category = request.input('category')
    const q = request.input('q')
    if (
      (category !== undefined && typeof category !== 'string') ||
      (q !== undefined && (typeof q !== 'string' || q.length > 80))
    ) {
      throw new ApiError(422, 'INVALID_FILTER', 'Invalid category or search')
    }
    return content.listPlaces({
      type: await assertPlaceType(request.input('type')),
      category,
      q,
      page,
      perPage,
      locale: appLocale(request),
    })
  }

  async place({ params, request }: HttpContext) {
    return content.showPlace(params.slug, appLocale(request))
  }

  async page({ params, request }: HttpContext) {
    return content.showPage(params.slug, appLocale(request))
  }

  async locations({ request }: HttpContext) {
    return content.transportLocations(appLocale(request))
  }

  async enquiry({ request }: HttpContext) {
    const payload = await request.validateUsing(enquiryValidator)
    return content.transportEnquiry(payload.pickupId, payload.destinationId, payload.dateTime)
  }
}
