import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import {
  authenticateAdmin,
  rotateRefreshToken,
  type AdminIdentity,
} from '../services/auth_service.js'
import { clearAdminCookies, setAdminCookies } from '../services/admin_browser_cookies.js'
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
    let admin: AdminIdentity | undefined
    if (token) {
      try {
        admin = await authenticateAdmin(token)
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error
        if (isApi) throw error
        if (authorization) return ctx.response.redirect('/admin/login')
      }
    }
    if (!admin && !isApi && !authorization) {
      // Renew on the original CMS request so a long-open form can still be submitted.
      const refreshToken = ctx.request.cookie('admin_refresh')
      if (refreshToken) {
        try {
          const tokens = await rotateRefreshToken(refreshToken)
          admin = await authenticateAdmin(tokens.accessToken)
          setAdminCookies(ctx.response, tokens)
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 401)) throw error
          clearAdminCookies(ctx.response)
        }
      }
    }
    if (!admin) {
      if (!isApi) return ctx.response.redirect('/admin/login')
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
    }
    ctx.admin = admin
    ctx.response.header('Cache-Control', 'no-store')
    return next()
  }
}
