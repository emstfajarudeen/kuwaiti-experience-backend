import { randomUUID } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { ApiError } from '#services/api_error'
import { can } from '#services/authorization_service'
import { checkPushConnection } from '#services/customer_notification_service'
import {
  createBroadcast,
  dispatchBroadcast,
  listBroadcasts,
  notificationOverview,
} from '#services/notification_broadcast_service'
import { validationErrorBag } from '#services/validation_error_bag'
import { notificationBroadcastValidator } from '#validators/notification_broadcast'

export default class AdminNotificationsController {
  async index({ inertia, request, session, admin, authorization }: HttpContext) {
    const [overview, history] = await Promise.all([
      notificationOverview(),
      listBroadcasts(request.input('page', 1)),
    ])
    return inertia.render(
      'notifications/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: session.flashMessages.get('success') ?? null,
        error: session.flashMessages.get('error') ?? null,
        canSend: can(authorization, 'notifications.send'),
        // Fresh per page render; consumed by the first successful send.
        requestKey: randomUUID().replaceAll('-', ''),
        overview,
        broadcasts: history.data,
        meta: history.meta,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async send({ request, response, session, admin }: HttpContext) {
    const values = request.only(['request_key', 'title', 'body', 'audience', 'customer_phone'])
    // Tolerate "+965 5000-0000" style input; the validator then enforces strict E.164.
    if (typeof values.customer_phone === 'string')
      values.customer_phone = values.customer_phone.replace(/[\s().-]/g, '')
    if (values.audience !== 'customer' || !values.customer_phone) delete values.customer_phone
    try {
      const input = await notificationBroadcastValidator.validate(values)
      const result = await createBroadcast(input, admin.id)
      if (!result.duplicate) dispatchBroadcast(result.id)
      session.flash(
        'success',
        result.duplicate
          ? 'This notification was already submitted.'
          : 'Notification queued. Delivery status will appear in the history below.'
      )
    } catch (error) {
      const errors =
        validationErrorBag(error) ?? (error instanceof ApiError ? (error.fields ?? null) : null)
      if (errors) session.flash('inputErrorsBag', errors)
      if (!errors && !(error instanceof ApiError))
        logger.error({ err: error }, 'Unable to queue notification broadcast')
      session.flash(
        'error',
        errors
          ? 'Please fix the highlighted fields.'
          : error instanceof ApiError
            ? error.message
            : 'Unable to queue the notification. Please try again.'
      )
    }
    return response.redirect('/admin/notifications')
  }

  async checkConnection({ response, session }: HttpContext) {
    try {
      await checkPushConnection()
      session.flash('success', 'Push connection OK.')
    } catch (error) {
      // Messages come from our own checks or the network layer and never contain secrets.
      session.flash(
        'error',
        `Push connection failed: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
    return response.redirect('/admin/notifications')
  }
}
