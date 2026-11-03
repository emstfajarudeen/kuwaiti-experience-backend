import vine from '@vinejs/vine'

export const videoValidator = vine.compile(
  vine.object({
    captionEn: vine.string().trim().minLength(2).maxLength(1000),
    captionAr: vine.string().trim().maxLength(1000).nullable(),
    categoryId: vine.number().withoutDecimals().positive().nullable(),
    placeId: vine.number().withoutDecimals().positive().nullable(),
    phone: vine
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/)
      .nullable(),
    locationNameEn: vine.string().trim().maxLength(200).nullable(),
    locationNameAr: vine.string().trim().maxLength(200).nullable(),
    latitude: vine.number().min(-90).max(90).nullable(),
    longitude: vine.number().min(-180).max(180).nullable(),
  })
)
