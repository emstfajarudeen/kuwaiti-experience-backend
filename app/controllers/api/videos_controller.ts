import type { HttpContext } from '@adonisjs/core/http'
import { optionalCustomer } from '../../middleware/customer_auth_middleware.js'
import { ApiError } from '../../services/api_error.js'
import { publicLanguage } from '../../services/public_localization.js'
import * as videos from '../../services/video_public_service.js'
import { streamVideo } from '../../services/video_storage_service.js'

function id(value: unknown, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new ApiError(404, 'NOT_FOUND', `${label} not found`)
  return parsed
}

export default class VideosController {
  async index(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    return videos.feed(
      ctx.request.qs(),
      publicLanguage(ctx.request.header('accept-language')),
      identity?.customer.id
    )
  }

  async show(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    return videos.showVideo(
      id(ctx.params.id, 'Video'),
      publicLanguage(ctx.request.header('accept-language')),
      identity?.customer.id
    )
  }

  async reasons({ request }: HttpContext) {
    return { data: videos.reportReasons(publicLanguage(request.header('accept-language'))) }
  }

  async comments(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    return videos.comments(id(ctx.params.id, 'Video'), ctx.request.qs(), identity?.customer.id)
  }

  async saved({ request, customerIdentity }: HttpContext) {
    return videos.savedFeed(
      request.qs(),
      publicLanguage(request.header('accept-language')),
      customerIdentity.customer.id
    )
  }

  async like({ params, customerIdentity }: HttpContext) {
    return videos.setLike(id(params.id, 'Video'), customerIdentity.customer.id, true)
  }
  async unlike({ params, customerIdentity }: HttpContext) {
    return videos.setLike(id(params.id, 'Video'), customerIdentity.customer.id, false)
  }
  async save({ params, customerIdentity }: HttpContext) {
    return videos.setSaved(id(params.id, 'Video'), customerIdentity.customer.id, true)
  }
  async unsave({ params, customerIdentity }: HttpContext) {
    return videos.setSaved(id(params.id, 'Video'), customerIdentity.customer.id, false)
  }
  async share({ params, customerIdentity }: HttpContext) {
    return videos.recordShare(id(params.id, 'Video'), customerIdentity.customer.id)
  }
  async addComment({ params, request, response, customerIdentity }: HttpContext) {
    const result = await videos.addComment(
      id(params.id, 'Video'),
      customerIdentity.customer.id,
      request.input('body')
    )
    response.status(201)
    return result
  }
  async deleteComment({ params, customerIdentity }: HttpContext) {
    return videos.deleteComment(id(params.id, 'Comment'), customerIdentity.customer.id)
  }
  async likeComment({ params, customerIdentity }: HttpContext) {
    return videos.setCommentLike(id(params.id, 'Comment'), customerIdentity.customer.id, true)
  }
  async unlikeComment({ params, customerIdentity }: HttpContext) {
    return videos.setCommentLike(id(params.id, 'Comment'), customerIdentity.customer.id, false)
  }
  async report({ params, request, response, customerIdentity }: HttpContext) {
    const result = await videos.reportVideo(
      id(params.id, 'Video'),
      customerIdentity.customer.id,
      request.input('reason'),
      request.input('note')
    )
    response.status(201)
    return result
  }

  /** Public delivery of a video file; only published videos are served. */
  async file(ctx: HttpContext) {
    const key = `videos/${ctx.params.key}`
    const { default: db } = await import('@adonisjs/lucid/services/db')
    const row = await db
      .from('videos')
      .where('video_key', key)
      .where('status', 'published')
      .where('published_at', '<=', new Date())
      .first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Video not found')
    return streamVideo(ctx, key, 'public, max-age=300')
  }

  /** CMS preview of any stored video, including drafts. */
  async adminFile(ctx: HttpContext) {
    return streamVideo(ctx, `videos/${ctx.params.key}`, 'private, no-store')
  }
}
