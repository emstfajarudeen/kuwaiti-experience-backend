import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import * as read from '../../services/explore_read_service.js'
import * as write from '../../services/explore_write_service.js'
import * as validators from '../../validators/explore.js'
import { movie } from '../../serializers/explore.js'
import { ApiError } from '../../services/api_error.js'
import { imageFiles, prepareImages } from '../../services/image_storage_service.js'

export default class AdminExploreController {
  async places({ request }: HttpContext) {
    return read.places(request.qs(), undefined, true)
  }
  async place({ params }: HttpContext) {
    return read.showPlace(read.positiveId(params.id), undefined, true)
  }
  async updatePlace(ctx: HttpContext) {
    const input = await ctx.request.validateUsing(validators.placeExploreValidator)
    const id = read.positiveId(ctx.params.id)
    await write.updatePlaceExplore(id, input, ctx.admin.id)
    return read.showPlace(id, undefined, true)
  }
  async features({ request }: HttpContext) {
    return read.features(request.input('type'), true)
  }
  async saveFeature(ctx: HttpContext) {
    const result = await write.saveFeature(
      await ctx.request.validateUsing(validators.featureValidator),
      ctx.admin.id,
      ctx.params.id ? read.positiveId(ctx.params.id) : undefined
    )
    return ctx.params.id ? result : ctx.response.created(result)
  }
  async deleteFeature({ params, admin, response }: HttpContext) {
    await write.deleteFeature(read.positiveId(params.id), admin.id)
    return response.noContent()
  }
  async movies({ request }: HttpContext) {
    return read.movies(request.qs())
  }
  async movie({ params }: HttpContext) {
    const row = await db.from('movies').where('id', read.positiveId(params.id)).first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Movie not found')
    return { data: movie(row) }
  }
  async saveMovie(ctx: HttpContext) {
    const result = await write.saveMovie(
      await ctx.request.validateUsing(validators.movieValidator),
      ctx.admin.id,
      ctx.params.id ? read.positiveId(ctx.params.id) : undefined
    )
    return ctx.params.id ? result : ctx.response.created(result)
  }
  async poster(ctx: HttpContext) {
    const id = read.positiveId(ctx.params.id)
    const current = await db.from('movies').where('id', id).first()
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Movie not found')
    const images = await prepareImages(ctx.admin.id, { poster: imageFiles(ctx.request, 'file') })
    if (!images.poster[0]) throw new ApiError(422, 'INVALID_IMAGE', 'Select a poster image')
    return write.saveMovie(null, ctx.admin.id, id, images.poster[0])
  }
  async removePoster(ctx: HttpContext) {
    const id = read.positiveId(ctx.params.id)
    const current = await db.from('movies').where('id', id).first()
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Movie not found')
    return write.saveMovie(null, ctx.admin.id, id, 'remove')
  }
  async deleteMovie({ params, admin, response }: HttpContext) {
    await write.deleteMovie(read.positiveId(params.id), admin.id)
    return response.noContent()
  }
  async showtimes({ request }: HttpContext) {
    return read.showtimes(request.qs())
  }
  async saveShowtime(ctx: HttpContext) {
    const result = await write.saveShowtime(
      await ctx.request.validateUsing(validators.showtimeValidator),
      ctx.admin.id,
      ctx.params.id ? read.positiveId(ctx.params.id) : undefined
    )
    return ctx.params.id ? result : ctx.response.created(result)
  }
  async deleteShowtime({ params, admin, response }: HttpContext) {
    await write.deleteShowtime(read.positiveId(params.id), admin.id)
    return response.noContent()
  }
}
