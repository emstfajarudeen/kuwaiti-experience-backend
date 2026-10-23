import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { optionalCustomer } from '../../middleware/customer_auth_middleware.js'
import * as read from '../../services/explore_read_service.js'
import * as write from '../../services/explore_write_service.js'
import { localizePublicData, publicLocale } from '../../services/public_localization.js'

export default class ExploreController {
  async hub(ctx: HttpContext) {
    await optionalCustomer(ctx)
    return read.exploreHub()
  }
  async categories(ctx: HttpContext) {
    await optionalCustomer(ctx)
    const locale = publicLocale(ctx.request.input('locale'))
    const result = await read.categories(ctx.request.input('type'))
    return { ...result, data: localizePublicData(result.data, locale) }
  }
  async features(ctx: HttpContext) {
    await optionalCustomer(ctx)
    return read.features(ctx.request.input('type'))
  }
  async places(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    const locale = publicLocale(ctx.request.input('locale'))
    const result = await read.places(ctx.request.qs(), identity?.customer.id)
    return { ...result, data: localizePublicData(result.data, locale) }
  }
  async place(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    return read.showPlace(ctx.params.slug, identity?.customer.id)
  }
  async showtimes(ctx: HttpContext) {
    await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    return read.showtimes(ctx.request.qs(), ctx.params.slug)
  }
  async saved({ request, customerIdentity }: HttpContext) {
    return read.places(request.qs(), customerIdentity.customer.id, false, true)
  }
  async save({ params, customerIdentity }: HttpContext) {
    return write.savePlaceBookmark(customerIdentity.customer.id, read.positiveId(params.id))
  }
  async unsave({ params, customerIdentity, response }: HttpContext) {
    await db
      .from('customer_saved_places')
      .where({ customer_id: customerIdentity.customer.id, place_id: read.positiveId(params.id) })
      .delete()
    return response.noContent()
  }
}
