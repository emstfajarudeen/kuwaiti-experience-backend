import type { HttpContext } from '@adonisjs/core/http'
import { ApiError } from '../../services/api_error.js'
import { imageFiles, prepareImages } from '../../services/image_storage_service.js'
import { saveHome, setHeroImage } from '../../services/site_content_service.js'
import { showPlace, positiveId } from '../../services/explore_read_service.js'
import { adminHome, adminCard, adminCards, homeLocale } from '../../services/home_read_service.js'
import {
  deleteHomeCard,
  saveFeaturedOrder,
  saveHomeCard,
} from '../../services/home_write_service.js'
import {
  featuredOrderValidator,
  homeCardValidator,
  homeContentValidator,
} from '../../validators/home.js'

export default class AdminHomeController {
  async home({ request }: HttpContext) {
    return adminHome(request.input('locale'))
  }

  async updateHome(ctx: HttpContext) {
    const input = await ctx.request.validateUsing(homeContentValidator)
    await saveHome(
      {
        locale: input.locale,
        heroEyebrow: input.hero_eyebrow,
        heroTitle: input.hero_title,
        discoveryEyebrow: input.discovery_eyebrow,
        discoveryTitle: input.discovery_title,
        discoveryDescription: input.discovery_description,
        appTitle: input.app_title,
        appBody: input.app_body,
      },
      ctx.admin.id
    )
    return adminHome(input.locale)
  }

  async hero(ctx: HttpContext) {
    const locale = homeLocale(ctx.request.input('locale'))
    const { image } = await prepareImages(ctx.admin.id, { image: imageFiles(ctx.request, 'file') })
    if (!image[0]) throw new ApiError(422, 'INVALID_IMAGE', 'Attach a hero image')
    await setHeroImage(locale, image[0], ctx.admin.id)
    return adminHome(locale)
  }

  async removeHero({ request, admin, response }: HttpContext) {
    await setHeroImage(homeLocale(request.input('locale')), 'remove', admin.id)
    return response.noContent()
  }

  async cards({ request }: HttpContext) {
    return adminCards(request.qs())
  }

  async card({ params }: HttpContext) {
    return adminCard(params.id)
  }

  async saveCard(ctx: HttpContext) {
    const input = await ctx.request.validateUsing(homeCardValidator)
    const id = await saveHomeCard(
      input,
      ctx.admin.id,
      ctx.params.id ? positiveId(ctx.params.id) : undefined
    )
    const result = await adminCard(id)
    return ctx.params.id ? result : ctx.response.created(result)
  }

  async deleteCard({ params, admin, response }: HttpContext) {
    await deleteHomeCard(positiveId(params.id), admin.id)
    return response.noContent()
  }

  async featured({ params, request, admin }: HttpContext) {
    const input = await request.validateUsing(featuredOrderValidator)
    const id = positiveId(params.id)
    await saveFeaturedOrder(id, input.featured_order, admin.id)
    return showPlace(id, undefined, true)
  }
}
