import type { HttpContext } from '@adonisjs/core/http'
import { categoryTypeValidator, newCategoryTypeValidator } from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'
import {
  categoryTypes,
  createCategoryType,
  deleteCategoryType,
  setCategoryTypeImage,
  updateCategoryType,
} from '../../services/category_type_service.js'
import {
  adminApiImageUrl,
  imageFiles,
  prepareImages,
} from '../../services/image_storage_service.js'

export default class AdminCategoryTypesController {
  async index() {
    const rows = await categoryTypes()
    return {
      data: rows.map(({ image_key: imageKey, ...row }) => ({
        ...row,
        image_url: adminApiImageUrl(imageKey),
      })),
    }
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

  async updateImage({ params, request, admin }: HttpContext) {
    const files = imageFiles(request, 'file')
    if (!files.length) throw new ApiError(422, 'INVALID_IMAGE', 'Attach an image file')
    const { image } = await prepareImages(admin.id, { image: files })
    await setCategoryTypeImage(params.code, image[0], admin.id)
    const rows = await categoryTypes()
    const row = rows.find((type) => type.code === params.code)
    return { data: { code: params.code, image_url: adminApiImageUrl(row?.image_key) } }
  }

  async removeImage({ params, response, admin }: HttpContext) {
    await setCategoryTypeImage(params.code, 'remove', admin.id)
    return response.noContent()
  }
}
