import vine from '@vinejs/vine'

export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().email().maxLength(254),
    password: vine.string().minLength(1).maxLength(200),
  })
)

export const refreshValidator = vine.compile(
  vine.object({
    refreshToken: vine.string().minLength(50).maxLength(200),
  })
)

export const passwordValidator = vine.compile(
  vine.object({
    currentPassword: vine.string().minLength(1).maxLength(200),
    newPassword: vine.string().minLength(14).maxLength(200),
  })
)
