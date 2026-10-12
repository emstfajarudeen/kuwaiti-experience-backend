import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { categoryValidator } from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'
import { assertPlaceType } from '../../services/category_type_service.js'

export default class AdminCategoriesController {
  async index({ request }: HttpContext) {
    const query = db
      .from('categories as c')
      .join('category_translations as t', function () {
        this.on('t.category_id', '=', 'c.id').andOnVal('t.locale', '=', 'en')
      })
      .select('c.id', 'c.type', 'c.slug', 'c.active', 'c.image_id', 'c.sort_order', 't.name')
    if (request.input('type')) query.where('c.type', await assertPlaceType(request.input('type')))
    return { data: await query.orderBy('c.type').orderBy('c.sort_order').orderBy('c.id') }
  }

  async store({ request, response, admin }: HttpContext) {
    const input = await request.validateUsing(categoryValidator)
    await assertPlaceType(input.type)
    if (input.imageId && !(await db.from('media').where('id', input.imageId).first())) {
      throw new ApiError(422, 'INVALID_MEDIA', 'Image not found')
    }
    const id = await db.transaction(async (trx) => {
      const [categoryId] = await trx.table('categories').insert({
        type: input.type,
        slug: input.slug,
        image_id: input.imageId ?? null,
        sort_order: input.sortOrder ?? 0,
        active: input.active ?? true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      await trx
        .table('category_translations')
        .insert({ category_id: categoryId, locale: 'en', name: input.nameEn })
      if (input.nameAr)
        await trx.table('category_translations').insert({
          category_id: categoryId,
          locale: 'ar',
          name: input.nameAr,
        })
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'category.created',
        entity_type: 'category',
        entity_id: String(categoryId),
        created_at: new Date(),
      })
      return categoryId
    })
    return response.created({ data: { id } })
  }

  async update({ params, request, admin }: HttpContext) {
    const input = await request.validateUsing(categoryValidator)
    await assertPlaceType(input.type)
    const id = Number(params.id)
    const existing = await db.from('categories').where('id', id).first()
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Category not found')
    if (
      existing.type !== input.type &&
      (await db.from('places').where('category_id', id).first())
    ) {
      throw new ApiError(
        409,
        'CATEGORY_IN_USE',
        'Reassign places before changing the category type'
      )
    }
    if (input.imageId && !(await db.from('media').where('id', input.imageId).first())) {
      throw new ApiError(422, 'INVALID_MEDIA', 'Image not found')
    }
    await db.transaction(async (trx) => {
      await trx
        .from('categories')
        .where('id', id)
        .update({
          type: input.type,
          slug: input.slug,
          image_id: input.imageId ?? null,
          sort_order: input.sortOrder ?? 0,
          active: input.active ?? true,
          updated_at: new Date(),
        })
      await trx
        .table('category_translations')
        .insert({ category_id: id, locale: 'en', name: input.nameEn })
        .onConflict(['category_id', 'locale'])
        .merge()
      if (input.nameAr)
        await trx
          .table('category_translations')
          .insert({ category_id: id, locale: 'ar', name: input.nameAr })
          .onConflict(['category_id', 'locale'])
          .merge()
      else
        await trx
          .from('category_translations')
          .where('category_id', id)
          .where('locale', 'ar')
          .delete()
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'category.updated',
        entity_type: 'category',
        entity_id: String(id),
        created_at: new Date(),
      })
    })
    return { data: { id } }
  }

  async destroy({ params, admin, response }: HttpContext) {
    const id = Number(params.id)
    if (await db.from('places').where('category_id', id).first()) {
      throw new ApiError(409, 'CATEGORY_IN_USE', 'Reassign places before deleting this category')
    }
    await db.transaction(async (trx) => {
      const deleted = await trx.from('categories').where('id', id).delete()
      if (!deleted) throw new ApiError(404, 'NOT_FOUND', 'Category not found')
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'category.deleted',
        entity_type: 'category',
        entity_id: String(id),
        created_at: new Date(),
      })
    })
    return response.noContent()
  }
}
