import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { assertPushConfigured, deliverPushBatch } from '#services/customer_notification_service'

export default class NotificationsDeliverPush extends BaseCommand {
  static commandName = 'notifications:deliver-push'
  static description = 'Deliver queued customer notification pushes through Firebase Cloud Messaging'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Keep polling the durable push outbox' })
  declare watch: boolean

  async run() {
    assertPushConfigured()
    do {
      try {
        const delivered = await deliverPushBatch()
        if (!delivered && this.watch) await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        this.logger.error({ err: error }, 'Push notification delivery worker failed')
        if (!this.watch) throw error
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    } while (this.watch)
  }
}
