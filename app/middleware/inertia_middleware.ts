import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import env from '#start/env'
import { adminLandingUrl } from '../authorization/admin_landing.js'

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  share(ctx: HttpContext) {
    const flashedErrors = ctx.session.flashMessages.get('inputErrorsBag')
    const validationErrors = this.getValidationErrors(ctx)
    return {
      cmsSocial: {
        url: new URL('/admin/login', env.get('APP_URL')).href,
        image: new URL('/cms-social-card.png', env.get('APP_URL')).href,
      },
      auth: ctx.inertia.always(
        (() => {
          const admin = (ctx as Partial<HttpContext>).admin
          if (!admin) return null
          const authorization = (ctx as Partial<HttpContext>).authorization
          if (!authorization) return null
          return {
            id: admin.id,
            name: admin.fullName,
            roleSlugs: authorization.roleSlugs,
            permissions: [...authorization.permissions],
            isSuperAdmin: authorization.isSuperAdmin,
            isFullAccessAdmin: authorization.isFullAccessAdmin,
            mustChangePassword: admin.mustChangePassword,
            landingUrl: adminLandingUrl(authorization),
          }
        })()
      ),
      errors: ctx.inertia.always({
        ...(validationErrors as Record<string, string>),
        ...(flashedErrors && typeof flashedErrors === 'object'
          ? (flashedErrors as Record<string, string>)
          : {}),
      }),
    }
  }

  flash(ctx: HttpContext) {
    const session = (ctx as Partial<HttpContext>).session
    return {
      error: session?.flashMessages.get('error') as string | undefined,
      success: session?.flashMessages.get('success') as string | undefined,
    }
  }

  async handle(ctx: HttpContext, next: NextFn) {
    await this.init(ctx)
    const output = await next()
    this.dispose(ctx)
    return output
  }
}
