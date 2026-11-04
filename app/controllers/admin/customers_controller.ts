import type { HttpContext } from '@adonisjs/core/http'
import { ApiError } from '../../services/api_error.js'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import { listCustomers, setCustomerActive } from '../../services/customer_management_service.js'
import { profilePhotoKey } from '../../services/customer_photo_service.js'

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
        users: result.rows.map(({ profile_photo_id: photoId, ...user }) => ({
          ...user,
          // The id doubles as a cache-buster: a new upload from the app gets a new id.
          photo_url: photoId ? `/admin/customers/${user.id}/photo?v=${photoId}` : null,
          phone_verified_at: dateValue(user.phone_verified_at),
          created_at: dateValue(user.created_at),
        })),
        meta: result.meta,
      },
      { bodyClass: 'cms-body' }
    )
  }

  /** Streams the photo an app user uploaded from the mobile app. */
  async photo({ params, response }: HttpContext) {
    const row = await db
      .from('customers')
      .where('id', Number(params.id))
      .select('profile_photo_id')
      .first()
    if (!row?.profile_photo_id) throw new ApiError(404, 'NOT_FOUND', 'Profile photo not found')
    const disk = drive.use('local')
    const key = profilePhotoKey(String(row.profile_photo_id))
    if (!(await disk.exists(key))) throw new ApiError(404, 'NOT_FOUND', 'Profile photo not found')
    response.header('Content-Type', 'image/webp')
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('Cache-Control', 'private, max-age=300')
    return response.stream(await disk.getStream(key))
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
