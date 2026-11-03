import { createHash } from 'node:crypto'
import limiter from '@adonisjs/limiter/services/main'

export const bookmarkThrottle = limiter.define('customer-bookmarks', (ctx) =>
  limiter
    .allowRequests(120)
    .every('1 minute')
    .usingKey(`bookmarks:${ctx.customerIdentity.customer.id}`)
)

export const videoActionThrottle = limiter.define('video-actions', (ctx) =>
  limiter
    .allowRequests(120)
    .every('1 minute')
    .usingKey(`video-actions:${ctx.customerIdentity.customer.id}`)
)

export const videoCommentThrottle = limiter.define('video-comments', (ctx) =>
  limiter
    .allowRequests(20)
    .every('1 minute')
    .usingKey(`video-comments:${ctx.customerIdentity.customer.id}`)
)

export const customerAddressThrottle = limiter.define('customer-addresses', (ctx) =>
  limiter
    .allowRequests(120)
    .every('1 minute')
    .usingKey(`customer-addresses:${ctx.customerIdentity.customer.id}`)
)

export const customerNotificationThrottle = limiter.define('customer-notifications', (ctx) =>
  limiter
    .allowRequests(120)
    .every('1 minute')
    .usingKey(`customer-notifications:${ctx.customerIdentity.customer.id}`)
)

export const customerPhotoThrottle = limiter.define('customer-profile-photo', (ctx) =>
  limiter
    .allowRequests(20)
    .every('1 hour')
    .usingKey(`customer-photo:${ctx.customerIdentity.customer.id}`)
)

export const customerAuthThrottle = limiter.define('customer-auth', (ctx) => {
  const candidates = [
    ['challenge', ctx.params.id],
    ['phone', ctx.request.input('phone_e164')],
    ['verification', ctx.request.input('verification_token')],
    ['refresh', ctx.request.input('refresh_token')],
  ] as const
  const subject = candidates.find(([, value]) => typeof value === 'string' && value.length > 0)
  const key = subject
    ? createHash('sha256').update(`${subject[0]}:${subject[1]}`).digest('hex')
    : 'invalid-request'
  return limiter
    .allowRequests(30)
    .every('1 minute')
    .blockFor('5 minutes')
    .usingKey(`customer-auth:${ctx.request.ip()}:${key}`)
})
export const contactThrottle = limiter.define('customer-contact', (ctx) =>
  limiter.allowRequests(5).every('1 hour').usingKey(`customer-contact:${ctx.request.ip()}`)
)

export const authThrottle = limiter.define('admin-auth', (ctx) =>
  limiter
    .allowRequests(10)
    .every('1 minute')
    .blockFor('15 minutes')
    .usingKey(`admin-auth:${ctx.request.ip()}`)
)

// A broadcast can reach every customer, so keep it deliberately scarce per staff member.
export const notificationBroadcastThrottle = limiter.define('admin-notification-broadcast', (ctx) =>
  limiter.allowRequests(10).every('1 hour').usingKey(`admin-notification-broadcast:${ctx.admin.id}`)
)

export const pushConnectionCheckThrottle = limiter.define('admin-push-connection-check', (ctx) =>
  limiter
    .allowRequests(10)
    .every('5 minutes')
    .usingKey(`admin-push-connection-check:${ctx.admin.id}`)
)

export const passwordResetRequestThrottle = limiter.define(
  'admin-password-reset-request',
  (ctx) => {
    const email = String(ctx.request.input('email') ?? '')
      .trim()
      .toLowerCase()
    const emailHash = createHash('sha256').update(email).digest('hex')
    return limiter
      .allowRequests(5)
      .every('1 hour')
      .blockFor('1 hour')
      .usingKey(`admin-password-reset-request:${ctx.request.ip()}:${emailHash}`)
  }
)

export const passwordResetConfirmThrottle = limiter.define('admin-password-reset-confirm', (ctx) =>
  limiter
    .allowRequests(10)
    .every('15 minutes')
    .blockFor('30 minutes')
    .usingKey(`admin-password-reset-confirm:${ctx.request.ip()}`)
)

export const enquiryThrottle = limiter.define('transport-enquiry', (ctx) =>
  limiter.allowRequests(20).every('1 minute').usingKey(`enquiry:${ctx.request.ip()}`)
)

/**
 * Image uploads are counted per file, not per request, because they arrive
 * with ordinary form saves. Text-only saves never consume this allowance.
 */
export async function consumeImageUploadQuota(adminId: number, files: number) {
  if (files <= 0) return
  await limiter.use({ requests: 60, duration: '1 hour' }).consume(`image-upload:${adminId}`, files)
}
