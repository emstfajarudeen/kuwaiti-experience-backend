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
    // The Arabic text is optional, but it is only useful as a pair.
    title_ar: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(100)
      .regex(noLineBreaks)
      .optional()
      .requiredIfExists('body_ar'),
    body_ar: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(500)
      .regex(noControlChars)
      .optional()
      .requiredIfExists('title_ar'),
    audience: vine.enum(['all', 'ios', 'android', 'customer'] as const),
    // Single-user sends pick the user from a list (customer_id). The phone number is
    // still accepted so existing scripts keep working; the service requires one of them.
    customer_id: vine.number().positive().withoutDecimals().optional(),
    customer_phone: vine
      .string()
      .trim()
      .regex(/^\+[1-9]\d{6,14}$/)
      .optional(),
  })
)
