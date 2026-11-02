import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { ApiError } from '#services/api_error'
import { localizePublicData, type PublicLocale } from '#services/public_localization'

export const appConfigDefaults = {
  ios_version: null,
  ios_force: false,
  ios_store_url: null,
  android_version: null,
  android_force: false,
  android_store_url: null,
  update_title_en: 'Version update',
  update_title_ar: 'تحديث الإصدار',
  update_message_en:
    'A new version of the app is available. Please update to the latest version for improved performance and new features.',
  update_message_ar:
    'يتوفر إصدار جديد من التطبيق. يرجى التحديث إلى أحدث إصدار للحصول على أداء أفضل وميزات جديدة.',
  maintenance_enabled: false,
  maintenance_title_en: 'App under maintenance',
  maintenance_title_ar: 'التطبيق قيد الصيانة',
  maintenance_message_en:
    "The app is currently undergoing scheduled maintenance. We apologize for the inconvenience. Please be patient—we'll be back shortly.",
  maintenance_message_ar:
    'يخضع التطبيق حالياً لصيانة مجدولة. نعتذر عن الإزعاج، ونرجو التحلي بالصبر. سنعود إليكم قريباً.',
}

export type AppConfigInput = {
  [K in keyof typeof appConfigDefaults]: K extends
    'ios_force' | 'android_force' | 'maintenance_enabled'
    ? boolean
    : K extends
          | 'update_title_en'
          | 'update_message_en'
          | 'maintenance_title_en'
          | 'maintenance_message_en'
      ? string
      : string | null
}

export async function readAppConfig(): Promise<AppConfigInput> {
  const environment = env.get('APP_CONFIG_ENVIRONMENT') ?? 'default'
  const row = await db.from('app_config').where('environment', environment).first()
  const result = { ...appConfigDefaults, ...row }
  return {
    ...result,
    ios_force: Boolean(result.ios_force),
    android_force: Boolean(result.android_force),
    maintenance_enabled: Boolean(result.maintenance_enabled),
  }
}

export async function saveAppConfig(input: AppConfigInput, actorId: number) {
  for (const platform of ['ios', 'android'] as const) {
    const url = input[`${platform}_store_url`]
    if (url && !['http:', 'https:'].includes(new URL(url).protocol)) {
      throw new ApiError(422, 'INVALID_URL', 'Store links must use HTTP or HTTPS')
    }
    if (input[`${platform}_force`] && (!input[`${platform}_version`] || !url)) {
      throw new ApiError(
        422,
        'INVALID_UPDATE_SETTINGS',
        `A version and store link are required for a forced ${platform} update`
      )
    }
  }
  await db.transaction(async (trx) => {
    const environment = env.get('APP_CONFIG_ENVIRONMENT') ?? 'default'
    const existing = await trx
      .from('app_config')
      .where('environment', environment)
      .forUpdate()
      .first()
    const fields = { ...input, updated_at: new Date() }
    if (existing) await trx.from('app_config').where('environment', environment).update(fields)
    else await trx.table('app_config').insert({ environment, ...fields })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'app_config.updated',
      entity_type: 'app_config',
      entity_id: environment,
      created_at: new Date(),
    })
  })
}

export async function publicAppConfig(locale: PublicLocale) {
  const config = await readAppConfig()
  const origin = (value: string) => new URL(value).origin
  const defaultUrl = env.get('APP_URL')
  return {
    data: {
      environment: env.get('APP_CONFIG_ENVIRONMENT') ?? null,
      api_base_url: origin(env.get('APP_API_BASE_URL') ?? defaultUrl),
      image_base_url: origin(env.get('APP_IMAGE_BASE_URL') ?? defaultUrl),
      update: {
        ...(localizePublicData(
          {
            title_en: config.update_title_en,
            title_ar: config.update_title_ar,
            message_en: config.update_message_en,
            message_ar: config.update_message_ar,
          },
          locale
        ) as object),
        ios: {
          version: config.ios_version,
          force: config.ios_force,
          store_url: config.ios_store_url,
        },
        android: {
          version: config.android_version,
          force: config.android_force,
          store_url: config.android_store_url,
        },
      },
      maintenance: {
        enabled: config.maintenance_enabled,
        ...(localizePublicData(
          {
            title_en: config.maintenance_title_en,
            title_ar: config.maintenance_title_ar,
            message_en: config.maintenance_message_en,
            message_ar: config.maintenance_message_ar,
          },
          locale
        ) as object),
      },
    },
  }
}
