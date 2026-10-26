import vine from '@vinejs/vine'

const userFields = {
  fullName: vine.string().trim().minLength(2).maxLength(120),
  email: vine.string().trim().email().maxLength(254),
}

export const createAdminUserValidator = vine.compile(
  vine.object({
    ...userFields,
    password: vine.string().minLength(14).maxLength(200),
    roleIds: vine
      .array(
        vine
          .string()
          .trim()
          .regex(/^[1-9][0-9]*$/)
      )
      .minLength(1),
  })
)

export const updateAdminUserValidator = vine.compile(
  vine.object({
    ...userFields,
    active: vine.boolean(),
    roleIds: vine
      .array(
        vine
          .string()
          .trim()
          .regex(/^[1-9][0-9]*$/)
      )
      .minLength(1),
  })
)
