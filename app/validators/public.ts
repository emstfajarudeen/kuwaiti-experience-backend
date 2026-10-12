import vine from '@vinejs/vine'

export const enquiryValidator = vine.compile(
  vine.object({
    pickupId: vine.number().positive().withoutDecimals(),
    destinationId: vine.number().positive().withoutDecimals(),
    dateTime: vine.string().maxLength(40),
  })
)
