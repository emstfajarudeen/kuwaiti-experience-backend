import vine from '@vinejs/vine'

export const pushTokenValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1).maxLength(4096),
    platform: vine.enum(['ios', 'android'] as const),
    device_id: vine.string().trim().minLength(1).maxLength(128).optional(),
  })
)
