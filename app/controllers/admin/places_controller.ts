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
import { readableValidationError, validationErrorBag } from '../../services/validation_error_bag.js'

function optionalNumber(value: unknown) {
  return value === undefined || value === null || value === '' ? null : Number(value)
}

function briefText(body: unknown, title: unknown) {
  const text = String(body || title || '')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(text).slice(0, 500).join('')
}

function normalizeWebsiteUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
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

import { formatKuwaitDateTime } from '../../services/date_service.js'

export default class AdminPlacesPageController {
  async index({ request, inertia, session, admin }: HttpContext) {
    const requestedType = request.input('type')
    const requestedStatus = request.input('status')
    const searchQuery = String(request.input('q', '')).trim()
    const sortParam = String(request.input('sort', 'updated_desc'))
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const perPage = 25

    const types = await categoryTypes()
    const selectedType =
      typeof requestedType === 'string' && types.some((type) => type.code === requestedType)
        ? requestedType
        : ''

    const validStatuses = ['published', 'draft', 'archived']
    const selectedStatus =
      typeof requestedStatus === 'string' && validStatuses.includes(requestedStatus)
        ? requestedStatus
        : ''

    const buildFilteredQuery = () => {
      const q = db
        .from('places as p')
        .join('place_translations as t', function () {
          this.on('t.place_id', '=', 'p.id').andOnVal('t.locale', '=', 'en')
        })
        .leftJoin('category_types as ct', 'ct.code', 'p.type')

      if (selectedType) {
        q.where('p.type', selectedType)
      }
      if (selectedStatus) {
        q.where('p.status', selectedStatus)
      }
      if (searchQuery) {
        q.where((builder) => {
          builder
            .where('t.title', 'like', `%${searchQuery}%`)
            .orWhere('p.slug', 'like', `%${searchQuery}%`)
            .orWhere('t.address', 'like', `%${searchQuery}%`)
        })
      }
      return q
    }

    const totalRow = await buildFilteredQuery().count('* as count').first()
    const total = Number(totalRow?.count ?? 0)
    const lastPage = Math.max(1, Math.ceil(total / perPage))
    const currentPage = Math.min(page, lastPage)

    const dataQuery = buildFilteredQuery().select(
      'p.id',
      'p.type',
      'p.slug',
      'p.status',
      'p.cover_image_key',
      'p.updated_at',
      't.title',
      db.raw('COALESCE(ct.name_en, p.type) as type_name_en')
    )

    if (sortParam === 'updated_asc') {
      dataQuery.orderBy('p.updated_at', 'asc').orderBy('p.id', 'asc')
    } else if (sortParam === 'title_asc') {
      dataQuery.orderBy('t.title', 'asc')
    } else if (sortParam === 'title_desc') {
      dataQuery.orderBy('t.title', 'desc')
    } else if (sortParam === 'status') {
      dataQuery.orderBy('p.status', 'asc').orderBy('p.id', 'desc')
    } else {
      dataQuery.orderBy('p.updated_at', 'desc').orderBy('p.id', 'desc')
    }

    const rawRows = await dataQuery.offset((currentPage - 1) * perPage).limit(perPage)
    const rows = rawRows.map((place) => ({
      id: Number(place.id),
      type: place.type,
      slug: place.slug,
      status: place.status,
      coverUrl: cmsImageUrl(place.cover_image_key),
      title: place.title,
      type_name_en: place.type_name_en,
      updated_at_local: formatKuwaitDateTime(place.updated_at),
    }))

    const pagination = {
      total,
      page: currentPage,
      perPage,
      lastPage,
      hasPrev: currentPage > 1,
      hasNext: currentPage < lastPage,
      prevPage: currentPage - 1,
      nextPage: currentPage + 1,
    }

    const filters = {
      q: searchQuery,
      type: selectedType,
      status: selectedStatus,
      sort: sortParam,
    }

    return inertia.render(
      'places/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        rows,
        types: types.map(({ code, name_en: nameEn }) => ({ code, name_en: nameEn })),
        selectedType,
        selectedStatus,
        searchQuery,
        selectedSort: sortParam,
        pagination,
        filters,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async create({ inertia, request, session, admin }: HttpContext) {
    const [categories, types] = await Promise.all([
      db
        .from('categories as c')
        .leftJoin('category_translations as t', function () {
          this.on('t.category_id', '=', 'c.id').andOnVal('t.locale', '=', 'en')
        })
        .select('c.id', 'c.type', 'c.slug', 't.name as name_en', 't.name as name')
        .orderBy('c.type')
        .orderBy('c.sort_order'),
      categoryTypes(),
    ])
    return inertia.render(
      'places/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: this.formValues(session.flashMessages.get('placeForm')),
        place: null,
        en: null,
        ar: null,
        categories: categories.map(({ id, type, slug, name_en: nameEn }) => ({
          id: Number(id),
          type,
          slug,
          name_en: nameEn,
        })),
        types: types.map(({ code, name_en: nameEn }) => ({ code, name_en: nameEn })),
        coverUrl: null,
        gallery: [],
        maxUploads: MAX_IMAGES_PER_REQUEST,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async edit({ params, inertia, request, session, admin, response }: HttpContext) {
    const place = await db.from('places').where('id', params.id).first()
    if (!place) return response.redirect('/admin/places')
    const [translations, categories, gallery, types] = await Promise.all([
      db.from('place_translations').where('place_id', place.id),
      db
        .from('categories as c')
        .leftJoin('category_translations as t', function () {
          this.on('t.category_id', '=', 'c.id').andOnVal('t.locale', '=', 'en')
        })
        .select('c.id', 'c.type', 'c.slug', 't.name as name_en', 't.name as name')
        .orderBy('c.type')
        .orderBy('c.sort_order'),
      db.from('place_images').where('place_id', place.id).orderBy('sort_order').orderBy('id'),
      categoryTypes(),
    ])
    const translation = (locale: string) => {
      const value = translations.find((row) => row.locale === locale)
      if (!value) return null
      return {
        title: value.title,
        summary: value.summary,
        address: value.address,
        body: value.body,
        price_unit: value.price_unit,
        hours_note: value.hours_note,
        seo_title: value.seo_title,
        seo_description: value.seo_description,
      }
    }
    return inertia.render(
      'places/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: this.formValues(session.flashMessages.get('placeForm')),
        place: {
          id: Number(place.id),
          type: place.type,
          category_id: place.category_id ? Number(place.category_id) : null,
          slug: place.slug,
          status: place.status,
          price_mode: place.price_mode,
          price_amount: place.price_amount,
          latitude: place.latitude,
          longitude: place.longitude,
          website_url: place.website_url,
          featured_order: place.featured_order,
        },
        en: translation('en'),
        ar: translation('ar'),
        categories: categories.map(({ id, type, slug, name_en: nameEn }) => ({
          id: Number(id),
          type,
          slug,
          name_en: nameEn,
        })),
        types: types.map(({ code, name_en: nameEn }) => ({ code, name_en: nameEn })),
        coverUrl: cmsImageUrl(place.cover_image_key),
        gallery: gallery.map((image) => ({
          id: Number(image.id),
          alt_en: image.alt_en,
          alt_ar: image.alt_ar,
          caption_en: image.caption_en,
          caption_ar: image.caption_ar,
          sort_order: Number(image.sort_order),
          url: cmsImageUrl(image.storage_key),
        })),
        maxUploads: MAX_IMAGES_PER_REQUEST,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async preview({ params, request, inertia, admin, response }: HttpContext) {
    const place = await db.from('places').where('id', params.id).select('slug', 'status').first()
    if (!place) return response.redirect('/admin/places')
    const result = await showPlace(
      place.slug,
      request.input('locale') === 'ar' ? 'ar' : 'en',
      true,
      cmsImageUrl
    )
    return inertia.render(
      'places/preview',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        place: result.data,
        status: place.status,
      },
      { bodyClass: 'cms-body' }
    )
  }

  private formValues(value: unknown) {
    if (!value || typeof value !== 'object') return null
    const form = value as Record<string, unknown>
    const keys = [
      'type',
      'slug',
      'categoryId',
      'titleEn',
      'summaryEn',
      'addressEn',
      'bodyEn',
      'hoursNoteEn',
      'priceUnitEn',
      'seoTitleEn',
      'seoDescriptionEn',
      'titleAr',
      'summaryAr',
      'addressAr',
      'bodyAr',
      'priceMode',
      'priceAmount',
      'websiteUrl',
      'latitude',
      'longitude',
      'featured',
      'featured_order',
      'galleryAltEn',
      'removeCover',
    ]
    return Object.fromEntries(
      keys.map((key) => [key, typeof form[key] === 'string' ? form[key] : null])
    )
  }

  async save(ctx: HttpContext) {
    const { request, response, session, admin, params } = ctx
    try {
      const rawHours = request.input('hoursJson')
      const hours = rawHours === undefined ? undefined : JSON.parse(String(rawHours))
      const previousTranslations = params.id
        ? await db.from('place_translations').where('place_id', Number(params.id))
        : []
      const previousEn = previousTranslations.find((translation) => translation.locale === 'en')
      const previousAr = previousTranslations.find((translation) => translation.locale === 'ar')
      const bodyEn = request.input('bodyEn') || null
      const bodyAr = request.input('bodyAr') || null
      const input = await placeValidator.validate({
        type: request.input('type'),
        slug: request.input('slug'),
        categoryId: optionalNumber(request.input('categoryId')),
        titleEn: request.input('titleEn'),
        summaryEn:
          request.input('summaryEn') ||
          (previousEn && bodyEn === previousEn.body
            ? previousEn.summary
            : briefText(bodyEn, request.input('titleEn'))),
        addressEn: request.input('addressEn'),
        bodyEn,
        hoursNoteEn: request.input('hoursNoteEn') || null,
        priceUnitEn: request.input('priceUnitEn') || null,
        seoTitleEn: request.input('seoTitleEn') || null,
        seoDescriptionEn: request.input('seoDescriptionEn') || null,
        titleAr: request.input('titleAr') || null,
        summaryAr:
          request.input('summaryAr') ||
          (request.input('titleAr')
            ? previousAr && bodyAr === previousAr.body
              ? previousAr.summary
              : briefText(bodyAr, request.input('titleAr'))
            : null),
        addressAr: request.input('addressAr') || null,
        bodyAr,
        priceMode: request.input('priceMode') || 'unknown',
        priceAmount: request.input('priceAmount') || null,
        websiteUrl: normalizeWebsiteUrl(request.input('websiteUrl')),
        latitude: optionalNumber(request.input('latitude')),
        longitude: optionalNumber(request.input('longitude')),
        featured: request.input('featured') === 'on',
        featured_order:
          request.input('featured') === 'on' ? Number(request.input('featured_order', 0)) : null,
        ...(hours === undefined ? {} : { hours }),
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
      const deactivate = request.input('deactivate') === '1' && !publish
      await savePlace(input, admin.id, params.id ? Number(params.id) : undefined, {
        publish,
        deactivate,
        images: {
          cover: images.cover[0] ?? (request.input('removeCover') === 'on' ? 'remove' : undefined),
          galleryAdd: images.gallery,
          galleryAltEn,
          galleryItems,
        },
      })
      session.flash(
        'success',
        publish ? 'Place activated.' : deactivate ? 'Place deactivated.' : 'Place saved.'
      )
      return response.redirect('/admin/places')
    } catch (error) {
      const fieldErrors = validationErrorBag(error)
      if (fieldErrors) session.flash('inputErrorsBag', fieldErrors)
      const firstFieldError = fieldErrors && Object.entries(fieldErrors)[0]
      const message = firstFieldError
        ? readableValidationError(firstFieldError[0], firstFieldError[1][0])
        : error instanceof Error
          ? error.message
          : 'Unable to save place'
      const attached = Object.keys(request.allFiles()).length > 0
      session.flash(
        'error',
        attached ? `${message.replace(/\.$/, '')}. Re-select any images you attached.` : message
      )
      // Inertia preserves the editor state after a failed POST. Flashing the full
      // form (including long descriptions and gallery metadata) exceeds the
      // browser's cookie size limit when SESSION_DRIVER=cookie.
      return response.redirect(params.id ? `/admin/places/${params.id}/edit` : '/admin/places/new')
    }
  }

  async publish({ params, admin, request, response, session }: HttpContext) {
    try {
      await setPlaceStatus(Number(params.id), 'published', admin.id)
      session.flash('success', 'Place activated.')
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to publish')
    }
    const returnTo = String(request.input('returnTo', ''))
    return response.redirect(
      returnTo === '/admin/places' || returnTo.startsWith('/admin/places?')
        ? returnTo
        : `/admin/places/${params.id}/edit`
    )
  }

  async archive({ params, admin, request, response, session }: HttpContext) {
    try {
      await setPlaceStatus(Number(params.id), 'archived', admin.id)
      session.flash('success', 'Place deactivated.')
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to deactivate place')
    }
    const returnTo = String(request.input('returnTo', ''))
    return response.redirect(
      returnTo === '/admin/places' || returnTo.startsWith('/admin/places?')
        ? returnTo
        : '/admin/places'
    )
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
