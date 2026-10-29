import vine from '@vinejs/vine'

const fields = {
  nameEn: vine.string().trim().minLength(2).maxLength(160),
  nameAr: vine.string().trim().maxLength(160).nullable().optional(),
  active: vine.boolean(),
  sortOrder: vine.number().withoutDecimals().min(0),
}

export const newCountryValidator = vine.compile(
  vine.object({
    code: vine
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/),
    ...fields,
  })
)

export const countryValidator = vine.compile(vine.object(fields))
