import type { HttpContext } from '@adonisjs/core/http'
import {
  loginValidator,
  passwordResetRequestValidator,
  passwordResetValidator,
  passwordValidator,
} from '../../validators/admin_auth.js'
import { clearAdminCookies, setAdminCookies } from '../../services/admin_browser_cookies.js'
import {
  changePassword,
  loginAdmin,
  rotateRefreshToken,
  revokeSession,
} from '../../services/auth_service.js'
import {
  passwordTokenPurpose,
  isPasswordResetToken,
  requestAdminPasswordReset,
  resetAdminPassword,
} from '../../services/admin_password_reset_service.js'

function validationErrors(error: unknown) {
  const validationError = error as { code?: unknown; messages?: unknown }
  if (validationError?.code !== 'E_VALIDATION_ERROR' || !Array.isArray(validationError.messages)) {
    return null
  }
  return (validationError.messages as Array<{ field?: unknown; message?: unknown }>)
    .filter(
      (message): message is { field: string; message: string } =>
        typeof message.field === 'string' && typeof message.message === 'string'
    )
    .reduce<Record<string, string[]>>((errors, message) => {
      errors[message.field] ??= []
      errors[message.field].push(message.message)
      return errors
    }, {})
}

function resetPath(token: string) {
  return isPasswordResetToken(token)
    ? '/admin/reset-password?token=' + encodeURIComponent(token)
    : '/admin/reset-password'
}

export default class AdminAuthController {
  async account({ request, inertia, session, admin }: HttpContext) {
    return inertia.render(
      'auth/account',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async password({ request, response, session, admin }: HttpContext) {
    try {
      const input = await request.validateUsing(passwordValidator)
      await changePassword(admin.id, input.currentPassword, input.newPassword)
      clearAdminCookies(response)
      session.flash('loginNotice', 'Password changed. Please sign in again.')
      return response.redirect('/admin/login')
    } catch (error) {
      const validationError = error as {
        code?: unknown
        messages?: unknown
      }
      if (
        validationError?.code === 'E_VALIDATION_ERROR' &&
        Array.isArray(validationError.messages)
      ) {
        const fieldErrors = (
          validationError.messages as Array<{ field?: unknown; message?: unknown }>
        )
          .filter(
            (message): message is { field: string; message: string } =>
              typeof message.field === 'string' && typeof message.message === 'string'
          )
          .reduce<Record<string, string[]>>((errors, message) => {
            errors[message.field] ??= []
            errors[message.field].push(message.message)
            return errors
          }, {})
        session.flash('inputErrorsBag', fieldErrors)
      }
      session.flash('error', error instanceof Error ? error.message : 'Unable to change password')
      return response.redirect('/admin/account')
    }
  }
  async showLogin({ request, inertia, session }: HttpContext) {
    return inertia.render(
      'auth/login',
      {
        canRefresh: Boolean(request.cookie('admin_refresh')),
        csrfToken: request.csrfToken,
        loginError: (session.flashMessages.get('loginError') as string | undefined) ?? null,
        loginNotice: (session.flashMessages.get('loginNotice') as string | undefined) ?? null,
        email: (session.flashMessages.get('email') as string | undefined) ?? '',
      },
      { bodyClass: 'login-body' }
    )
  }

  async showForgotPassword({ request, inertia, session }: HttpContext) {
    return inertia.render(
      'auth/forgot_password',
      {
        csrfToken: request.csrfToken,
        submitted: session.flashMessages.get('passwordResetRequested') === true,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
      },
      { bodyClass: 'login-body' }
    )
  }

  async requestPasswordReset({ request, response, session }: HttpContext) {
    let input: { email: string }
    try {
      input = await request.validateUsing(passwordResetRequestValidator)
    } catch (error) {
      const fieldErrors = validationErrors(error)
      if (fieldErrors) session.flash('inputErrorsBag', fieldErrors)
      session.flash('error', 'Enter a valid email address.')
      return response.redirect('/admin/forgot-password')
    }

    await requestAdminPasswordReset(input.email)
    session.flash('passwordResetRequested', true)
    return response.redirect('/admin/forgot-password')
  }

  async showResetPassword({ request, inertia, session }: HttpContext) {
    const suppliedToken = String(request.input('token') ?? '')
    const purpose = await passwordTokenPurpose(suppliedToken)
    const tokenValid = purpose !== null
    return inertia.render(
      'auth/reset_password',
      {
        csrfToken: request.csrfToken,
        token: tokenValid ? suppliedToken : '',
        tokenValid,
        invite: purpose === 'invite',
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
      },
      { bodyClass: 'login-body' }
    )
  }

  async resetPassword({ request, response, session }: HttpContext) {
    const suppliedToken = String(request.input('token') ?? '')
    let input: { token: string; newPassword: string; confirmPassword: string }
    try {
      input = await request.validateUsing(passwordResetValidator)
    } catch (error) {
      const fieldErrors = validationErrors(error)
      if (fieldErrors) session.flash('inputErrorsBag', fieldErrors)
      session.flash('error', 'Check the password and try again.')
      return response.redirect(resetPath(suppliedToken))
    }

    if (input.newPassword !== input.confirmPassword) {
      session.flash('inputErrorsBag', { confirmPassword: ['Passwords do not match.'] })
      return response.redirect(resetPath(input.token))
    }

    if (!(await resetAdminPassword(input.token, input.newPassword))) {
      return response.redirect('/admin/reset-password')
    }

    clearAdminCookies(response)
    session.flash('loginNotice', 'Password saved. Please sign in with your new password.')
    return response.redirect('/admin/login')
  }

  async login({ request, response, session, inertia }: HttpContext) {
    try {
      const payload = await request.validateUsing(loginValidator)
      const tokens = await loginAdmin(payload.email, payload.password, { allowProvider: true })
      setAdminCookies(response, tokens)
      // Authentication changes the document layout; load the authenticated shell afresh.
      if (request.header('X-Inertia')) return inertia.location('/admin')
      return response.redirect('/admin')
    } catch {
      session.flash('loginError', 'Invalid email or password')
      session.flash('email', request.input('email'))
      return response.redirect('/admin/login')
    }
  }

  async refresh({ request, response, session, inertia }: HttpContext) {
    try {
      const token = request.cookie('admin_refresh')
      if (!token) throw new Error('Missing refresh token')
      setAdminCookies(response, await rotateRefreshToken(token))
      if (request.header('X-Inertia')) return inertia.location('/admin')
      return response.redirect('/admin')
    } catch {
      clearAdminCookies(response)
      session.flash('loginError', 'Your session expired. Please sign in again.')
      return response.redirect('/admin/login')
    }
  }

  async logout({ admin, response }: HttpContext) {
    await revokeSession(admin.sessionId)
    clearAdminCookies(response)
    return response.redirect('/admin/login')
  }
}
