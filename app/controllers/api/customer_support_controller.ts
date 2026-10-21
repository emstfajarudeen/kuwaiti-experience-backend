import type { HttpContext } from '@adonisjs/core/http'
import { canonicalPage, canonicalSettings } from '../../services/customer_content_service.js'
import { createContactRequest } from '../../services/contact_request_service.js'
import { contactValidator } from '../../validators/customer.js'
import { optionalCustomer } from '../../middleware/customer_auth_middleware.js'

export default class CustomerSupportController {
  async page({ params, request }: HttpContext) {
    return canonicalPage(params.slug, request.input('locale') === 'ar' ? 'ar' : 'en')
  }

  async site() {
    return canonicalSettings()
  }

  async contact(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    const input = await ctx.request.validateUsing(contactValidator)
    const receipt = await createContactRequest(input, identity?.customer.id)
    ctx.response.header('Cache-Control', 'no-store')
    return ctx.response.created({ data: receipt })
  }
}
