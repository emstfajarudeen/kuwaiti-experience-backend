import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import {
  galleryImageUpdateValidator,
  galleryUploadValidator,
  placeValidator,
} from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'
import {
  deletePlace,
  savePlace,
  setPlaceStatus,
  updatePlaceImages,
} from '../../services/content_write_service.js'
import { showPlace } from '../../services/public_content_service.js'
import { assertPlaceType } from '../../services/category_type_service.js'
import {
  MAX_IMAGES_PER_REQUEST,
  adminApiImageUrl,
  imageFiles,
  prepareImages,
} from '../../services/image_storage_service.js'

async function placeImages(placeId: number) {
  const [place, gallery] = await Promise.all([
    db.from('places').where('id', placeId).select('cover_image_key').first(),
    db.from('place_images').where('place_id', placeId).orderBy('sort_order').orderBy('id'),
  ])
  return {
    coverUrl: adminApiImageUrl(place?.cover_image_key),
    gallery: gallery.map((image) => ({
      id: image.id,
      url: adminApiImageUrl(image.storage_key),
      altEn: image.alt_en,
      altAr: image.alt_ar,
      captionEn: image.caption_en,
      captionAr: image.caption_ar,
      sortOrder: image.sort_order,
    })),
  }
}

function idFrom(value: unknown, message = 'Place not found') {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) throw new ApiError(404, 'NOT_FOUND', message)
  return id
}

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
      .select(
        'p.id',
        'p.slug',
        'p.type',
        'p.status',
        'p.cover_image_key',
        'p.updated_at',
        't.title'
      )
      .orderBy('p.id', 'desc')
      .limit(20)
      .offset((page - 1) * 20)
    return {
      data: rows.map(({ cover_image_key: coverImageKey, ...row }) => ({
        ...row,
        coverUrl: adminApiImageUrl(coverImageKey),
      })),
      meta: { page, perPage: 20, total: Number(count?.total ?? 0) },
    }
  }

  async show({ params }: HttpContext) {
    const place = await db.from('places').where('id', params.id).first()
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    const fields = { ...place }
    delete fields.cover_image_key
    const [translations, images, hours] = await Promise.all([
      db.from('place_translations').where('place_id', place.id),
      placeImages(place.id),
      db
        .from('place_hours')
        .where('place_id', place.id)
        .orderBy('weekday')
        .orderBy('interval_index'),
    ])
    return { data: { ...fields, ...images, translations, hours } }
  }

  async preview({ params, request }: HttpContext) {
    const place = await db.from('places').where('id', params.id).select('slug').first()
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    return showPlace(
      place.slug,
      request.input('locale') === 'ar' ? 'ar' : 'en',
      true,
      adminApiImageUrl
    )
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

  async updateCover({ params, request, admin }: HttpContext) {
    const id = idFrom(params.id)
    const files = imageFiles(request, 'file')
    if (!files.length) throw new ApiError(422, 'INVALID_IMAGE', 'Attach an image file')
    const { cover } = await prepareImages(admin.id, { cover: files })
    await updatePlaceImages(id, { cover: cover[0] }, admin.id)
    return { data: await placeImages(id) }
  }

  async removeCover({ params, admin, response }: HttpContext) {
    await updatePlaceImages(idFrom(params.id), { cover: 'remove' }, admin.id)
    return response.noContent()
  }

  async addGalleryImages({ params, request, admin, response }: HttpContext) {
    const id = idFrom(params.id)
    const { altEn } = await galleryUploadValidator.validate({ altEn: request.input('altEn') })
    const files = imageFiles(request, 'files', MAX_IMAGES_PER_REQUEST)
    if (!files.length) throw new ApiError(422, 'INVALID_IMAGE', 'Attach at least one image file')
    const { gallery } = await prepareImages(admin.id, { gallery: files })
    await updatePlaceImages(id, { galleryAdd: gallery, galleryAltEn: altEn }, admin.id)
    return response.created({ data: await placeImages(id) })
  }

  async updateGalleryImage({ params, request, admin }: HttpContext) {
    const id = idFrom(params.id)
    const input = await request.validateUsing(galleryImageUpdateValidator)
    await updatePlaceImages(
      id,
      { galleryItems: [{ id: idFrom(params.imageId, 'Gallery image not found'), ...input }] },
      admin.id
    )
    return { data: await placeImages(id) }
  }

  async removeGalleryImage({ params, admin, response }: HttpContext) {
    await updatePlaceImages(
      idFrom(params.id),
      { galleryItems: [{ id: idFrom(params.imageId, 'Gallery image not found'), remove: true }] },
      admin.id
    )
    return response.noContent()
  }
}
