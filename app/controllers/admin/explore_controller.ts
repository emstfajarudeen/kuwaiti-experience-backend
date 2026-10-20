import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import * as read from '../../services/explore_read_service.js'
import * as write from '../../services/explore_write_service.js'
import * as validators from '../../validators/explore.js'
import { cmsImageUrl, imageFiles, prepareImages } from '../../services/image_storage_service.js'
import { ApiError } from '../../services/api_error.js'

const numberOrNull = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v))
const checkbox = (v: unknown) => v === 'on' || v === 'true' || v === true
const records = (v: unknown): Record<string, any>[] =>
  Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []

export default class ExplorePageController {
  async place({ params, view, admin }: HttpContext) {
    const result = await read.showPlace(read.positiveId(params.id), undefined, true)
    const features = await read.features(result.data.type, true)
    const hours = result.data.place_hours
    return view.render('admin/explore/place', {
      admin,
      place: result.data,
      features: features.data,
      selectedFeatures: result.data.place_features.map((f) => f.id),
      hourSlots: Array.from(
        { length: Math.min(70, Math.max(21, hours.length + 3)) },
        (_, index) => hours[index] ?? null
      ),
    })
  }
  async savePlace(ctx: HttpContext) {
    const id = read.positiveId(ctx.params.id)
    return this.form(ctx, `/admin/places/${id}/explore`, async () => {
      const r = ctx.request
      const raw = r.input('feature_ids', [])
      const featureIds = Array.isArray(raw) ? raw : raw === null || raw === undefined ? [] : [raw]
      const hours = records(r.input('place_hours'))
        .filter((h) => h.weekday !== '' && h.weekday !== null && h.weekday !== undefined)
        .map((h) => ({
          weekday: Number(h.weekday),
          interval_index: Number(h.interval_index || 0),
          opens_at: h.opens_at || null,
          closes_at: h.closes_at || null,
          closed: checkbox(h.closed),
          closes_next_day: checkbox(h.closes_next_day),
        }))
      const input = await validators.placeExploreValidator.validate({
        phone_e164: r.input('phone_e164') || null,
        check_in_time: r.input('check_in_time') || null,
        check_out_time: r.input('check_out_time') || null,
        screen_count: numberOrNull(r.input('screen_count')),
        feature_ids: featureIds.map(Number),
        place_hours: hours,
      })
      await write.updatePlaceExplore(id, input, ctx.admin.id)
    })
  }
  async features({ params, request, view, admin }: HttpContext) {
    const [features, types] = await Promise.all([
      read.features(undefined, true),
      db.from('category_types').orderBy('sort_order'),
    ])
    const editing = params.id
      ? features.data.find((f) => f.id === read.positiveId(params.id))
      : null
    if (params.id && !editing) throw new ApiError(404, 'NOT_FOUND', 'Feature not found')
    return view.render('admin/explore/features', {
      admin,
      features: features.data,
      types,
      editing: editing ?? null,
      selectedType: request.input('type') ?? '',
    })
  }
  async saveFeature(ctx: HttpContext) {
    const r = ctx.request
    return this.form(
      ctx,
      ctx.params.id ? `/admin/place-features/${ctx.params.id}/edit` : '/admin/place-features',
      async () => {
        const input = await validators.featureValidator.validate({
          type: r.input('type'),
          code: r.input('code'),
          kind: r.input('kind'),
          name_en: r.input('name_en'),
          name_ar: r.input('name_ar') || null,
          active: checkbox(r.input('active')),
          sort_order: Number(r.input('sort_order', 0)),
        })
        await write.saveFeature(
          input,
          ctx.admin.id,
          ctx.params.id ? read.positiveId(ctx.params.id) : undefined
        )
      },
      '/admin/place-features'
    )
  }
  async deleteFeature(ctx: HttpContext) {
    return this.form(ctx, '/admin/place-features', () =>
      write.deleteFeature(read.positiveId(ctx.params.id), ctx.admin.id)
    )
  }
  async movies({ request, view, admin }: HttpContext) {
    return view.render('admin/explore/movies', { admin, result: await read.movies(request.qs()) })
  }
  async movie({ params, view, admin }: HttpContext) {
    const movie = params.id
      ? await db.from('movies').where('id', read.positiveId(params.id)).first()
      : null
    if (params.id && !movie) throw new ApiError(404, 'NOT_FOUND', 'Movie not found')
    return view.render('admin/explore/movie', {
      admin,
      movie,
      posterUrl: cmsImageUrl(movie?.poster_image_key),
    })
  }
  async saveMovie(ctx: HttpContext) {
    return this.form(
      ctx,
      ctx.params.id ? `/admin/movies/${ctx.params.id}/edit` : '/admin/movies/new',
      async () => {
        const r = ctx.request
        const input = await validators.movieValidator.validate({
          title_en: r.input('title_en'),
          title_ar: r.input('title_ar') || null,
          synopsis_en: r.input('synopsis_en') || null,
          synopsis_ar: r.input('synopsis_ar') || null,
          duration_minutes: numberOrNull(r.input('duration_minutes')),
          age_rating: r.input('age_rating') || null,
          status: r.input('status'),
        })
        const images = await prepareImages(ctx.admin.id, { poster: imageFiles(r, 'poster') })
        await write.saveMovie(
          input,
          ctx.admin.id,
          ctx.params.id ? read.positiveId(ctx.params.id) : undefined,
          images.poster[0] ?? (checkbox(r.input('remove_poster')) ? 'remove' : undefined)
        )
      },
      '/admin/movies'
    )
  }
  async deleteMovie(ctx: HttpContext) {
    return this.form(ctx, '/admin/movies', () =>
      write.deleteMovie(read.positiveId(ctx.params.id), ctx.admin.id)
    )
  }
  async showtimes({ params, request, view, admin }: HttpContext) {
    const [result, theaters, movies] = await Promise.all([
      read.showtimes(request.qs()),
      db.from('places').where('type', 'theater').orderBy('slug').limit(1000),
      db.from('movies').orderBy('title_en').limit(1000),
    ])
    const editing = params.id
      ? await db.from('theater_showtimes').where('id', read.positiveId(params.id)).first()
      : null
    if (params.id && !editing) throw new ApiError(404, 'NOT_FOUND', 'Showtime not found')
    return view.render('admin/explore/showtimes', {
      admin,
      result,
      theaters,
      movies,
      editing,
      startsLocal: editing
        ? DateTime.fromJSDate(new Date(editing.starts_at))
            .setZone('Asia/Kuwait')
            .toFormat("yyyy-MM-dd'T'HH:mm")
        : '',
    })
  }
  async saveShowtime(ctx: HttpContext) {
    return this.form(
      ctx,
      ctx.params.id ? `/admin/showtimes/${ctx.params.id}/edit` : '/admin/showtimes',
      async () => {
        const r = ctx.request
        const starts = DateTime.fromISO(String(r.input('starts_at')), { zone: 'Asia/Kuwait' })
        if (!starts.isValid)
          throw new ApiError(422, 'INVALID_TIME', 'Choose a valid Kuwait date and time')
        const input = await validators.showtimeValidator.validate({
          place_id: Number(r.input('place_id')),
          movie_id: Number(r.input('movie_id')),
          starts_at: starts.toUTC().toISO(),
          format: r.input('format'),
          status: r.input('status'),
        })
        await write.saveShowtime(
          input,
          ctx.admin.id,
          ctx.params.id ? read.positiveId(ctx.params.id) : undefined
        )
      },
      '/admin/showtimes'
    )
  }
  async deleteShowtime(ctx: HttpContext) {
    return this.form(ctx, '/admin/showtimes', () =>
      write.deleteShowtime(read.positiveId(ctx.params.id), ctx.admin.id)
    )
  }

  private async form(
    ctx: HttpContext,
    failurePath: string,
    action: () => Promise<unknown>,
    successPath = failurePath
  ) {
    try {
      await action()
      ctx.session.flash('success', 'Changes saved.')
      return ctx.response.redirect(successPath)
    } catch (error) {
      ctx.session.flash('error', error instanceof Error ? error.message : 'Unable to save changes')
      ctx.session.flash('exploreForm', ctx.request.all())
      return ctx.response.redirect(failurePath)
    }
  }
}
