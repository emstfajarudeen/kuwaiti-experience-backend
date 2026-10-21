import vine from '@vinejs/vine'

export const phoneValidator = vine.compile(
  vine.object({
    phone_e164: vine
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/),
  })
)
export const otpValidator = vine.compile(
  vine.object({
    code: vine.string().regex(/^\d{4}$/),
  })
)
export const verificationValidator = vine.compile(
  vine.object({
    verification_token: vine.string().minLength(60).maxLength(100),
  })
)
export const customerRegistrationValidator = vine.compile(
  vine.object({
    verification_token: vine.string().minLength(60).maxLength(100),
    first_name: vine.string().trim().minLength(1).maxLength(120),
    last_name: vine.string().trim().minLength(1).maxLength(120),
    email: vine.string().trim().email().maxLength(254).nullable().optional(),
  })
)
export const customerRefreshValidator = vine.compile(
  vine.object({
    refresh_token: vine.string().minLength(60).maxLength(100),
  })
)
export const contactValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(1).maxLength(120),
    email: vine.string().trim().email().maxLength(254),
    phone_number: vine
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{7,14}$/)
      .nullable()
      .optional(),
    inquiry_type: vine.string().trim().minLength(1).maxLength(120).nullable().optional(),
    message: vine.string().trim().minLength(1).maxLength(300),
  })
)
export const contactStatusValidator = vine.compile(
  vine.object({
    status: vine.enum(['new', 'in_progress', 'resolved']),
  })
)

export const customerProfileValidator = vine.compile(
  vine.object({
    first_name: vine.string().trim().minLength(1).maxLength(120).optional(),
    last_name: vine.string().trim().minLength(1).maxLength(120).optional(),
    email: vine.string().trim().email().maxLength(254).nullable().optional(),
    phone_e164: vine
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/)
      .optional(),
    phone_verification_token: vine.string().minLength(60).maxLength(100).optional(),
  })
)
