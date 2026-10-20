import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import logger from '@adonisjs/core/services/logger'
import drive from '@adonisjs/drive/services/main'
import sharp from 'sharp'
import { ApiError } from '#services/api_error'

export const MAX_IMAGES_PER_REQUEST = 5
export const MAX_GALLERY_IMAGES = 20
const MAX_PIXELS = 20_000_000
const fileOptions = { size: '5mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] }
const keyPattern =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|demo-[a-z0-9]+(?:-[a-z0-9]+)*)\.webp$/

/** A decoded, re-encoded WebP image that has not been written to storage yet. */
export type PreparedImage = { buffer: Buffer }

export function isManagedImageKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && keyPattern.test(value)
}

export function publicImageUrl(key: string | null | undefined) {
  return key ? `/api/v1/images/${key}` : null
}

export function adminApiImageUrl(key: string | null | undefined) {
  return key ? `/api/v1/admin/images/${key}` : null
}

export function cmsImageUrl(key: string | null | undefined) {
  return key ? `/admin/images/${key}` : null
}

/** Reads the uploaded files of one form field, rejecting more than `max` files. */
export function imageFiles(request: HttpContext['request'], field: string, max = 1) {
  const files = request.files(field, fileOptions)
  if (files.length > max) {
    throw new ApiError(
      422,
      'TOO_MANY_FILES',
      max === 1 ? 'Upload one image for this field' : `Upload up to ${max} images at a time`
    )
  }
  return files
}

async function processImage(file: MultipartFile): Promise<PreparedImage> {
  try {
    const image = sharp(await readFile(file.tmpPath!), { failOn: 'error' })
    const metadata = await image.metadata()
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_PIXELS
    ) {
      throw new Error('Invalid dimensions or format')
    }
    return { buffer: await image.rotate().webp({ quality: 82, effort: 4 }).toBuffer() }
  } catch {
    throw new ApiError(422, 'INVALID_IMAGE', 'The image could not be processed')
  }
}

/**
 * Validates and processes every uploaded image of a request before any file
 * or database side effect. Consumes one upload allowance point per image.
 */
export async function prepareImages<K extends string>(
  adminId: number,
  fields: Record<K, MultipartFile[]>
): Promise<Record<K, PreparedImage[]>> {
  const entries = Object.entries(fields) as Array<[K, MultipartFile[]]>
  const all = entries.flatMap(([, files]) => files)
  if (all.length > MAX_IMAGES_PER_REQUEST) {
    throw new ApiError(
      422,
      'TOO_MANY_FILES',
      `Upload up to ${MAX_IMAGES_PER_REQUEST} images at a time`
    )
  }
  if (all.some((file) => !file.isValid || !file.tmpPath)) {
    throw new ApiError(422, 'INVALID_IMAGE', 'Upload JPEG, PNG or WebP images up to 5 MB each')
  }
  // Loaded lazily: Ace commands import this module but do not boot the limiter.
  const { consumeImageUploadQuota } = await import('#start/limiter')
  await consumeImageUploadQuota(adminId, all.length)
  const prepared = {} as Record<K, PreparedImage[]>
  for (const [field, files] of entries) {
    prepared[field] = []
    for (const file of files) prepared[field].push(await processImage(file))
  }
  return prepared
}

export async function deleteImages(keys: Iterable<string | null | undefined>) {
  for (const key of keys) {
    if (!isManagedImageKey(key)) continue
    try {
      await drive.use('local').delete(key)
    } catch (error) {
      logger.warn({ err: error, key }, 'Image file could not be deleted; run images:prune-orphans')
    }
  }
}

async function storeImages(images: PreparedImage[]) {
  const keys: string[] = []
  try {
    for (const image of images) {
      const key = `${randomUUID()}.webp`
      await drive.use('local').put(key, image.buffer)
      keys.push(key)
    }
  } catch (error) {
    await deleteImages(keys)
    throw error
  }
  return keys
}

export type ImageWriteResult<T> = { result: T; released: Array<string | null | undefined> }

/**
 * Stores new images, then runs the database write with their keys. If the
 * write fails the new files are removed; once it commits, the files it
 * released (replaced or removed images) are deleted.
 */
export async function withStoredImages<T>(
  images: PreparedImage[],
  write: (keys: string[]) => Promise<ImageWriteResult<T>>
): Promise<T> {
  const keys = await storeImages(images)
  let outcome: ImageWriteResult<T>
  try {
    outcome = await write(keys)
  } catch (error) {
    await deleteImages(keys)
    throw error
  }
  await deleteImages(outcome.released)
  return outcome.result
}

export async function streamImage(
  response: HttpContext['response'],
  key: string,
  cacheControl?: string
) {
  const disk = drive.use('local')
  if (!(await disk.exists(key))) throw new ApiError(404, 'NOT_FOUND', 'Image not found')
  response.header('Content-Type', 'image/webp')
  response.header('X-Content-Type-Options', 'nosniff')
  if (cacheControl) response.header('Cache-Control', cacheControl)
  return response.stream(await disk.getStream(key))
}
