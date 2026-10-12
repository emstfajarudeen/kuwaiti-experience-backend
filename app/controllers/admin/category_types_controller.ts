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
    const [rows, media] = await Promise.all([
      categoryTypes(),
      db.from('media').select('id', 'original_name').orderBy('id', 'desc').limit(100),
    ])
    return view.render('admin/category_types', { admin, rows, media })
  }

  async save({ params, request, response, session, admin }: HttpContext) {
    try {
      const input = await categoryTypeValidator.validate(formInput(request))
      await updateCategoryType(params.code, input, admin.id)
      session.flash('success', 'Category type saved.')
    } catch (error) {
      session.flash(
        'error',
        error instanceof Error ? error.message : 'Unable to save category type'
      )
    }
    return response.redirect('/admin/category-types')
  }

  async create({ request, response, session, admin }: HttpContext) {
    try {
      const input = await newCategoryTypeValidator.validate({
        ...formInput(request),
        code: request.input('code'),
      })
      await createCategoryType(input, admin.id)
      session.flash('success', 'Category type created.')
    } catch (error) {
      session.flash(
        'error',
        error instanceof Error ? error.message : 'Unable to create category type'
      )
    }
    return response.redirect('/admin/category-types')
  }

  async destroy({ params, response, session, admin }: HttpContext) {
    try {
      await deleteCategoryType(params.code, admin.id)
      session.flash('success', 'Category type deleted.')
    } catch (error) {
      session.flash(
        'error',
        error instanceof Error ? error.message : 'Unable to delete category type'
      )
    }
    return response.redirect('/admin/category-types')
  }
}
