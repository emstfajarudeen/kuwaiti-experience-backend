import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { authenticateAdmin, type AdminIdentity } from '../services/auth_service.js'
import { ApiError } from '../services/api_error.js'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    admin: AdminIdentity
  }
}

export default class JwtAdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const authorization = ctx.request.header('authorization')
    const isApi = ctx.request.url().startsWith('/api/')
    if (isApi && ctx.request.cookie('admin_access')) {
      throw new ApiError(
        400,
        'CONFLICTING_AUTH',
        'Cookie authentication is not accepted on API routes'
      )
    }
    if (authorization && ctx.request.cookie('admin_access')) {
      throw new ApiError(400, 'CONFLICTING_AUTH', 'Use only one authentication method')
    }
    const match = authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/)
    const token = isApi ? match?.[1] : (match?.[1] ?? ctx.request.cookie('admin_access'))
    if (!token) {
      if (!isApi) return ctx.response.redirect('/admin/login')
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
    }
    try {
      ctx.admin = await authenticateAdmin(token)
    } catch (error) {
      if (!isApi && error instanceof ApiError && error.status === 401) {
        return ctx.response.redirect('/admin/login')
      }
      throw error
    }
    ctx.response.header('Cache-Control', 'no-store')
    return next()
  }
}
