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
import { validationErrorBag } from '../../services/validation_error_bag.js'

function formInput(request: HttpContext['request']) {
  return {
    nameEn: request.input('nameEn'),
    nameAr: request.input('nameAr') || null,
    sortOrder: Number(request.input('sortOrder')),
  }
}

export default class AdminCategoryTypesPageController {
  async index({ inertia, request, session, admin }: HttpContext) {
    const types = await categoryTypes()
    const rows = types.map((row) => ({
      code: row.code,
      name_en: row.name_en,
      name_ar: row.name_ar,
      sort_order: Number(row.sort_order),
      imageUrl: cmsImageUrl(row.image_key),
    }))
    return inertia.render(
      'category_types/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        rows,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async create({ inertia, request, session, admin }: HttpContext) {
    const rows = await categoryTypes()
    return inertia.render(
      'category_types/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: this.formValues(session.flashMessages.get('categoryTypeForm')),
        categoryType: null,
        imageUrl: null,
        nextOrder: rows.length,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async edit({ params, inertia, request, session, response, admin }: HttpContext) {
    const categoryType = await db.from('category_types').where('code', params.code).first()
    if (!categoryType) return response.redirect('/admin/category-types')
    return inertia.render(
      'category_types/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: this.formValues(session.flashMessages.get('categoryTypeForm')),
        categoryType: {
          code: categoryType.code,
          name_en: categoryType.name_en,
          name_ar: categoryType.name_ar,
          sort_order: Number(categoryType.sort_order),
        },
        imageUrl: cmsImageUrl(categoryType.image_key),
        nextOrder: 0,
      },
      { bodyClass: 'cms-body' }
    )
  }

  private formValues(value: unknown) {
    if (!value || typeof value !== 'object') return null
    const form = value as Record<string, unknown>
    const field = (key: string) => (typeof form[key] === 'string' ? form[key] : null)
    return {
      code: field('code'),
      nameEn: field('nameEn'),
      nameAr: field('nameAr'),
      sortOrder: field('sortOrder'),
      removeImage: field('removeImage'),
    }
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
        return response.redirect('/admin/category-types')
      }
      const input = await newCategoryTypeValidator.validate({
        ...formInput(request),
        code: request.input('code'),
      })
      const { image } = await prepareImages(admin.id, { image: imageFiles(request, 'image') })
      await createCategoryType(input, admin.id, image[0])
      session.flash('success', 'Category type created.')
      return response.redirect('/admin/category-types')
    } catch (error) {
      const fieldErrors = validationErrorBag(error)
      if (fieldErrors) session.flash('inputErrorsBag', fieldErrors)
      const message = error instanceof Error ? error.message : 'Unable to save category type'
      const attached = Object.keys(request.allFiles()).length > 0
      session.flash(
        'error',
        attached ? `${message.replace(/\.$/, '')}. Re-select the image you attached.` : message
      )
      session.flash('categoryTypeForm', request.except(['image']))
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
