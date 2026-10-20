import { readFile } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import {
  customerProfileValidator,
  phoneValidator,
  otpValidator,
} from '../../validators/customer.js'
import {
  updateCustomerProfile,
  requestOtp,
  verifyOtp,
} from '../../services/customer_auth_service.js'
import {
  saveProfilePhoto,
  removeProfilePhoto,
  profilePhotoKey,
} from '../../services/customer_photo_service.js'
import { ApiError } from '../../services/api_error.js'

export default class CustomerProfileController {
  async update({ request, customerIdentity }: HttpContext) {
    const input = await request.validateUsing(customerProfileValidator)
    return updateCustomerProfile(customerIdentity, input)
  }
  async requestPhone({ request, customerIdentity, response }: HttpContext) {
    const input = await request.validateUsing(phoneValidator)
    return response.accepted(await requestOtp(input.phone_e164, undefined, customerIdentity))
  }
  async resendPhone({ params, customerIdentity, response }: HttpContext) {
    return response.accepted(await requestOtp(undefined, params.id, customerIdentity))
  }
  async verifyPhone({ request, params, customerIdentity }: HttpContext) {
    const input = await request.validateUsing(otpValidator)
    return verifyOtp(params.id, input.code, customerIdentity)
  }
  async upload({ request, customerIdentity }: HttpContext) {
    const file = request.file('file', { size: '5mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] })
    if (!file?.isValid || !file.tmpPath)
      throw new ApiError(422, 'INVALID_IMAGE', 'Upload a JPEG, PNG or WebP image up to 5 MB')
    return saveProfilePhoto(customerIdentity.customer.id, await readFile(file.tmpPath))
  }
  async photo({ customerIdentity, response }: HttpContext) {
    const row = await db
      .from('customers')
      .where('id', customerIdentity.customer.id)
      .select('profile_photo_id')
      .first()
    if (!row?.profile_photo_id) throw new ApiError(404, 'NOT_FOUND', 'Profile photo not found')
    const disk = drive.use('local')
    const key = profilePhotoKey(row.profile_photo_id)
    if (!(await disk.exists(key))) throw new ApiError(404, 'NOT_FOUND', 'Profile photo not found')
    response.header('Content-Type', 'image/webp')
    response.header('X-Content-Type-Options', 'nosniff')
    return response.stream(await disk.getStream(key))
  }
  async removePhoto({ customerIdentity }: HttpContext) {
    return removeProfilePhoto(customerIdentity.customer.id)
  }
}
