import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { ApiError } from '../services/api_error.js'
import { can, loadAuthorization, requireAll } from '../services/authorization_service.js'
import { resolveAdminRoutePolicy } from '../authorization/admin_route_policies.js'
import { referencedImageModules } from '../services/image_reference_service.js'
import { isManagedImageKey } from '../services/image_storage_service.js'
import { adminLandingUrl } from '../authorization/admin_landing.js'
import db from '@adonisjs/lucid/services/db'
import {
  providerAuthorization,
  providerMayUse,
  providerOwnsImage,
} from '../authorization/provider_portal.js'

const savedDestinations: Record<string, string> = {
  'places': 'places.view',
  'categories': 'categories.view',
  'category-types': 'category_types.view',
}

export default class AdminAuthorizationMiddleware {
  private requireTransitionPermission(
    authorization: Awaited<ReturnType<typeof loadAuthorization>>,
    module: 'movies' | 'showtimes',
    previous: string | null,
    next: string | null
  ) {
    if (!next || next === previous) return
    if (module === 'movies') {
      if (next === 'published') requireAll(authorization, ['movies.publish'])
      else if (previous === 'published') requireAll(authorization, ['movies.archive'])
      else if (next === 'archived') requireAll(authorization, ['movies.archive'])
    } else {
      if (next === 'published') requireAll(authorization, ['showtimes.publish'])
      else if (previous === 'published' || next === 'cancelled')
        requireAll(authorization, ['showtimes.cancel'])
    }
  }

  /** Provider portal logins: allow-listed routes only, and only their own images. */
  private async handleProvider(ctx: HttpContext, next: NextFn, providerId: number) {
    const route = ctx.route
    // Set first, so even the "access denied" page shows the provider portal layout.
    ctx.authorization = providerAuthorization()
    if (!route || !providerMayUse(ctx.request.method(), route.pattern)) {
      throw new ApiError(403, 'FORBIDDEN', 'This page is not part of the provider portal')
    }
    if (ctx.admin.mustChangePassword && !route.pattern.startsWith('/admin/account')) {
      if (route.pattern !== '/admin/logout') return ctx.response.redirect('/admin/account')
    }
    if (route.pattern === '/admin/images/:key') {
      const imageKey = String(ctx.params.key)
      if (!isManagedImageKey(imageKey) || !(await providerOwnsImage(providerId, imageKey)))
        throw new ApiError(404, 'NOT_FOUND', 'Image not found')
    }
    return next()
  }

  async handle(ctx: HttpContext, next: NextFn) {
    if (ctx.admin.providerId) return this.handleProvider(ctx, next, ctx.admin.providerId)
    const route = ctx.route
    const policy = route ? resolveAdminRoutePolicy(ctx.request.method(), route.pattern) : undefined
    if (!route || !policy) {
      ctx.logger.warn(
        { method: ctx.request.method(), pattern: route?.pattern ?? ctx.request.url() },
        'Denied admin route without an RBAC policy'
      )
      throw new ApiError(403, 'FORBIDDEN', 'This admin route has no access policy')
    }

    const authorization = await loadAuthorization(ctx.admin.id)
    ctx.authorization = authorization
    if (ctx.admin.mustChangePassword && policy.kind !== 'authenticated') {
      if (!ctx.request.url().startsWith('/api/')) return ctx.response.redirect('/admin/account')
      throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your password before continuing')
    }

    if (route.pattern === '/admin' && !can(authorization, 'dashboard.view')) {
      return ctx.response.redirect(adminLandingUrl(authorization))
    }

    if (policy.kind === 'permissions' || policy.kind === 'admin_only') {
      requireAll(authorization, policy.all)
      if (policy.kind === 'admin_only' && !authorization.isFullAccessAdmin) {
        throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required')
      }
    } else if (policy.kind === 'resource') {
      if (policy.resource === 'private_image') {
        const imageKey = ctx.params.key
        if (!isManagedImageKey(imageKey)) throw new ApiError(404, 'NOT_FOUND', 'Image not found')
        const owners = await referencedImageModules(imageKey)
        if (!owners.size) throw new ApiError(404, 'NOT_FOUND', 'Image not found')
        requireAll(
          authorization,
          [...owners].map((module) => `${module}.view`)
        )
      } else {
        const required = savedDestinations[ctx.params.resource]
        if (!required) throw new ApiError(404, 'NOT_FOUND', 'Destination not found')
        requireAll(authorization, [required])
      }
    }

    // Status changes carry more impact than editing ordinary fields. Check the
    // transition against current database state rather than trusting the request.
    if (route.pattern.includes('/movies')) {
      const id = Number(ctx.params.id)
      const existing =
        Number.isSafeInteger(id) && id > 0
          ? await db.from('movies').where('id', id).select('status').first()
          : null
      this.requireTransitionPermission(
        authorization,
        'movies',
        existing?.status ?? null,
        ctx.request.input('status')
      )
    }
    if (route.pattern.includes('/showtimes')) {
      const id = Number(ctx.params.id)
      const existing =
        Number.isSafeInteger(id) && id > 0
          ? await db.from('theater_showtimes').where('id', id).select('status').first()
          : null
      this.requireTransitionPermission(
        authorization,
        'showtimes',
        existing?.status ?? null,
        ctx.request.input('status')
      )
    }

    // Place saves can also change homepage placement, so require both modules.
    const isPlaceWrite =
      [
        '/admin/places',
        '/admin/places/:id/save',
        '/api/v1/admin/places',
        '/api/v1/admin/places/:id',
      ].includes(route.pattern) && ['POST', 'PUT'].includes(ctx.request.method())
    if (isPlaceWrite) {
      if (ctx.request.input('intent') === 'publish') requireAll(authorization, ['places.publish'])
      const body = ctx.request.body() as Record<string, unknown>
      const hasFeatured = Object.hasOwn(body, 'featured')
      const hasOrder = Object.hasOwn(body, 'featured_order')
      if (hasFeatured || hasOrder) {
        const id = Number(ctx.params.id)
        const existing =
          Number.isSafeInteger(id) && id > 0
            ? await db.from('places').where('id', id).select('featured_order').first()
            : null
        const previousOrder =
          existing?.featured_order === null || existing?.featured_order === undefined
            ? null
            : Number(existing.featured_order)
        const requestedFeatured =
          body.featured === true || body.featured === 'on' || body.featured === 'true'
        const nextOrder = hasOrder
          ? body.featured_order === null || body.featured_order === ''
            ? null
            : Number(body.featured_order)
          : hasFeatured
            ? requestedFeatured
              ? (previousOrder ?? 0)
              : null
            : previousOrder
        if (nextOrder !== previousOrder) requireAll(authorization, ['home.view', 'home.update'])
      }
    }
    return next()
  }
}
