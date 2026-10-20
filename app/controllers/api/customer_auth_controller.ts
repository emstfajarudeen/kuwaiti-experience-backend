import type { HttpContext } from '@adonisjs/core/http'
import * as validators from '../../validators/customer.js'
import * as auth from '../../services/customer_auth_service.js'
import { optionalCustomer } from '../../middleware/customer_auth_middleware.js'

export default class CustomerAuthController {
  async request(ctx: HttpContext) {
    await optionalCustomer(ctx)
    const input = await ctx.request.validateUsing(validators.phoneValidator)
    ctx.response.header('Cache-Control', 'no-store')
    return ctx.response.accepted(await auth.requestOtp(input.phone_e164))
  }
  async resend(ctx: HttpContext) {
    await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    return ctx.response.accepted(await auth.requestOtp(undefined, ctx.params.id))
  }
  async verify(ctx: HttpContext) {
    await optionalCustomer(ctx)
    const input = await ctx.request.validateUsing(validators.otpValidator)
    ctx.response.header('Cache-Control', 'no-store')
    return auth.verifyOtp(ctx.params.id, input.code)
  }
  async session(ctx: HttpContext) {
    await optionalCustomer(ctx)
    const input = await ctx.request.validateUsing(validators.verificationValidator)
    ctx.response.header('Cache-Control', 'no-store')
    return auth.exchangeVerification(input.verification_token)
  }
  async register(ctx: HttpContext) {
    await optionalCustomer(ctx)
    const input = await ctx.request.validateUsing(validators.customerRegistrationValidator)
    ctx.response.header('Cache-Control', 'no-store')
    return ctx.response.created(await auth.exchangeVerification(input.verification_token, input))
  }
  async refresh(ctx: HttpContext) {
    await optionalCustomer(ctx)
    const input = await ctx.request.validateUsing(validators.customerRefreshValidator)
    ctx.response.header('Cache-Control', 'no-store')
    return auth.refreshCustomer(input.refresh_token)
  }
  async me({ customerIdentity }: HttpContext) {
    return { data: customerIdentity.customer }
  }
  async logout({ customerIdentity, response }: HttpContext) {
    await auth.logoutCustomer(customerIdentity)
    return response.noContent()
  }
  async destroy({ customerIdentity, response }: HttpContext) {
    await auth.deleteCustomer(customerIdentity)
    return response.noContent()
  }
}
