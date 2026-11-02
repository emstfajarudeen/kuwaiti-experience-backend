import type { HttpContext } from '@adonisjs/core/http'
import { publicAppConfig } from '#services/app_config_service'
import { publicLanguage } from '#services/public_localization'

export default class AppConfigController {
  async show({ request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    response.header('Vary', 'Accept-Language')
    return publicAppConfig(publicLanguage(request.header('accept-language')))
  }
}
