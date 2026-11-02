import type { HttpContext } from '@adonisjs/core/http'
import * as notifications from '../../services/customer_notification_service.js'
import { pushTokenValidator } from '../../validators/customer_notification.js'

export default class CustomerNotificationsController {
  async index({ request, customerIdentity }: HttpContext) {
    return notifications.listNotifications(customerIdentity.customer.id, request.qs())
  }

  async markRead({ params, customerIdentity }: HttpContext) {
    return notifications.markNotificationRead(customerIdentity.customer.id, params.id)
  }

  async markAllRead({ response, customerIdentity }: HttpContext) {
    await notifications.markAllNotificationsRead(customerIdentity.customer.id)
    return response.noContent()
  }

  async registerToken({ request, response, customerIdentity }: HttpContext) {
    const input = await request.validateUsing(pushTokenValidator)
    return response.created(await notifications.registerPushToken(customerIdentity.customer.id, input))
  }

  async removeToken({ params, response, customerIdentity }: HttpContext) {
    await notifications.removePushToken(customerIdentity.customer.id, params.id)
    return response.noContent()
  }
}
