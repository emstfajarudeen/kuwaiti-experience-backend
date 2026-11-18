import type { HttpContext } from '@adonisjs/core/http'
import { readAppConfig, readBaseUrlRules, saveAppConfig } from '#services/app_config_service'
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
        config: { ...(await readAppConfig()), base_url_rules: await readBaseUrlRules() },
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
      'base_url_rules',
    ])
    // Blank optional fields in the address rules mean "none".
    if (Array.isArray(values.base_url_rules))
      values.base_url_rules = values.base_url_rules.map((rule: Record<string, unknown>) => ({
        ...rule,
        image_base_url:
          typeof rule?.image_base_url === 'string' && rule.image_base_url.trim()
            ? rule.image_base_url
            : null,
        note: typeof rule?.note === 'string' && rule.note.trim() ? rule.note : null,
      }))
    else values.base_url_rules = []
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
      const { base_url_rules: rules, ...input } = await appConfigValidator.validate(values)
      await saveAppConfig(input, admin.id, rules ?? [])
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
