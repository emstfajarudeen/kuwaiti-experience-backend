import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { recountAll } from '#services/video_counter_service'

export default class VideosRecount extends BaseCommand {
  static commandName = 'videos:recount'
  static description =
    'Recount every video comment, like and save total and every comment like total from the real rows'
  static options: CommandOptions = { startApp: true }

  async run() {
    const fixed = await recountAll()
    this.logger.success(
      `Counters recounted. Wrong before: ${fixed.videos} video(s), ${fixed.comments} comment(s).`
    )
  }
}
