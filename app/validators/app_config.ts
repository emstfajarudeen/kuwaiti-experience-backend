import vine from '@vinejs/vine'

const version = () =>
  vine
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/)
    .maxLength(32)
    .nullable()
const link = () => vine.string().trim().url().maxLength(500).nullable()
const title = () => vine.string().trim().minLength(1).maxLength(200)
const message = () => vine.string().trim().minLength(1).maxLength(2000)

export const appConfigValidator = vine.compile(
  vine.object({
    ios_version: version(),
    ios_force: vine.boolean(),
    ios_store_url: link(),
    android_version: version(),
    android_force: vine.boolean(),
    android_store_url: link(),
    update_title_en: title(),
    update_title_ar: title().nullable(),
    update_message_en: message(),
    update_message_ar: message().nullable(),
    maintenance_enabled: vine.boolean(),
    maintenance_title_en: title(),
    maintenance_title_ar: title().nullable(),
    maintenance_message_en: message(),
    maintenance_message_ar: message().nullable(),
  })
)
