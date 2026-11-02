import vine from '@vinejs/vine'

// Plain text only: block control characters (tabs and line breaks stay allowed in the message).
// eslint-disable-next-line no-control-regex
const noControlChars = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/
// eslint-disable-next-line no-control-regex
const noLineBreaks = /^[^\u0000-\u001F\u007F]*$/

export const notificationBroadcastValidator = vine.compile(
  vine.object({
    request_key: vine
      .string()
      .trim()
      .regex(/^[a-f0-9]{32}$/),
    title: vine.string().trim().minLength(1).maxLength(100).regex(noLineBreaks),
    body: vine.string().trim().minLength(1).maxLength(500).regex(noControlChars),
    audience: vine.enum(['all', 'ios', 'android', 'customer'] as const),
    customer_phone: vine
      .string()
      .trim()
      .regex(/^\+[1-9]\d{6,14}$/)
      .optional()
      .requiredWhen('audience', '=', 'customer'),
  })
)
