import type { HttpContext } from '@adonisjs/core/http'
import { categoryTypeValidator, newCategoryTypeValidator } from '../../validators/content.js'
import {
  categoryTypes,
  createCategoryType,
  deleteCategoryType,
  updateCategoryType,
} from '../../services/category_type_service.js'

export default class AdminCategoryTypesController {
  async index() {
    return { data: await categoryTypes() }
  }

  async update({ params, request, admin }: HttpContext) {
    const input = await request.validateUsing(categoryTypeValidator)
    await updateCategoryType(params.code, input, admin.id)
    return { data: { code: params.code } }
  }

  async store({ request, response, admin }: HttpContext) {
    const input = await request.validateUsing(newCategoryTypeValidator)
    await createCategoryType(input, admin.id)
    return response.created({ data: { code: input.code } })
  }

  async destroy({ params, response, admin }: HttpContext) {
    await deleteCategoryType(params.code, admin.id)
    return response.noContent()
  }
}
