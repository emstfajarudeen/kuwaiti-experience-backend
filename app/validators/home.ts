import vine from '@vinejs/vine'

export const homeContentValidator = vine.compile(
  vine.object({
    locale: vine.enum(['en', 'ar']),
    hero_eyebrow: vine.string().trim().maxLength(120),
    hero_title: vine.string().trim().minLength(2).maxLength(200),
    discovery_eyebrow: vine.string().trim().minLength(2).maxLength(120).optional(),
    discovery_title: vine.string().trim().minLength(2).maxLength(200),
    discovery_description: vine.string().trim().minLength(2).maxLength(1000).optional(),
    app_title: vine.string().trim().maxLength(200).nullable().optional(),
    app_body: vine.string().trim().maxLength(10000).nullable().optional(),
  })
)

export const homeCardValidator = vine.compile(
  vine.object({
    place_id: vine.number().positive().withoutDecimals(),
    caption_en: vine.string().trim().maxLength(200).nullable().optional(),
    caption_ar: vine.string().trim().maxLength(200).nullable().optional(),
    sort_order: vine.number().withoutDecimals().min(0).max(9999),
    active: vine.boolean(),
  })
)

export const featuredOrderValidator = vine.compile(
  vine.object({
    featured_order: vine.number().withoutDecimals().min(0).max(9999).nullable(),
  })
)
