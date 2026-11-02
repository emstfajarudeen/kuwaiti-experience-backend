import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import { pageValidator } from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'
import {
  hasPlaceholderPageCopy,
  normalizePageBody,
  pageBodyFormat,
  safePageBody,
} from '../../services/page_content_service.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'

export default class AdminPagesPageController {
  async index({ inertia, request, session, admin }: HttpContext) {
    const rows = await db
      .from('pages as p')
      .leftJoin('page_translations as t', function () {
        this.on('t.page_id', '=', 'p.id').andOnVal('t.locale', '=', 'en')
      })
      .select('p.id', 'p.slug', 'p.status', 't.title')
      .orderBy('p.slug')
    return inertia.render(
      'pages/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        // CORS origins describe allowed browser requests to this API and can be
        // localhost in development; they are not the public website's base URL.
        publicSiteUrl: env.get('PUBLIC_SITE_URL') ?? 'https://thekuwaitiexperience.com',
        rows: rows.map((row) => ({
          id: Number(row.id),
          slug: row.slug,
          status: row.status,
          title: row.title,
        })),
      },
      { bodyClass: 'cms-body' }
    )
  }

  async edit({ params, inertia, request, session, response, admin }: HttpContext) {
    const page = params.id ? await db.from('pages').where('id', params.id).first() : null
    if (params.id && !page) return response.redirect('/admin/pages')
    const translationRows = page ? await db.from('page_translations').where('page_id', page.id) : []
    const translations = translationRows.map((translation) => ({
      locale: translation.locale,
      title: translation.title,
      eyebrow: translation.eyebrow,
      body: safePageBody(translation.body, pageBodyFormat(translation.body_format)),
      body_format: pageBodyFormat(translation.body_format),
      seo_title: translation.seo_title,
      seo_description: translation.seo_description,
    }))
    return inertia.render(
      'pages/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        fieldErrors:
          (session.flashMessages.get('pageFieldErrors') as Record<string, string[]> | undefined) ??
          null,
        form: this.formValues(session.flashMessages.get('pageForm')),
        page: page ? { id: Number(page.id), slug: page.slug, status: page.status } : null,
        en: translations.find((item) => item.locale === 'en') ?? null,
        ar: translations.find((item) => item.locale === 'ar') ?? null,
      },
      { bodyClass: 'cms-body' }
    )
  }

  private formValues(value: unknown) {
    if (!value || typeof value !== 'object') return null
    const form = value as Record<string, unknown>
    const field = (key: string) => (typeof form[key] === 'string' ? form[key] : null)
    return Object.fromEntries(
      [
        'slug',
        'titleEn',
        'bodyEn',
        'eyebrowEn',
        'bodyFormatEn',
        'titleAr',
        'bodyAr',
        'eyebrowAr',
        'bodyFormatAr',
        'seoTitleEn',
        'seoDescriptionEn',
      ].map((key) => [key, field(key)])
    )
  }

  async save({ request, response, session, admin, params }: HttpContext) {
    let normalizingPageBodyField = 'bodyEn'
    try {
      const input = await pageValidator.validate({
        slug: request.input('slug'),
        titleEn: request.input('titleEn'),
        bodyEn: request.input('bodyEn'),
        eyebrowEn: request.input('eyebrowEn') || null,
        bodyFormatEn: request.input('bodyFormatEn') || 'plain_text',
        titleAr: request.input('titleAr') || null,
        bodyAr: request.input('bodyAr') || null,
        eyebrowAr: request.input('eyebrowAr') || null,
        bodyFormatAr: request.input('bodyFormatAr') || 'plain_text',
        seoTitleEn: request.input('seoTitleEn') || null,
        seoDescriptionEn: request.input('seoDescriptionEn') || null,
      })
      const bodyEn = input.bodyEn.trim()
        ? normalizePageBody(input.bodyEn, input.bodyFormatEn ?? 'plain_text')
        : ''
      if (!bodyEn && params.id) {
        const currentPage = await db.from('pages').where('id', params.id).first()
        if (currentPage?.status === 'published') {
          throw new ApiError(
            422,
            'INVALID_PAGE_BODY',
            'Add English page content before saving changes to a published page.'
          )
        }
      }
      let bodyAr: string | null = null
      if (input.titleAr && input.bodyAr) {
        normalizingPageBodyField = 'bodyAr'
        bodyAr = normalizePageBody(input.bodyAr, input.bodyFormatAr ?? 'plain_text')
      }
      await db.transaction(async (trx) => {
        let pageId = params.id ? Number(params.id) : undefined
        if (pageId) {
          const changed = await trx
            .from('pages')
            .where('id', pageId)
            .update({ slug: input.slug, updated_at: new Date() })
          if (!changed) throw new ApiError(404, 'NOT_FOUND', 'Page not found')
        } else {
          const createdPageIds = await trx.table('pages').insert({
            slug: input.slug,
            status: 'draft',
            created_at: new Date(),
            updated_at: new Date(),
          })
          pageId = createdPageIds[0]
        }
        await trx
          .table('page_translations')
          .insert({
            page_id: pageId,
            locale: 'en',
            title: input.titleEn,
            eyebrow: input.eyebrowEn || null,
            body: bodyEn,
            body_format: input.bodyFormatEn ?? 'plain_text',
            seo_title: input.seoTitleEn ?? null,
            seo_description: input.seoDescriptionEn ?? null,
          })
          .onConflict(['page_id', 'locale'])
          .merge()
        if (input.titleAr && bodyAr)
          await trx
            .table('page_translations')
            .insert({
              page_id: pageId,
              locale: 'ar',
              title: input.titleAr,
              eyebrow: input.eyebrowAr || null,
              body: bodyAr,
              body_format: input.bodyFormatAr ?? 'plain_text',
            })
            .onConflict(['page_id', 'locale'])
            .merge()
        else
          await trx
            .from('page_translations')
            .where('page_id', pageId!)
            .where('locale', 'ar')
            .delete()
        await trx.table('audit_logs').insert({
          actor_id: admin.id,
          action: params.id ? 'page.updated' : 'page.created',
          entity_type: 'page',
          entity_id: String(pageId),
          created_at: new Date(),
        })
        return pageId
      })
      session.flash('success', 'Page saved.')
      return response.redirect('/admin/pages')
    } catch (error) {
      const fieldErrors = validationErrorBag(error)
      if (fieldErrors) session.flash('pageFieldErrors', fieldErrors)
      else if (error instanceof ApiError && error.code === 'INVALID_PAGE_BODY')
        session.flash('pageFieldErrors', { [normalizingPageBodyField]: [error.message] })
      else session.flash('error', error instanceof Error ? error.message : 'Unable to save page')
      session.flash('pageForm', request.all())
      return response.redirect(params.id ? `/admin/pages/${params.id}/edit` : '/admin/pages/new')
    }
  }

  async publish({ params, response, session, admin }: HttpContext) {
    const id = Number(params.id)
    const page = await db.from('pages').where('id', id).first()
    if (!page) return response.redirect('/admin/pages')
    const en = await db.from('page_translations').where('page_id', id).where('locale', 'en').first()
    if (!en?.title || !en.body) {
      session.flash('pageFieldErrors', {
        ...(!en?.title ? { titleEn: ['Enter an English page title before publishing.'] } : {}),
        ...(!en?.body ? { bodyEn: ['Add English page content before publishing.'] } : {}),
      })
      return response.redirect(`/admin/pages/${id}/edit`)
    }
    if (hasPlaceholderPageCopy(en.body)) {
      session.flash('pageFieldErrors', {
        bodyEn: [
          'Replace the demo text in the English page body with approved copy, save the page, then publish again.',
        ],
      })
      return response.redirect(`/admin/pages/${id}/edit`)
    }
    await db
      .from('pages')
      .where('id', id)
      .update({
        status: 'published',
        published_at: new Date(Math.floor(Date.now() / 1000) * 1000),
        updated_at: new Date(),
      })
    await db.table('audit_logs').insert({
      actor_id: admin.id,
      action: 'page.published',
      entity_type: 'page',
      entity_id: String(id),
      created_at: new Date(),
    })
    session.flash('success', 'Page published.')
    return response.redirect('/admin/pages')
  }

  async archive({ params, response, session }: HttpContext) {
    const id = Number(params.id)
    await db
      .from('pages')
      .where('id', id)
      .update({ status: 'archived', published_at: null, updated_at: new Date() })
    session.flash('success', 'Page archived.')
    return response.redirect('/admin/pages')
  }

  async destroy({ params, response, session }: HttpContext) {
    await db.from('pages').where('id', Number(params.id)).delete()
    session.flash('success', 'Page deleted.')
    return response.redirect('/admin/pages')
  }
}
