import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { placeValidator } from '../../validators/content.js'
import { deletePlace, savePlace, setPlaceStatus } from '../../services/content_write_service.js'
import { showPlace } from '../../services/public_content_service.js'
import { categoryTypes } from '../../services/category_type_service.js'

function optionalNumber(value: unknown) {
  return value === undefined || value === null || value === '' ? null : Number(value)
}

function idsFrom(value: unknown): number[] {
  const entries = Array.isArray(value) ? value : value ? [value] : []
  return entries.map(Number)
}

export default class AdminPlacesPageController {
  async index({ request, view, admin }: HttpContext) {
    const type = request.input('type')
    const query = db
      .from('places as p')
      .join('place_translations as t', function () {
        this.on('t.place_id', '=', 'p.id').andOnVal('t.locale', '=', 'en')
      })
      .select('p.id', 'p.type', 'p.slug', 'p.status', 'p.cover_media_id', 'p.updated_at', 't.title')
    if (typeof type === 'string' && (await db.from('category_types').where('code', type).first())) {
      query.where('p.type', type)
    }
    const rows = await query.orderBy('p.id', 'desc').limit(100)
    const types = await categoryTypes()
    return view.render('admin/places/index', { admin, rows, types, selectedType: type ?? '' })
  }

  async create({ view, admin }: HttpContext) {
    const [categories, media, types] = await Promise.all([
      db.from('categories').orderBy('type').orderBy('sort_order'),
      db.from('media').orderBy('id', 'desc').limit(100),
      categoryTypes(),
    ])
    return view.render('admin/places/edit', {
      admin,
      place: null,
      en: null,
      ar: null,
      categories,
      types,
      media,
      galleryIds: [],
      hoursJson: '[]',
    })
  }

  async edit({ params, view, admin, response }: HttpContext) {
    const place = await db.from('places').where('id', params.id).first()
    if (!place) return response.redirect('/admin/places')
    const [translations, categories, media, gallery, hours, types] = await Promise.all([
      db.from('place_translations').where('place_id', place.id),
      db.from('categories').orderBy('type').orderBy('sort_order'),
      db.from('media').orderBy('id', 'desc').limit(100),
      db.from('place_media').where('place_id', place.id).orderBy('sort_order'),
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
      media,
      galleryIds: gallery.map((item) => item.media_id),
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
    const result = await showPlace(place.slug, request.input('locale') === 'ar' ? 'ar' : 'en', true)
    return view.render('admin/places/preview', { admin, place: result.data, status: place.status })
  }

  async save(ctx: HttpContext) {
    const { request, response, session, admin, params } = ctx
    try {
      const rawHours = String(request.input('hoursJson', '[]'))
      const hours = JSON.parse(rawHours)
      const galleryInput = request.input('galleryIds', request.input('galleryIds[]'))
      const input = await placeValidator.validate({
        type: request.input('type'),
        slug: request.input('slug'),
        categoryId: optionalNumber(request.input('categoryId')),
        coverMediaId: optionalNumber(request.input('coverMediaId')),
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
        galleryIds: idsFrom(galleryInput),
        hours,
      })
      const publish = request.input('intent') === 'publish'
      const id = await savePlace(input, admin.id, params.id ? Number(params.id) : undefined, {
        publish,
      })
      session.flash('success', publish ? 'Place published.' : 'Place saved.')
      return response.redirect(`/admin/places/${id}/edit`)
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to save place')
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
    await deletePlace(Number(params.id), admin.id)
    session.flash('success', 'Place deleted.')
    return response.redirect('/admin/places')
  }
}
