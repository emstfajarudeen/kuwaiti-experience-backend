import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { authenticateCustomer, type CustomerIdentity } from '../services/customer_auth_service.js'
import { ApiError } from '../services/api_error.js'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    customerIdentity: CustomerIdentity
  }
}

export async function optionalCustomer(ctx: HttpContext) {
  if (ctx.request.cookie('admin_access') || ctx.request.cookie('admin_refresh')) {
    throw new ApiError(400, 'CONFLICTING_AUTH', 'Customer APIs do not accept CMS cookies')
  }
  const authorization = ctx.request.header('authorization')
  if (!authorization) return undefined
  const match = authorization.match(/^Bearer (ca_[A-Za-z0-9_-]{64})$/)
  if (!match) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
  return authenticateCustomer(match[1])
}

export default class CustomerAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const identity = await optionalCustomer(ctx)
    if (!identity) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
    ctx.customerIdentity = identity
    ctx.response.header('Cache-Control', 'no-store')
    return next()
  }
}
