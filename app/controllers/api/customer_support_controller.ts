import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { canonicalPage, canonicalSettings } from '../../services/customer_content_service.js'
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
    const createdAt = new Date()
    const [id] = await db.table('contact_requests').insert({
      customer_id: identity?.customer.id ?? null,
      full_name: input.full_name,
      email: input.email.toLowerCase(),
      message: input.message,
      status: 'new',
      created_at: createdAt,
    })
    ctx.response.header('Cache-Control', 'no-store')
    return ctx.response.created({ data: { id: Number(id), created_at: createdAt.toISOString() } })
  }
}
