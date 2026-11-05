import vine from '@vinejs/vine'

const clock = () => vine.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/)
const nullableText = (max: number) => vine.string().trim().maxLength(max).nullable().optional()

export const placeExploreValidator = vine.compile(
  vine.object({
    phone_e164: vine
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .nullable()
      .optional(),
    check_in_time: clock().nullable().optional(),
    check_out_time: clock().nullable().optional(),
    screen_count: vine.number().withoutDecimals().min(1).max(1000).nullable().optional(),
    feature_ids: vine.array(vine.number().positive().withoutDecimals()).maxLength(50).optional(),
  })
)

export const featureValidator = vine.compile(
  vine.object({
    type: vine
      .string()
      .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/)
      .maxLength(32),
    code: vine
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .maxLength(80),
    kind: vine.enum(['highlight', 'amenity', 'capability']),
    name_en: vine.string().trim().minLength(1).maxLength(120),
    name_ar: nullableText(120),
    active: vine.boolean(),
    sort_order: vine.number().withoutDecimals().min(0).max(999),
  })
)

export const movieValidator = vine.compile(
  vine.object({
    title_en: vine.string().trim().minLength(1).maxLength(200),
    title_ar: nullableText(200),
    synopsis_en: nullableText(10000),
    synopsis_ar: nullableText(10000),
    duration_minutes: vine.number().withoutDecimals().min(1).max(600).nullable().optional(),
    age_rating: nullableText(30),
    status: vine.enum(['draft', 'published', 'archived']),
  })
)

export const showtimeValidator = vine.compile(
  vine.object({
    place_id: vine.number().positive().withoutDecimals(),
    movie_id: vine.number().positive().withoutDecimals(),
    starts_at: vine
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/),
    format: vine.string().trim().minLength(1).maxLength(80),
    status: vine.enum(['draft', 'published', 'cancelled']),
  })
)
