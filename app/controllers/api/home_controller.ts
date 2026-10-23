import type { HttpContext } from '@adonisjs/core/http'
import { optionalCustomer } from '../../middleware/customer_auth_middleware.js'
import { homePage } from '../../services/home_read_service.js'
import { localizePublicData, publicLocale } from '../../services/public_localization.js'

export default class HomeController {
  async show(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    const locale = publicLocale(ctx.request.input('locale'))
    const result = await homePage(identity?.customer.id)
    return { ...result, data: localizePublicData(result.data, locale) }
  }
}
