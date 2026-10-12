import type { HttpContext } from '@adonisjs/core/http'
import { loginValidator, refreshValidator, passwordValidator } from '../../validators/admin_auth.js'
import {
  loginAdmin,
  rotateRefreshToken,
  revokeSession,
  changePassword,
} from '../../services/auth_service.js'

export default class AuthController {
  async login({ request, response }: HttpContext) {
    const payload = await request.validateUsing(loginValidator)
    const tokens = await loginAdmin(payload.email, payload.password)
    response.header('Cache-Control', 'no-store')
    return { data: tokens }
  }

  async refresh({ request, response }: HttpContext) {
    const payload = await request.validateUsing(refreshValidator)
    const tokens = await rotateRefreshToken(payload.refreshToken)
    response.header('Cache-Control', 'no-store')
    return { data: tokens }
  }

  async me({ admin }: HttpContext) {
    return { data: { id: admin.id, name: admin.fullName, email: admin.email } }
  }

  async logout({ admin, response }: HttpContext) {
    await revokeSession(admin.sessionId)
    return response.noContent()
  }

  async password({ request, admin, response }: HttpContext) {
    const payload = await request.validateUsing(passwordValidator)
    await changePassword(admin.id, payload.currentPassword, payload.newPassword)
    return response.noContent()
  }
}
