import type { HttpContext } from '@adonisjs/core/http'
import { listCustomers } from '../../services/customer_management_service.js'

function dateValue(value: unknown) {
  return value instanceof Date ? value.toISOString() : value ? String(value) : null
}

export default class AdminCustomersController {
  async index({ request, inertia, admin }: HttpContext) {
    const query =
      typeof request.input('q') === 'string' ? request.input('q').trim().slice(0, 120) : ''
    const requestedPage = Number(request.input('page', 1))
    const result = await listCustomers(query, requestedPage)

    return inertia.render(
      'customers/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
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
}
