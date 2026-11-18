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

export type BaseUrlRule = {
  platform: 'ios' | 'android'
  version: string
  api_base_url: string
  image_base_url?: string | null
  note?: string | null
}

const configEnvironment = () => env.get('APP_CONFIG_ENVIRONMENT') ?? 'default'
const origin = (value: string) => new URL(value).origin

/** Per-version server addresses, in the order staff listed them. */
export async function readBaseUrlRules(): Promise<BaseUrlRule[]> {
  const rows = await db
    .from('app_base_url_rules')
    .where('environment', configEnvironment())
    .orderBy('sort_order')
    .orderBy('id')
  return rows.map((row) => ({
    platform: row.platform,
    version: row.version,
    api_base_url: row.api_base_url,
    image_base_url: row.image_base_url ?? null,
    note: row.note ?? null,
  }))
}

const segments = (version: string) => version.split('.').map(Number)

/**
 * The most specific rule for this app: "1.1.2" beats "1.1". An app version "1.1" counts as
 * "1.1.0". Returns null when the platform or version is missing or not in `x.y.z` form.
 */
export function matchBaseUrlRule(
  rules: BaseUrlRule[],
  platform: unknown,
  version: unknown
): BaseUrlRule | null {
  if (platform !== 'ios' && platform !== 'android') return null
  if (typeof version !== 'string' || !/^\d+(\.\d+){0,2}$/.test(version.trim())) return null
  const app = segments(version.trim())
  while (app.length < 3) app.push(0)
  let best: BaseUrlRule | null = null
  for (const rule of rules) {
    if (rule.platform !== platform) continue
    const wanted = segments(rule.version)
    if (!wanted.every((part, index) => part === app[index])) continue
    if (!best || wanted.length > segments(best.version).length) best = rule
  }
  return best
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

export async function saveAppConfig(input: AppConfigInput, actorId: number, rules?: BaseUrlRule[]) {
  if (rules) {
    const seen = new Set<string>()
    for (const [index, rule] of rules.entries()) {
      const key = `${rule.platform} ${segments(rule.version).join('.')}`
      if (seen.has(key))
        throw new ApiError(
          422,
          'VALIDATION_ERROR',
          'Each platform and version can be listed once',
          {
            [`base_url_rules.${index}.version`]: ['This platform and version is already listed.'],
          }
        )
      seen.add(key)
      for (const field of ['api_base_url', 'image_base_url'] as const) {
        const value = rule[field]
        if (value && !['http:', 'https:'].includes(new URL(value).protocol))
          throw new ApiError(422, 'VALIDATION_ERROR', 'Server addresses must use HTTP or HTTPS', {
            [`base_url_rules.${index}.${field}`]: ['Use an address starting with https://'],
          })
      }
    }
  }
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
    if (rules) {
      await trx.from('app_base_url_rules').where('environment', environment).delete()
      if (rules.length)
        await trx.table('app_base_url_rules').multiInsert(
          rules.map((rule, index) => ({
            environment,
            platform: rule.platform,
            version: rule.version,
            api_base_url: origin(rule.api_base_url),
            image_base_url: rule.image_base_url ? origin(rule.image_base_url) : null,
            note: rule.note || null,
            sort_order: index,
            created_at: new Date(),
          }))
        )
    }
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

export async function publicAppConfig(
  locale: PublicLocale,
  app: { platform?: unknown; version?: unknown } = {}
) {
  const config = await readAppConfig()
  const defaultUrl = env.get('APP_URL')
  // An app that sends its platform and version can be sent to another server.
  const rule = matchBaseUrlRule(await readBaseUrlRules(), app.platform, app.version)
  return {
    data: {
      environment: env.get('APP_CONFIG_ENVIRONMENT') ?? null,
      api_base_url: rule
        ? origin(rule.api_base_url)
        : origin(env.get('APP_API_BASE_URL') ?? defaultUrl),
      image_base_url: rule
        ? origin(rule.image_base_url || rule.api_base_url)
        : origin(env.get('APP_IMAGE_BASE_URL') ?? defaultUrl),
      base_url_rule: rule ? { platform: rule.platform, version: rule.version } : null,
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
