import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { pageValidator } from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'

export default class AdminPagesController {
  async index() {
    const rows = await db
      .from('pages as p')
      .leftJoin('page_translations as t', function () {
        this.on('t.page_id', '=', 'p.id').andOnVal('t.locale', '=', 'en')
      })
      .select('p.id', 'p.slug', 'p.status', 'p.updated_at', 't.title')
      .orderBy('p.slug')
    return { data: rows }
  }

  async show({ params }: HttpContext) {
    const page = await db.from('pages').where('id', params.id).first()
    if (!page) throw new ApiError(404, 'NOT_FOUND', 'Page not found')
    return {
      data: { ...page, translations: await db.from('page_translations').where('page_id', page.id) },
    }
  }

  async store({ request, admin, response }: HttpContext) {
    const input = await request.validateUsing(pageValidator)
    const id = await db.transaction(async (trx) => {
      const [pageId] = await trx.table('pages').insert({
        slug: input.slug,
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      })
      await trx.table('page_translations').insert({
        page_id: pageId,
        locale: 'en',
        title: input.titleEn,
        body: input.bodyEn,
        seo_title: input.seoTitleEn ?? null,
        seo_description: input.seoDescriptionEn ?? null,
      })
      if (input.titleAr && input.bodyAr)
        await trx.table('page_translations').insert({
          page_id: pageId,
          locale: 'ar',
          title: input.titleAr,
          body: input.bodyAr,
        })
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'page.created',
        entity_type: 'page',
        entity_id: String(pageId),
        created_at: new Date(),
      })
      return pageId
    })
    return response.created({ data: { id } })
  }

  async update({ params, request, admin }: HttpContext) {
    const id = Number(params.id)
    const input = await request.validateUsing(pageValidator)
    await db.transaction(async (trx) => {
      const changed = await trx
        .from('pages')
        .where('id', id)
        .update({ slug: input.slug, updated_at: new Date() })
      if (!changed) throw new ApiError(404, 'NOT_FOUND', 'Page not found')
      await trx
        .table('page_translations')
        .insert({
          page_id: id,
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
            page_id: id,
            locale: 'ar',
            title: input.titleAr,
            body: input.bodyAr,
          })
          .onConflict(['page_id', 'locale'])
          .merge()
      else await trx.from('page_translations').where('page_id', id).where('locale', 'ar').delete()
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'page.updated',
        entity_type: 'page',
        entity_id: String(id),
        created_at: new Date(),
      })
    })
    return { data: { id } }
  }

  async publish({ params, admin }: HttpContext) {
    const id = Number(params.id)
    await db.transaction(async (trx) => {
      const page = await trx.from('pages').where('id', id).first()
      if (!page) throw new ApiError(404, 'NOT_FOUND', 'Page not found')
      const en = await trx
        .from('page_translations')
        .where('page_id', id)
        .where('locale', 'en')
        .first()
      if (!en?.title || !en.body)
        throw new ApiError(422, 'INCOMPLETE_PAGE', 'English content is required')
      await trx
        .from('pages')
        .where('id', id)
        .update({ status: 'published', published_at: new Date(), updated_at: new Date() })
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'page.published',
        entity_type: 'page',
        entity_id: String(id),
        created_at: new Date(),
      })
    })
    return { data: { id, status: 'published' } }
  }

  async archive({ params, admin }: HttpContext) {
    const id = Number(params.id)
    const changed = await db
      .from('pages')
      .where('id', id)
      .update({ status: 'archived', published_at: null, updated_at: new Date() })
    if (!changed) throw new ApiError(404, 'NOT_FOUND', 'Page not found')
    await db.table('audit_logs').insert({
      actor_id: admin.id,
      action: 'page.archived',
      entity_type: 'page',
      entity_id: String(id),
      created_at: new Date(),
    })
    return { data: { id, status: 'archived' } }
  }

  async destroy({ params, admin, response }: HttpContext) {
    const id = Number(params.id)
    const changed = await db.from('pages').where('id', id).delete()
    if (!changed) throw new ApiError(404, 'NOT_FOUND', 'Page not found')
    await db.table('audit_logs').insert({
      actor_id: admin.id,
      action: 'page.deleted',
      entity_type: 'page',
      entity_id: String(id),
      created_at: new Date(),
    })
    return response.noContent()
  }
}
