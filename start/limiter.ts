import limiter from '@adonisjs/limiter/services/main'

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

export const uploadThrottle = limiter.define('media-upload', (ctx) =>
  limiter
    .allowRequests(20)
    .every('1 hour')
    .usingKey(`upload:${ctx.admin?.id ?? ctx.request.ip()}`)
)
