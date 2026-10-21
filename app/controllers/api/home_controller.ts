import type { HttpContext } from '@adonisjs/core/http'
import { optionalCustomer } from '../../middleware/customer_auth_middleware.js'
import { homePage } from '../../services/home_read_service.js'

export default class HomeController {
  async show(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    return homePage(identity?.customer.id)
  }
}
