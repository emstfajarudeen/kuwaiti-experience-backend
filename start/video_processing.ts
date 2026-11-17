/*
|--------------------------------------------------------------------------
| Video conversion
|--------------------------------------------------------------------------
|
| Uploads start converting right away (see video_admin_service). This picks up
| anything left waiting, for example a conversion interrupted by a restart.
|
*/
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { dispatchVideoProcessing } from '#services/video_processing_service'

if (env.get('NODE_ENV') !== 'test') {
  const sweep = () => {
    try {
      dispatchVideoProcessing()
    } catch (error) {
      logger.error({ err: error }, 'Video conversion sweep failed')
    }
  }
  setTimeout(sweep, 10_000).unref()
  setInterval(sweep, 5 * 60_000).unref()
}
