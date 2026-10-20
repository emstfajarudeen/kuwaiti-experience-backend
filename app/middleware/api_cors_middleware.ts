import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

const allowedOrigins = new Set(
  (env.get('CORS_ORIGINS') ?? 'https://thekuwaitiexperience.com')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
)

export default class ApiCorsMiddleware {
  handle(ctx: HttpContext, next: NextFn) {
    if (!/^\/api\/v[12]\//.test(ctx.request.url())) return next()
    if (ctx.request.url().startsWith('/api/v2/')) ctx.response.header('Cache-Control', 'no-store')

    ctx.response.header('Vary', 'Origin')
    const origin = ctx.request.header('origin')
    if (!origin || !allowedOrigins.has(origin)) return next()

    ctx.response.header('Access-Control-Allow-Origin', origin)
    if (ctx.request.method() === 'OPTIONS') {
      ctx.response.header(
        'Access-Control-Allow-Methods',
        'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'
      )
      ctx.response.header('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type')
      ctx.response.header('Access-Control-Max-Age', '600')
      return ctx.response.noContent()
    }

    return next()
  }
}
