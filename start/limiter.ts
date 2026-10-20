import limiter from '@adonisjs/limiter/services/main'

export const bookmarkThrottle = limiter.define('customer-bookmarks', (ctx) =>
  limiter
    .allowRequests(120)
    .every('1 minute')
    .usingKey(`bookmarks:${ctx.customerIdentity.customer.id}`)
)

export const customerPhotoThrottle = limiter.define('customer-profile-photo', (ctx) =>
  limiter
    .allowRequests(20)
    .every('1 hour')
    .usingKey(`customer-photo:${ctx.customerIdentity.customer.id}`)
)

export const customerAuthThrottle = limiter.define('customer-auth', (ctx) =>
  limiter
    .allowRequests(30)
    .every('1 minute')
    .blockFor('5 minutes')
    .usingKey(`customer-auth:${ctx.request.ip()}`)
)
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
