import { randomUUID } from 'node:crypto'
import { open, readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import type { HttpContext } from '@adonisjs/core/http'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import logger from '@adonisjs/core/services/logger'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import env from '#start/env'
import { ApiError } from '#services/api_error'

/** Largest accepted video. The request limit in config/bodyparser.ts leaves room for a cover image. */
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024
export const MAX_VIDEO_MB = 25
const videoOptions = { size: `${MAX_VIDEO_MB}mb`, extnames: ['mp4', 'mov', 'webm'] }
const keyPattern =
  /^videos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/

export type PreparedVideo = { tmpPath: string; extension: 'mp4' | 'webm'; size: number }

export function isManagedVideoKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && keyPattern.test(value)
}

/** Public delivery URL for a stored video (`videos/<uuid>.mp4` → `/api/v1/video-files/<uuid>.mp4`). */
export function publicVideoUrl(key: string | null | undefined) {
  return key ? `/api/v1/video-files/${key.replace(/^videos\//, '')}` : null
}

export function cmsVideoUrl(key: string | null | undefined) {
  return key ? `/admin/video-files/${key.replace(/^videos\//, '')}` : null
}

export function videoFile(request: HttpContext['request'], field = 'video') {
  const files = request.files(field, videoOptions)
  if (files.length > 1) throw new ApiError(422, 'TOO_MANY_FILES', 'Upload one video at a time')
  return files[0] ?? null
}

/** Checks the file signature, so a renamed file cannot be stored as a video. */
export async function prepareVideo(file: MultipartFile): Promise<PreparedVideo> {
  if (!file.isValid || !file.tmpPath) {
    throw new ApiError(
      422,
      'INVALID_VIDEO',
      `Upload an MP4, MOV or WebM video up to ${MAX_VIDEO_MB} MB`
    )
  }
  const handle = await open(file.tmpPath, 'r')
  const head = Buffer.alloc(12)
  try {
    await handle.read(head, 0, 12, 0)
  } finally {
    await handle.close()
  }
  const isIsoMedia = head.subarray(4, 8).toString('latin1') === 'ftyp'
  const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3
  if (!isIsoMedia && !isWebm) {
    throw new ApiError(422, 'INVALID_VIDEO', 'The file is not a supported video')
  }
  const size = (await stat(file.tmpPath)).size
  if (size > MAX_VIDEO_BYTES) {
    throw new ApiError(422, 'INVALID_VIDEO', `Videos must be ${MAX_VIDEO_MB} MB or smaller`)
  }
  return { tmpPath: file.tmpPath, extension: isWebm ? 'webm' : 'mp4', size }
}

export async function storeVideo(video: PreparedVideo) {
  const key = `videos/${randomUUID()}.${video.extension}`
  await drive.use('local').put(key, await readFile(video.tmpPath))
  return key
}

export async function deleteVideoFiles(keys: Iterable<string | null | undefined>) {
  for (const key of keys) {
    if (!isManagedVideoKey(key)) continue
    try {
      await drive.use('local').delete(key)
    } catch (error) {
      logger.warn({ err: error, key }, 'Video file could not be deleted; run images:prune-orphans')
    }
  }
}

function storageRoot() {
  return app.makePath(env.get('NODE_ENV') === 'test' ? 'storage/test-uploads' : 'storage/uploads')
}

/** Streams a stored video with HTTP Range support, so players can seek. */
export async function streamVideo(
  { request, response }: Pick<HttpContext, 'request' | 'response'>,
  key: string,
  cacheControl: string
) {
  if (!isManagedVideoKey(key) || !(await drive.use('local').exists(key))) {
    throw new ApiError(404, 'NOT_FOUND', 'Video not found')
  }
  const path = `${storageRoot()}/${key}`
  const { size } = await stat(path)
  response.header('Content-Type', key.endsWith('.webm') ? 'video/webm' : 'video/mp4')
  response.header('X-Content-Type-Options', 'nosniff')
  response.header('Accept-Ranges', 'bytes')
  response.header('Cache-Control', cacheControl)
  const range = request.header('range')
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
  if (!match || (match[1] === '' && match[2] === '')) {
    response.header('Content-Length', String(size))
    return response.stream(createReadStream(path))
  }
  let start: number
  let end: number
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  if (start >= size || start > end) {
    response.header('Content-Range', `bytes */${size}`)
    return response.status(416).send('')
  }
  response.status(206)
  response.header('Content-Range', `bytes ${start}-${end}/${size}`)
  response.header('Content-Length', String(end - start + 1))
  return response.stream(createReadStream(path, { start, end }))
}
