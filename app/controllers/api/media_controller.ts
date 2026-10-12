import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import sharp, { type Metadata } from 'sharp'
import { ApiError } from '../../services/api_error.js'

export default class MediaController {
  async index({ request }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const rows = await db
      .from('media')
      .select(
        'id',
        'original_name',
        'mime',
        'bytes',
        'width',
        'height',
        'alt_en',
        'alt_ar',
        'created_at'
      )
      .orderBy('id', 'desc')
      .limit(30)
      .offset((page - 1) * 30)
    return {
      data: rows.map((row) => ({ ...row, url: `/api/v1/admin/media/${row.id}/file` })),
      meta: { page, perPage: 30 },
    }
  }

  async upload({ request, admin, response }: HttpContext) {
    const file = request.file('file', { size: '5mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] })
    if (!file || !file.isValid || !file.tmpPath) {
      throw new ApiError(422, 'INVALID_IMAGE', 'Upload a JPEG, PNG or WebP image up to 5 MB')
    }
    const alt = String(request.input('alt_en', '')).trim()
    if (!alt || alt.length > 255) {
      throw new ApiError(422, 'INVALID_ALT', 'Provide concise English alternative text')
    }
    let buffer: Buffer
    let metadata: Metadata
    try {
      const image = sharp(await readFile(file.tmpPath), { failOn: 'error' })
      const sourceMetadata = await image.metadata()
      if (
        !['jpeg', 'png', 'webp'].includes(sourceMetadata.format ?? '') ||
        !sourceMetadata.width ||
        !sourceMetadata.height ||
        sourceMetadata.width * sourceMetadata.height > 20_000_000
      ) {
        throw new Error('Invalid dimensions or format')
      }
      buffer = await image.rotate().webp({ quality: 82, effort: 4 }).toBuffer()
      metadata = await sharp(buffer).metadata()
    } catch {
      throw new ApiError(422, 'INVALID_IMAGE', 'The image could not be processed')
    }
    const key = `${randomUUID()}.webp`
    await drive.use('local').put(key, buffer)
    try {
      const [id] = await db.table('media').insert({
        disk: 'local',
        storage_key: key,
        original_name: file.clientName,
        mime: 'image/webp',
        bytes: buffer.length,
        width: metadata.width,
        height: metadata.height,
        alt_en: alt,
        uploaded_by: admin.id,
        created_at: new Date(),
      })
      return response.created({ data: { id, url: `/api/v1/admin/media/${id}/file` } })
    } catch (error) {
      await drive.use('local').delete(key)
      throw error
    }
  }

  async file({ params, response }: HttpContext) {
    const media = await db.from('media').where('id', params.id).first()
    if (!media) throw new ApiError(404, 'NOT_FOUND', 'Image not found')
    response.header('Content-Type', media.mime)
    response.header('X-Content-Type-Options', 'nosniff')
    return response.stream(await drive.use('local').getStream(media.storage_key))
  }

  async publicFile({ params, response }: HttpContext) {
    const media = await db.from('media').where('id', params.id).first()
    if (!media) throw new ApiError(404, 'NOT_FOUND', 'Image not found')
    const used =
      (await db
        .from('places')
        .where('cover_media_id', media.id)
        .where('status', 'published')
        .where('published_at', '<=', db.raw('CURRENT_TIMESTAMP'))
        .first()) ||
      (await db
        .from('place_media as pm')
        .join('places as p', 'p.id', 'pm.place_id')
        .where('pm.media_id', media.id)
        .where('p.status', 'published')
        .where('p.published_at', '<=', db.raw('CURRENT_TIMESTAMP'))
        .first()) ||
      (await db.from('categories').where('image_id', media.id).where('active', true).first()) ||
      (await db.from('category_types').where('image_id', media.id).first()) ||
      (await db
        .from('home_content')
        .where('hero_media_id', media.id)
        .orWhere('app_media_id', media.id)
        .first()) ||
      (await db.from('site_settings').where('logo_media_id', media.id).first())
    if (!used) throw new ApiError(404, 'NOT_FOUND', 'Image not found')
    response.header('Content-Type', media.mime)
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('Cache-Control', 'public, max-age=60')
    return response.stream(await drive.use('local').getStream(media.storage_key))
  }

  async destroy({ params, response }: HttpContext) {
    const id = Number(params.id)
    const media = await db.from('media').where('id', id).first()
    if (!media) throw new ApiError(404, 'NOT_FOUND', 'Image not found')
    const refs = await Promise.all([
      db.from('places').where('cover_media_id', id).first(),
      db.from('place_media').where('media_id', id).first(),
      db.from('categories').where('image_id', id).first(),
      db.from('category_types').where('image_id', id).first(),
      db.from('home_content').where('hero_media_id', id).orWhere('app_media_id', id).first(),
      db.from('site_settings').where('logo_media_id', id).first(),
    ])
    if (refs.some(Boolean))
      throw new ApiError(409, 'MEDIA_IN_USE', 'Remove this image from content first')
    await db.from('media').where('id', id).delete()
    await drive.use('local').delete(media.storage_key)
    return response.noContent()
  }
}
