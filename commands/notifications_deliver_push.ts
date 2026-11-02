import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { assertPushConfigured, deliverPushBatch } from '#services/customer_notification_service'
import { processPendingBroadcasts } from '#services/notification_broadcast_service'

export default class NotificationsDeliverPush extends BaseCommand {
  static commandName = 'notifications:deliver-push'
  static description =
    'Fan out CMS broadcasts and deliver queued customer notification pushes through Firebase Cloud Messaging'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Keep polling the durable push outbox' })
  declare watch: boolean

  async run() {
    assertPushConfigured()
    do {
      try {
        // Fan CMS broadcasts out into the outbox first, then deliver whatever is queued.
        const fannedOut = await processPendingBroadcasts()
        const delivered = await deliverPushBatch()
        if (!delivered && !fannedOut && this.watch)
          await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        this.logger.error(error instanceof Error ? error.message : String(error))
        if (!this.watch) throw error
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    } while (this.watch)
  }
}
