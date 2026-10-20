import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import logger from '@adonisjs/core/services/logger'
import sharp from 'sharp'
import { customer } from '../serializers/customer.js'
import { ApiError } from './api_error.js'

export function profilePhotoKey(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid managed photo identifier')
  return `customer-profiles/${id}.webp`
}

export async function eraseProfilePhoto(id?: string | null) {
  if (!id) return
  try {
    await drive.use('local').delete(profilePhotoKey(id))
  } catch {
    logger.warn(
      { profile_photo_id: id },
      'Profile photo cleanup failed; retry images:prune-orphans --delete after its grace period'
    )
  }
}

export async function saveProfilePhoto(customerId: number, buffer: Buffer) {
  let image: Buffer
  try {
    const pipeline = sharp(buffer, { failOn: 'error', limitInputPixels: 20_000_000 })
    const metadata = await pipeline.metadata()
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error('Invalid image')
    // Re-encode strips source metadata including GPS; never retain original bytes.
    image = await pipeline
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    throw new ApiError(
      422,
      'INVALID_IMAGE',
      'Upload a valid JPEG, PNG or WebP image up to 5 MB and 20 megapixels'
    )
  }
  const id = randomUUID()
  await drive.use('local').put(profilePhotoKey(id), image)
  let result
  try {
    result = await db.transaction(async (trx) => {
      const row = await trx.from('customers').where('id', customerId).forUpdate().first()
      if (!row) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
      await trx
        .from('customers')
        .where('id', customerId)
        .update({ profile_photo_id: id, updated_at: new Date() })
      const updated = await trx.from('customers').where('id', customerId).firstOrFail()
      return { oldId: row.profile_photo_id as string | null, data: customer(updated) }
    })
  } catch (error) {
    await eraseProfilePhoto(id)
    throw error
  }
  await eraseProfilePhoto(result.oldId)
  return { data: result.data }
}

export async function removeProfilePhoto(customerId: number) {
  const result = await db.transaction(async (trx) => {
    const row = await trx.from('customers').where('id', customerId).forUpdate().first()
    if (!row) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
    await trx
      .from('customers')
      .where('id', customerId)
      .update({ profile_photo_id: null, updated_at: new Date() })
    const updated = await trx.from('customers').where('id', customerId).firstOrFail()
    return { oldId: row.profile_photo_id as string | null, data: customer(updated) }
  })
  await eraseProfilePhoto(result.oldId)
  return { data: result.data }
}
