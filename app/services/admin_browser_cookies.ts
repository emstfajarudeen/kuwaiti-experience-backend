import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'

const cookieOptions = {
  httpOnly: true,
  secure: app.inProduction,
  sameSite: 'lax' as const,
  path: '/admin',
}

export function setAdminCookies(
  response: HttpContext['response'],
  tokens: { accessToken: string; refreshToken: string }
) {
  response.cookie('admin_access', tokens.accessToken, { ...cookieOptions, maxAge: '15m' })
  response.cookie('admin_refresh', tokens.refreshToken, { ...cookieOptions, maxAge: '7d' })
}

export function clearAdminCookies(response: HttpContext['response']) {
  response.clearCookie('admin_access', { path: cookieOptions.path })
  response.clearCookie('admin_refresh', { path: cookieOptions.path })
}
