import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { categoryTypeValidator, newCategoryTypeValidator } from '../../validators/content.js'
import {
  categoryTypes,
  createCategoryType,
  deleteCategoryType,
  updateCategoryType,
} from '../../services/category_type_service.js'

function formInput(request: HttpContext['request']) {
  return {
    nameEn: request.input('nameEn'),
    nameAr: request.input('nameAr') || null,
    imageId: request.input('imageId') ? Number(request.input('imageId')) : null,
    sortOrder: Number(request.input('sortOrder')),
  }
}

export default class AdminCategoryTypesPageController {
  async index({ view, admin }: HttpContext) {
    return view.render('admin/category_types/index', { admin, rows: await categoryTypes() })
  }

  async create({ view, admin }: HttpContext) {
    const [media, rows] = await Promise.all([
      db.from('media').select('id', 'original_name').orderBy('id', 'desc').limit(100),
      categoryTypes(),
    ])
    return view.render('admin/category_types/edit', {
      admin,
      categoryType: null,
      media,
      nextOrder: rows.length,
    })
  }

  async edit({ params, view, response, admin }: HttpContext) {
    const [categoryType, media] = await Promise.all([
      db.from('category_types').where('code', params.code).first(),
      db.from('media').select('id', 'original_name').orderBy('id', 'desc').limit(100),
    ])
    if (!categoryType) return response.redirect('/admin/category-types')
    return view.render('admin/category_types/edit', { admin, categoryType, media, nextOrder: 0 })
  }

  async save({ params, request, response, session, admin }: HttpContext) {
    try {
      if (params.code) {
        const input = await categoryTypeValidator.validate(formInput(request))
        await updateCategoryType(params.code, input, admin.id)
        session.flash('success', 'Category type saved.')
        return response.redirect('/admin/category-types/saved')
      }
      const input = await newCategoryTypeValidator.validate({
        ...formInput(request),
        code: request.input('code'),
      })
      await createCategoryType(input, admin.id)
      session.flash('success', 'Category type created.')
      return response.redirect('/admin/category-types/saved')
    } catch (error) {
      session.flash(
        'error',
        error instanceof Error ? error.message : 'Unable to save category type'
      )
      session.flash('categoryTypeForm', request.all())
      return response.redirect(
        params.code ? `/admin/category-types/${params.code}/edit` : '/admin/category-types/new'
      )
    }
  }

  async destroy({ params, response, session, admin }: HttpContext) {
    try {
      await deleteCategoryType(params.code, admin.id)
      session.flash('success', 'Category type deleted.')
      return response.redirect('/admin/category-types')
    } catch (error) {
      session.flash(
        'error',
        error instanceof Error ? error.message : 'Unable to delete category type'
      )
      return response.redirect(`/admin/category-types/${params.code}/edit`)
    }
  }
}
