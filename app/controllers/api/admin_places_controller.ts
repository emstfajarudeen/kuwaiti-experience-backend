import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { placeValidator } from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'
import { deletePlace, savePlace, setPlaceStatus } from '../../services/content_write_service.js'
import { showPlace } from '../../services/public_content_service.js'
import { assertPlaceType } from '../../services/category_type_service.js'

export default class AdminPlacesController {
  async index({ request }: HttpContext) {
    const page = Number(request.input('page', 1))
    if (!Number.isInteger(page) || page < 1 || page > 10000) {
      throw new ApiError(422, 'INVALID_PAGINATION', 'Invalid page')
    }
    const query = db.from('places as p').join('place_translations as t', function () {
      this.on('t.place_id', '=', 'p.id').andOnVal('t.locale', '=', 'en')
    })
    const type = request.input('type')
    if (type) query.where('p.type', await assertPlaceType(type))
    const status = request.input('status')
    if (status) {
      if (!['draft', 'published', 'archived'].includes(status)) {
        throw new ApiError(422, 'INVALID_STATUS', 'Invalid status')
      }
      query.where('p.status', status)
    }
    const q = request.input('q')
    if (q) {
      if (typeof q !== 'string' || q.length > 80)
        throw new ApiError(422, 'INVALID_SEARCH', 'Invalid search')
      query.whereLike('t.title', `%${q.trim()}%`)
    }
    const count = await query.clone().count('* as total').first()
    const rows = await query
      .select('p.id', 'p.slug', 'p.type', 'p.status', 'p.cover_media_id', 'p.updated_at', 't.title')
      .orderBy('p.id', 'desc')
      .limit(20)
      .offset((page - 1) * 20)
    return {
      data: rows.map((row) => ({
        ...row,
        coverUrl: row.cover_media_id ? `/api/v1/admin/media/${row.cover_media_id}/file` : null,
      })),
      meta: { page, perPage: 20, total: Number(count?.total ?? 0) },
    }
  }

  async show({ params }: HttpContext) {
    const place = await db.from('places').where('id', params.id).first()
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    const [translations, gallery, hours] = await Promise.all([
      db.from('place_translations').where('place_id', place.id),
      db.from('place_media').where('place_id', place.id).orderBy('sort_order'),
      db
        .from('place_hours')
        .where('place_id', place.id)
        .orderBy('weekday')
        .orderBy('interval_index'),
    ])
    return { data: { ...place, translations, gallery, hours } }
  }

  async preview({ params, request }: HttpContext) {
    const place = await db.from('places').where('id', params.id).select('slug').first()
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    return showPlace(place.slug, request.input('locale') === 'ar' ? 'ar' : 'en', true)
  }

  async store({ request, response, admin }: HttpContext) {
    const input = await request.validateUsing(placeValidator)
    const id = await savePlace(input, admin.id)
    return response.created({ data: { id } })
  }

  async update({ params, request, admin }: HttpContext) {
    const input = await request.validateUsing(placeValidator)
    const id = Number(params.id)
    await savePlace(input, admin.id, id)
    return { data: { id } }
  }

  async publish({ params, admin }: HttpContext) {
    await setPlaceStatus(Number(params.id), 'published', admin.id)
    return { data: { id: Number(params.id), status: 'published' } }
  }

  async archive({ params, admin }: HttpContext) {
    await setPlaceStatus(Number(params.id), 'archived', admin.id)
    return { data: { id: Number(params.id), status: 'archived' } }
  }

  async destroy({ params, admin, response }: HttpContext) {
    await deletePlace(Number(params.id), admin.id)
    return response.noContent()
  }
}
