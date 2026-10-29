import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { categoryValidator } from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'
import { assertPlaceType, categoryTypes } from '../../services/category_type_service.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'

export default class AdminCategoriesPageController {
  async index({ request, inertia, session, admin }: HttpContext) {
    const requestedType = request.input('type')
    const types = await categoryTypes()
    const selectedType =
      typeof requestedType === 'string' && types.some((type) => type.code === requestedType)
        ? requestedType
        : ''
    const query = db
      .from('categories as c')
      .join('category_translations as t', function () {
        this.on('t.category_id', '=', 'c.id').andOnVal('t.locale', '=', 'en')
      })
      .leftJoin('category_translations as ar', function () {
        this.on('ar.category_id', '=', 'c.id').andOnVal('ar.locale', '=', 'ar')
      })
      .leftJoin('category_types as ct', 'ct.code', 'c.type')
      .select(
        'c.id',
        'c.type',
        'c.slug',
        'c.active',
        'c.sort_order',
        't.name',
        't.name as name_en',
        'ar.name as name_ar',
        'ct.image_key as type_image_key',
        db.raw('COALESCE(ct.name_en, c.type) as type_name_en')
      )
      .orderBy('c.type')
      .orderBy('c.sort_order')
    if (selectedType) {
      query.where('c.type', selectedType)
    }
    const rows = await query
    return inertia.render(
      'categories/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        selectedType,
        types: types.map(({ code, name_en: nameEn }) => ({ code, name_en: nameEn })),
        rows: rows.map((row) => ({
          id: Number(row.id),
          type: row.type,
          slug: row.slug,
          active: Boolean(row.active),
          sort_order: Number(row.sort_order),
          name_en: row.name_en,
          name_ar: row.name_ar,
          type_image_key: row.type_image_key,
          type_name_en: row.type_name_en,
        })),
      },
      { bodyClass: 'cms-body' }
    )
  }

  async create({ request, inertia, session, admin }: HttpContext) {
    const types = await categoryTypes()
    return inertia.render(
      'categories/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: this.formValues(session.flashMessages.get('categoryForm')),
        category: null,
        enName: null,
        arName: null,
        types: types.map(({ code, name_en: nameEn }) => ({ code, name_en: nameEn })),
        defaultType: types[0]?.code ?? null,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async edit({ params, request, inertia, session, response, admin }: HttpContext) {
    const id = Number(params.id)
    if (!Number.isSafeInteger(id) || id < 1) return response.redirect('/admin/categories')
    const category = await db.from('categories').where('id', id).first()
    if (!category) return response.redirect('/admin/categories')
    const translations = await db.from('category_translations').where('category_id', category.id)
    const types = await categoryTypes()
    return inertia.render(
      'categories/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: this.formValues(session.flashMessages.get('categoryForm')),
        category: {
          id: Number(category.id),
          type: category.type,
          slug: category.slug,
          sort_order: Number(category.sort_order),
          active: Boolean(category.active),
        },
        types: types.map(({ code, name_en: nameEn }) => ({ code, name_en: nameEn })),
        defaultType: types[0]?.code ?? null,
        enName: translations.find((translation) => translation.locale === 'en')?.name ?? null,
        arName: translations.find((translation) => translation.locale === 'ar')?.name ?? null,
      },
      { bodyClass: 'cms-body' }
    )
  }

  private formValues(value: unknown) {
    if (!value || typeof value !== 'object') return null
    const form = value as Record<string, unknown>
    const field = (key: string) => (typeof form[key] === 'string' ? form[key] : null)
    return {
      type: field('type'),
      slug: field('slug'),
      nameEn: field('nameEn'),
      nameAr: field('nameAr'),
      sortOrder: field('sortOrder'),
      active: field('active'),
    }
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
        const savedCategoryId = id ?? createdCategoryIds[0]
        await trx
          .table('category_translations')
          .insert({ category_id: savedCategoryId, locale: 'en', name: input.nameEn })
          .onConflict(['category_id', 'locale'])
          .merge()
        if (input.nameAr) {
          await trx
            .table('category_translations')
            .insert({ category_id: savedCategoryId, locale: 'ar', name: input.nameAr })
            .onConflict(['category_id', 'locale'])
            .merge()
        } else {
          await trx
            .from('category_translations')
            .where('category_id', savedCategoryId)
            .where('locale', 'ar')
            .delete()
        }
        await trx.table('audit_logs').insert({
          actor_id: admin.id,
          action: id ? 'category.updated' : 'category.created',
          entity_type: 'category',
          entity_id: String(savedCategoryId),
          created_at: new Date(),
        })
        return savedCategoryId
      })
      session.flash('success', 'Category saved.')
      return response.redirect('/admin/categories')
    } catch (error) {
      const fieldErrors = validationErrorBag(error)
      if (fieldErrors) session.flash('inputErrorsBag', fieldErrors)
      session.flash('error', error instanceof Error ? error.message : 'Unable to save category')
      session.flash('categoryForm', request.all())
      return response.redirect(
        params.id ? `/admin/categories/${params.id}/edit` : '/admin/categories/new'
      )
    }
  }

  async destroy({ params, response, session, admin }: HttpContext) {
    const id = Number(params.id)
    if (await db.from('places').where('category_id', id).first()) {
      session.flash('error', 'Reassign places before deleting this category.')
      return response.redirect(`/admin/categories/${id}/edit`)
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
