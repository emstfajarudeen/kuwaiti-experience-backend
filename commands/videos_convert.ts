import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import {
  processWaitingVideos,
  queueExistingVideos,
  retryFailedVideos,
} from '#services/video_processing_service'

/**
 * Converts videos to the app format (H.264, ≤720×1280, ≤30 fps, fast start).
 * New uploads convert on their own; use this for videos uploaded before conversion existed.
 *
 *   node ace videos:convert --existing      # videos never converted
 *   node ace videos:convert --retry-failed  # conversions that failed three times
 */
export default class VideosConvert extends BaseCommand {
  static commandName = 'videos:convert'
  static description = 'Convert stored videos to the phone-friendly MP4 format'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Queue videos uploaded before automatic conversion' })
  declare existing: boolean

  @flags.boolean({ description: 'Also re-convert videos that were already converted' })
  declare all: boolean

  @flags.boolean({ description: 'Queue failed conversions again' })
  declare retryFailed: boolean

  async run() {
    if (this.existing || this.all) {
      const queued = await queueExistingVideos(!this.all)
      this.logger.info(`Queued ${queued} stored video(s)`)
    }
    if (this.retryFailed) {
      const queued = await retryFailedVideos()
      this.logger.info(`Queued ${queued} failed video(s) again`)
    }
    const { converted, failed, missing } = await processWaitingVideos()
    this.logger.success(`Converted ${converted} video(s)`)
    if (failed) this.logger.error(`${failed} video(s) failed to convert; see the errors above`)
    if (missing) {
      this.logger.warning(
        `${missing} video file(s) were not found under ${this.app.makePath('storage/uploads')}. ` +
          'Run this command from the folder the server runs in (for a build: cd build).'
      )
    }
  }
}
