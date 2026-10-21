import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import {
  galleryItemsValidator,
  galleryUploadValidator,
  placeValidator,
} from '../../validators/content.js'
import { deletePlace, savePlace, setPlaceStatus } from '../../services/content_write_service.js'
import { showPlace } from '../../services/public_content_service.js'
import { categoryTypes } from '../../services/category_type_service.js'
import { ApiError } from '../../services/api_error.js'
import {
  MAX_IMAGES_PER_REQUEST,
  cmsImageUrl,
  imageFiles,
  prepareImages,
} from '../../services/image_storage_service.js'

function optionalNumber(value: unknown) {
  return value === undefined || value === null || value === '' ? null : Number(value)
}

/** Reads the indexed `gallery[n][field]` inputs of the gallery editor. */
function galleryItemsFrom(value: unknown) {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value)
      : []
  return entries
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: optionalNumber(item.id),
      altEn: (item.altEn as string | null | undefined) ?? null,
      altAr: (item.altAr as string | null | undefined) ?? null,
      captionEn: (item.captionEn as string | null | undefined) ?? null,
      captionAr: (item.captionAr as string | null | undefined) ?? null,
      sortOrder: optionalNumber(item.sortOrder) ?? undefined,
      remove: item.remove === 'on' || item.remove === 'true',
    }))
}

export default class AdminPlacesPageController {
  async index({ request, view, admin }: HttpContext) {
    const requestedType = request.input('type')
    const types = await categoryTypes()
    const selectedType =
      typeof requestedType === 'string' && types.some((type) => type.code === requestedType)
        ? requestedType
        : ''
    const query = db
      .from('places as p')
      .join('place_translations as t', function () {
        this.on('t.place_id', '=', 'p.id').andOnVal('t.locale', '=', 'en')
      })
      .leftJoin('category_types as ct', 'ct.code', 'p.type')
      .select(
        'p.id',
        'p.type',
        'p.slug',
        'p.status',
        'p.cover_image_key',
        'p.updated_at',
        't.title',
        db.raw('COALESCE(ct.name_en, p.type) as type_name_en')
      )
    if (selectedType) {
      query.where('p.type', selectedType)
    }
    const rows = await query.orderBy('p.id', 'desc').limit(100)
    return view.render('admin/places/index', { admin, rows, types, selectedType })
  }

  async create({ view, admin }: HttpContext) {
    const [categories, types] = await Promise.all([
      db.from('categories').orderBy('type').orderBy('sort_order'),
      categoryTypes(),
    ])
    return view.render('admin/places/edit', {
      admin,
      place: null,
      en: null,
      ar: null,
      categories,
      types,
      coverUrl: null,
      gallery: [],
      maxUploads: MAX_IMAGES_PER_REQUEST,
      hoursJson: '[]',
    })
  }

  async edit({ params, view, admin, response }: HttpContext) {
    const place = await db.from('places').where('id', params.id).first()
    if (!place) return response.redirect('/admin/places')
    const [translations, categories, gallery, hours, types] = await Promise.all([
      db.from('place_translations').where('place_id', place.id),
      db.from('categories').orderBy('type').orderBy('sort_order'),
      db.from('place_images').where('place_id', place.id).orderBy('sort_order').orderBy('id'),
      db
        .from('place_hours')
        .where('place_id', place.id)
        .orderBy('weekday')
        .orderBy('interval_index'),
      categoryTypes(),
    ])
    return view.render('admin/places/edit', {
      admin,
      place,
      en: translations.find((t) => t.locale === 'en'),
      ar: translations.find((t) => t.locale === 'ar'),
      categories,
      types,
      coverUrl: cmsImageUrl(place.cover_image_key),
      gallery: gallery.map((image) => ({ ...image, url: cmsImageUrl(image.storage_key) })),
      maxUploads: MAX_IMAGES_PER_REQUEST,
      hoursJson: JSON.stringify(
        hours.map((h) => ({
          weekday: h.weekday,
          intervalIndex: h.interval_index,
          opensAt: h.opens_at,
          closesAt: h.closes_at,
          closesNextDay: Boolean(h.closes_next_day),
          closed: Boolean(h.closed),
        })),
        null,
        2
      ),
    })
  }

  async preview({ params, request, view, admin, response }: HttpContext) {
    const place = await db.from('places').where('id', params.id).select('slug', 'status').first()
    if (!place) return response.redirect('/admin/places')
    const result = await showPlace(
      place.slug,
      request.input('locale') === 'ar' ? 'ar' : 'en',
      true,
      cmsImageUrl
    )
    return view.render('admin/places/preview', { admin, place: result.data, status: place.status })
  }

  async save(ctx: HttpContext) {
    const { request, response, session, admin, params } = ctx
    try {
      const rawHours = String(request.input('hoursJson', '[]'))
      const hours = JSON.parse(rawHours)
      const input = await placeValidator.validate({
        type: request.input('type'),
        slug: request.input('slug'),
        categoryId: optionalNumber(request.input('categoryId')),
        titleEn: request.input('titleEn'),
        summaryEn: request.input('summaryEn'),
        addressEn: request.input('addressEn'),
        bodyEn: request.input('bodyEn') || null,
        hoursNoteEn: request.input('hoursNoteEn') || null,
        priceUnitEn: request.input('priceUnitEn') || null,
        seoTitleEn: request.input('seoTitleEn') || null,
        seoDescriptionEn: request.input('seoDescriptionEn') || null,
        titleAr: request.input('titleAr') || null,
        summaryAr: request.input('summaryAr') || null,
        addressAr: request.input('addressAr') || null,
        bodyAr: request.input('bodyAr') || null,
        priceMode: request.input('priceMode') || 'unknown',
        priceAmount: request.input('priceAmount') || null,
        websiteUrl: request.input('websiteUrl') || null,
        latitude: optionalNumber(request.input('latitude')),
        longitude: optionalNumber(request.input('longitude')),
        featured: request.input('featured') === 'on',
        featured_order:
          request.input('featured') === 'on' ? Number(request.input('featured_order', 0)) : null,
        hours,
      })
      const { items: galleryItems } = await galleryItemsValidator.validate({
        items: galleryItemsFrom(request.input('gallery')),
      })
      const { altEn: galleryAltEn } = await galleryUploadValidator.validate({
        altEn: request.input('galleryAltEn'),
      })
      const images = await prepareImages(admin.id, {
        cover: imageFiles(request, 'coverImage'),
        gallery: imageFiles(request, 'galleryImages', MAX_IMAGES_PER_REQUEST),
      })
      const publish = request.input('intent') === 'publish'
      await savePlace(input, admin.id, params.id ? Number(params.id) : undefined, {
        publish,
        images: {
          cover: images.cover[0] ?? (request.input('removeCover') === 'on' ? 'remove' : undefined),
          galleryAdd: images.gallery,
          galleryAltEn,
          galleryItems,
        },
      })
      session.flash('success', publish ? 'Place published.' : 'Place saved.')
      return response.redirect('/admin/places/saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save place'
      const attached = Object.keys(request.allFiles()).length > 0
      session.flash(
        'error',
        attached ? `${message.replace(/\.$/, '')}. Re-select any images you attached.` : message
      )
      return response.redirect(params.id ? `/admin/places/${params.id}/edit` : '/admin/places/new')
    }
  }

  async publish({ params, admin, response, session }: HttpContext) {
    try {
      await setPlaceStatus(Number(params.id), 'published', admin.id)
      session.flash('success', 'Place published.')
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to publish')
    }
    return response.redirect(`/admin/places/${params.id}/edit`)
  }

  async archive({ params, admin, response, session }: HttpContext) {
    await setPlaceStatus(Number(params.id), 'archived', admin.id)
    session.flash('success', 'Place archived.')
    return response.redirect('/admin/places')
  }

  async destroy({ params, admin, response, session }: HttpContext) {
    try {
      await deletePlace(Number(params.id), admin.id)
      session.flash('success', 'Place deleted.')
    } catch (error) {
      session.flash('error', error instanceof ApiError ? error.message : 'Unable to delete place')
    }
    return response.redirect('/admin/places')
  }
}
