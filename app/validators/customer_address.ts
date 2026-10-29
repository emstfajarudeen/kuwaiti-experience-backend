import vine from '@vinejs/vine'

export const createAddressValidator = vine.compile(
  vine.object({
    label: vine.string().trim().minLength(1).maxLength(80),
    address: vine.string().trim().minLength(1).maxLength(500),
    latitude: vine.number().range([-90, 90]),
    longitude: vine.number().range([-180, 180]),
    notes: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

export const updateAddressValidator = vine.compile(
  vine.object({
    label: vine.string().trim().minLength(1).maxLength(80).optional(),
    address: vine.string().trim().minLength(1).maxLength(500).optional(),
    latitude: vine.number().range([-90, 90]).optional(),
    longitude: vine.number().range([-180, 180]).optional(),
    notes: vine.string().trim().maxLength(500).nullable().optional(),
  })
)
