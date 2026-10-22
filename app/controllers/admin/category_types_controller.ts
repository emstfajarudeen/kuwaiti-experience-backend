import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { categoryTypeValidator, newCategoryTypeValidator } from '../../validators/content.js'
import {
  categoryTypes,
  createCategoryType,
  deleteCategoryType,
  updateCategoryType,
} from '../../services/category_type_service.js'
import { cmsImageUrl, imageFiles, prepareImages } from '../../services/image_storage_service.js'

function formInput(request: HttpContext['request']) {
  return {
    nameEn: request.input('nameEn'),
    nameAr: request.input('nameAr') || null,
    sortOrder: Number(request.input('sortOrder')),
  }
}

export default class AdminCategoryTypesPageController {
  async index({ view, admin }: HttpContext) {
    const types = await categoryTypes()
    const rows = types.map((row) => ({
      ...row,
      imageUrl: cmsImageUrl(row.image_key),
    }))
    return view.render('admin/category_types/index', { admin, rows })
  }

  async create({ view, admin }: HttpContext) {
    const rows = await categoryTypes()
    return view.render('admin/category_types/edit', {
      admin,
      categoryType: null,
      imageUrl: null,
      nextOrder: rows.length,
    })
  }

  async edit({ params, view, response, admin }: HttpContext) {
    const categoryType = await db.from('category_types').where('code', params.code).first()
    if (!categoryType) return response.redirect('/admin/category-types')
    return view.render('admin/category_types/edit', {
      admin,
      categoryType,
      imageUrl: cmsImageUrl(categoryType.image_key),
      nextOrder: 0,
    })
  }

  async save({ params, request, response, session, admin }: HttpContext) {
    try {
      if (params.code) {
        const input = await categoryTypeValidator.validate(formInput(request))
        const { image } = await prepareImages(admin.id, { image: imageFiles(request, 'image') })
        const removeImage = request.input('removeImage')
        const isRemove = removeImage === 'on' || removeImage === '1' || removeImage === 'true'
        await updateCategoryType(
          params.code,
          input,
          admin.id,
          image[0] ?? (isRemove ? 'remove' : undefined)
        )
        session.flash('success', 'Category type saved.')
        return response.redirect('/admin/category-types/saved')
      }
      const input = await newCategoryTypeValidator.validate({
        ...formInput(request),
        code: request.input('code'),
      })
      const { image } = await prepareImages(admin.id, { image: imageFiles(request, 'image') })
      await createCategoryType(input, admin.id, image[0])
      session.flash('success', 'Category type created.')
      return response.redirect('/admin/category-types/saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save category type'
      const attached = Object.keys(request.allFiles()).length > 0
      session.flash(
        'error',
        attached ? `${message.replace(/\.$/, '')}. Re-select the image you attached.` : message
      )
      session.flash('categoryTypeForm', request.except(['image', 'removeImage']))
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
