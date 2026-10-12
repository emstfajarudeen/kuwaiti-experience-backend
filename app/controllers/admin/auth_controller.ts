import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { loginValidator, passwordValidator } from '../../validators/admin_auth.js'
import {
  changePassword,
  loginAdmin,
  rotateRefreshToken,
  revokeSession,
} from '../../services/auth_service.js'

function setCookies(
  response: HttpContext['response'],
  tokens: {
    accessToken: string
    refreshToken: string
  }
) {
  const common = {
    httpOnly: true,
    secure: app.inProduction,
    sameSite: 'lax' as const,
    path: '/admin',
  }
  response.cookie('admin_access', tokens.accessToken, { ...common, maxAge: '15m' })
  response.cookie('admin_refresh', tokens.refreshToken, { ...common, maxAge: '7d' })
}

export default class AdminAuthController {
  async account({ view, admin }: HttpContext) {
    return view.render('admin/account', { admin })
  }

  async password({ request, response, session, admin }: HttpContext) {
    try {
      const input = await request.validateUsing(passwordValidator)
      await changePassword(admin.id, input.currentPassword, input.newPassword)
      response.clearCookie('admin_access', { path: '/admin' })
      response.clearCookie('admin_refresh', { path: '/admin' })
      session.flash('loginError', 'Password changed. Please sign in again.')
      return response.redirect('/admin/login')
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to change password')
      return response.redirect('/admin/account')
    }
  }
  async showLogin({ request, view }: HttpContext) {
    return view.render('admin/login', { canRefresh: Boolean(request.cookie('admin_refresh')) })
  }

  async login({ request, response, session }: HttpContext) {
    try {
      const payload = await request.validateUsing(loginValidator)
      const tokens = await loginAdmin(payload.email, payload.password)
      setCookies(response, tokens)
      return response.redirect('/admin')
    } catch {
      session.flash('loginError', 'Invalid email or password')
      return response.redirect('/admin/login')
    }
  }

  async refresh({ request, response, session }: HttpContext) {
    try {
      const token = request.cookie('admin_refresh')
      if (!token) throw new Error('Missing refresh token')
      setCookies(response, await rotateRefreshToken(token))
      return response.redirect('/admin')
    } catch {
      response.clearCookie('admin_access', { path: '/admin' })
      response.clearCookie('admin_refresh', { path: '/admin' })
      session.flash('loginError', 'Your session expired. Please sign in again.')
      return response.redirect('/admin/login')
    }
  }

  async logout({ admin, response }: HttpContext) {
    await revokeSession(admin.sessionId)
    response.clearCookie('admin_access', { path: '/admin' })
    response.clearCookie('admin_refresh', { path: '/admin' })
    return response.redirect('/admin/login')
  }
}
