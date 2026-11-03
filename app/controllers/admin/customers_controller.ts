import type { HttpContext } from '@adonisjs/core/http'
import { ApiError } from '../../services/api_error.js'
import { listCustomers, setCustomerActive } from '../../services/customer_management_service.js'

function dateValue(value: unknown) {
  return value instanceof Date ? value.toISOString() : value ? String(value) : null
}

export default class AdminCustomersController {
  async index({ request, inertia, session, admin }: HttpContext) {
    const query =
      typeof request.input('q') === 'string' ? request.input('q').trim().slice(0, 120) : ''
    const requestedPage = Number(request.input('page', 1))
    const result = await listCustomers(query, requestedPage)

    return inertia.render(
      'customers/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        query,
        users: result.rows.map((user) => ({
          ...user,
          phone_verified_at: dateValue(user.phone_verified_at),
          created_at: dateValue(user.created_at),
        })),
        meta: result.meta,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async updateStatus({ params, request, response, session, admin }: HttpContext) {
    try {
      const value = request.input('active')
      if (![true, false, 'true', 'false', '1', '0'].includes(value))
        throw new ApiError(422, 'INVALID_STATUS', 'Choose a valid status.')
      const active = value === true || value === 'true' || value === '1'
      await setCustomerActive(params.id, active, admin.id)
      session.flash('success', active ? 'App user activated.' : 'App user deactivated.')
    } catch (error) {
      session.flash(
        'error',
        error instanceof Error ? error.message : 'Unable to update the app user.'
      )
    }
    const returnTo = String(request.input('returnTo', ''))
    return response.redirect(
      returnTo.startsWith('/admin/customers') ? returnTo : '/admin/customers'
    )
  }
}
