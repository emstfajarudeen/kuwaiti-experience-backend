import type { HttpContext } from '@adonisjs/core/http'
import { optionalCustomer } from '../../middleware/customer_auth_middleware.js'
import { homePage } from '../../services/home_read_service.js'
import { localizePublicData, publicLanguage } from '../../services/public_localization.js'

export default class HomeController {
  async show(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    const locale = publicLanguage(ctx.request.header('accept-language'))
    const requested = Number(ctx.request.input('feed_limit', 10))
    const feedLimit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 30) : 10
    const result = await homePage(identity?.customer.id, locale, feedLimit)
    return { ...result, data: localizePublicData(result.data, locale) }
  }
}
