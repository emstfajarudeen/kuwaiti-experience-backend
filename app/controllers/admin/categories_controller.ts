import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { categoryValidator } from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'
import { assertPlaceType, categoryTypes } from '../../services/category_type_service.js'

export default class AdminCategoriesPageController {
  async index({ view, admin }: HttpContext) {
    const rows = await db
      .from('categories as c')
      .join('category_translations as t', function () {
        this.on('t.category_id', '=', 'c.id').andOnVal('t.locale', '=', 'en')
      })
      .leftJoin('category_translations as ar', function () {
        this.on('ar.category_id', '=', 'c.id').andOnVal('ar.locale', '=', 'ar')
      })
      .select(
        'c.id',
        'c.type',
        'c.slug',
        'c.active',
        'c.sort_order',
        't.name',
        'ar.name as name_ar'
      )
      .orderBy('c.type')
      .orderBy('c.sort_order')
    const types = await categoryTypes()
    return view.render('admin/categories', { admin, rows, types })
  }

  async save({ request, response, session, admin, params }: HttpContext) {
    try {
      const input = await categoryValidator.validate({
        type: request.input('type'),
        slug: request.input('slug'),
        nameEn: request.input('nameEn'),
        nameAr: request.input('nameAr') || null,
        sortOrder: Number(request.input('sortOrder', 0)),
        active: request.input('active') === 'on',
      })
      const id = params.id ? Number(params.id) : undefined
      await assertPlaceType(input.type)
      await db.transaction(async (trx) => {
        if (id) {
          const existing = await trx.from('categories').where('id', id).first()
          if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Category not found')
          if (
            existing.type !== input.type &&
            (await trx.from('places').where('category_id', id).first())
          ) {
            throw new ApiError(409, 'CATEGORY_IN_USE', 'Reassign its places before changing type')
          }
          await trx
            .from('categories')
            .where('id', id)
            .update({
              type: input.type,
              slug: input.slug,
              sort_order: input.sortOrder ?? 0,
              active: input.active,
              updated_at: new Date(),
            })
        }
        const createdCategoryIds = id
          ? []
          : await trx.table('categories').insert({
              type: input.type,
              slug: input.slug,
              sort_order: input.sortOrder ?? 0,
              active: input.active,
              created_at: new Date(),
              updated_at: new Date(),
            })
        const categoryId = id ?? createdCategoryIds[0]
        await trx
          .table('category_translations')
          .insert({ category_id: categoryId, locale: 'en', name: input.nameEn })
          .onConflict(['category_id', 'locale'])
          .merge()
        if (input.nameAr)
          await trx
            .table('category_translations')
            .insert({ category_id: categoryId, locale: 'ar', name: input.nameAr })
            .onConflict(['category_id', 'locale'])
            .merge()
        else
          await trx
            .from('category_translations')
            .where('category_id', categoryId)
            .where('locale', 'ar')
            .delete()
        await trx.table('audit_logs').insert({
          actor_id: admin.id,
          action: id ? 'category.updated' : 'category.created',
          entity_type: 'category',
          entity_id: String(categoryId),
          created_at: new Date(),
        })
      })
      session.flash('success', 'Category saved.')
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to save category')
    }
    return response.redirect('/admin/categories')
  }

  async destroy({ params, response, session, admin }: HttpContext) {
    const id = Number(params.id)
    if (await db.from('places').where('category_id', id).first()) {
      session.flash('error', 'Reassign places before deleting this category.')
      return response.redirect('/admin/categories')
    }
    await db.transaction(async (trx) => {
      await trx.from('categories').where('id', id).delete()
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'category.deleted',
        entity_type: 'category',
        entity_id: String(id),
        created_at: new Date(),
      })
    })
    session.flash('success', 'Category deleted.')
    return response.redirect('/admin/categories')
  }
}
