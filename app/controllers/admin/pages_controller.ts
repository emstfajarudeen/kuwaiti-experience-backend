import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { pageValidator } from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'

export default class AdminPagesPageController {
  async index({ view, admin }: HttpContext) {
    const rows = await db
      .from('pages as p')
      .leftJoin('page_translations as t', function () {
        this.on('t.page_id', '=', 'p.id').andOnVal('t.locale', '=', 'en')
      })
      .select('p.id', 'p.slug', 'p.status', 't.title')
      .orderBy('p.slug')
    return view.render('admin/pages/index', { admin, rows })
  }

  async edit({ params, view, response, admin }: HttpContext) {
    const page = params.id ? await db.from('pages').where('id', params.id).first() : null
    if (params.id && !page) return response.redirect('/admin/pages')
    const translations = page ? await db.from('page_translations').where('page_id', page.id) : []
    return view.render('admin/pages/edit', {
      admin,
      page,
      en: translations.find((item) => item.locale === 'en'),
      ar: translations.find((item) => item.locale === 'ar'),
    })
  }

  async save({ request, response, session, admin, params }: HttpContext) {
    try {
      const input = await pageValidator.validate({
        slug: request.input('slug'),
        titleEn: request.input('titleEn'),
        bodyEn: request.input('bodyEn'),
        titleAr: request.input('titleAr') || null,
        bodyAr: request.input('bodyAr') || null,
        seoTitleEn: request.input('seoTitleEn') || null,
        seoDescriptionEn: request.input('seoDescriptionEn') || null,
      })
      const id = await db.transaction(async (trx) => {
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
            body: input.bodyEn,
            seo_title: input.seoTitleEn ?? null,
            seo_description: input.seoDescriptionEn ?? null,
          })
          .onConflict(['page_id', 'locale'])
          .merge()
        if (input.titleAr && input.bodyAr)
          await trx
            .table('page_translations')
            .insert({
              page_id: pageId,
              locale: 'ar',
              title: input.titleAr,
              body: input.bodyAr,
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
      return response.redirect(`/admin/pages/${id}/edit`)
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to save page')
      return response.redirect(params.id ? `/admin/pages/${params.id}/edit` : '/admin/pages/new')
    }
  }

  async publish({ params, response, session, admin }: HttpContext) {
    const id = Number(params.id)
    const en = await db.from('page_translations').where('page_id', id).where('locale', 'en').first()
    if (!en?.title || !en.body) {
      session.flash('error', 'English title and body are required.')
      return response.redirect(`/admin/pages/${id}/edit`)
    }
    await db
      .from('pages')
      .where('id', id)
      .update({ status: 'published', published_at: new Date(), updated_at: new Date() })
    await db.table('audit_logs').insert({
      actor_id: admin.id,
      action: 'page.published',
      entity_type: 'page',
      entity_id: String(id),
      created_at: new Date(),
    })
    session.flash('success', 'Page published.')
    return response.redirect(`/admin/pages/${id}/edit`)
  }

  async archive({ params, response, session }: HttpContext) {
    const id = Number(params.id)
    await db
      .from('pages')
      .where('id', id)
      .update({ status: 'archived', published_at: null, updated_at: new Date() })
    session.flash('success', 'Page archived.')
    return response.redirect(`/admin/pages/${id}/edit`)
  }

  async destroy({ params, response, session }: HttpContext) {
    await db.from('pages').where('id', Number(params.id)).delete()
    session.flash('success', 'Page deleted.')
    return response.redirect('/admin/pages')
  }
}
