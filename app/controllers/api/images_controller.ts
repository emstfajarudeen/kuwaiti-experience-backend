import type { HttpContext } from '@adonisjs/core/http'
import { ApiError } from '#services/api_error'
import { isPublicImage, isReferencedImage } from '#services/image_reference_service'
import { isManagedImageKey, streamImage } from '#services/image_storage_service'

export default class ImagesController {
  /** Public delivery: only images owned by visible content. */
  async show({ params, response }: HttpContext) {
    const key = params.key
    if (!isManagedImageKey(key) || !(await isPublicImage(key))) {
      throw new ApiError(404, 'NOT_FOUND', 'Image not found')
    }
    return streamImage(response, key, 'public, max-age=60')
  }

  /** Authenticated admin preview: any image still owned by a record. */
  async adminShow({ params, response }: HttpContext) {
    const key = params.key
    if (!isManagedImageKey(key) || !(await isReferencedImage(key))) {
      throw new ApiError(404, 'NOT_FOUND', 'Image not found')
    }
    return streamImage(response, key, 'private, no-store')
  }
}
