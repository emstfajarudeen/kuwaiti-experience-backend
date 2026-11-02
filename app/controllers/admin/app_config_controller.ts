import type { HttpContext } from '@adonisjs/core/http'
import { readAppConfig, saveAppConfig } from '#services/app_config_service'
import { appConfigValidator } from '#validators/app_config'
import { validationErrorBag } from '#services/validation_error_bag'
import env from '#start/env'

export default class AdminAppConfigController {
  async show({ inertia, request, session, admin }: HttpContext) {
    return inertia.render(
      'site/app_config',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: session.flashMessages.get('success') ?? null,
        error: session.flashMessages.get('error') ?? null,
        environment: env.get('APP_CONFIG_ENVIRONMENT') ?? null,
        config: await readAppConfig(),
      },
      { bodyClass: 'cms-body' }
    )
  }

  async update({ request, response, session, admin }: HttpContext) {
    const values = request.only([
      'ios_version',
      'ios_force',
      'ios_store_url',
      'android_version',
      'android_force',
      'android_store_url',
      'update_title_en',
      'update_title_ar',
      'update_message_en',
      'update_message_ar',
      'maintenance_enabled',
      'maintenance_title_en',
      'maintenance_title_ar',
      'maintenance_message_en',
      'maintenance_message_ar',
    ])
    for (const key of [
      'ios_version',
      'ios_store_url',
      'android_version',
      'android_store_url',
      'update_title_ar',
      'update_message_ar',
      'maintenance_title_ar',
      'maintenance_message_ar',
    ] as const) {
      if (typeof values[key] === 'string' && !values[key].trim()) values[key] = null
    }
    try {
      const input = await appConfigValidator.validate(values)
      await saveAppConfig(input, admin.id)
      session.flash('success', 'App configuration saved.')
    } catch (error) {
      const errors = validationErrorBag(error)
      if (errors) session.flash('inputErrorsBag', errors)
      session.flash(
        'error',
        error instanceof Error ? error.message : 'Unable to save app configuration'
      )
    }
    return response.redirect('/admin/app-config')
  }
}
