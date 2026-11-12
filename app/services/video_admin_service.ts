import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'
import { withStoredImages, type PreparedImage } from './image_storage_service.js'
import { deleteVideoFiles, storeVideo, type PreparedVideo } from './video_storage_service.js'
import { recountVideos } from './video_counter_service.js'
import { REPORT_REASONS } from './video_public_service.js'

type Row = Record<string, any>
const pageSize = 20

export type VideoInput = {
  captionEn: string
  captionAr: string | null
  categoryId: number | null
  placeId: number | null
  phone: string | null
  locationNameEn: string | null
  locationNameAr: string | null
  latitude: number | null
  longitude: number | null
}

export type VideoFiles = {
  video?: PreparedVideo
  thumbnail?: PreparedImage
  removeThumbnail?: boolean
}

async function audit(trx: any, actorId: number, id: number, action: string) {
  await trx.table('audit_logs').insert({
    actor_id: actorId,
    action: `video.${action}`,
    entity_type: 'video',
    entity_id: String(id),
    created_at: new Date(),
  })
}

export async function videoFormOptions() {
  const [categories, places] = await Promise.all([
    db
      .from('categories as c')
      .leftJoin('category_translations as t', (join) =>
        join.on('t.category_id', 'c.id').andOnVal('t.locale', 'en')
      )
      .where('c.active', true)
      .select('c.id', 'c.type', 't.name')
      .orderBy('t.name'),
    db
      .from('places as p')
      .leftJoin('place_translations as t', (join) =>
        join.on('t.place_id', 'p.id').andOnVal('t.locale', 'en')
      )
      .whereNot('p.status', 'archived')
      .select(
        'p.id',
        'p.category_id',
        'p.phone_e164',
        'p.latitude',
        'p.longitude',
        't.title',
        't.address'
      )
      .orderBy('t.title'),
  ])
  return {
    categories: (categories as Row[]).map((row) => ({
      id: Number(row.id),
      name: (row.name as string | null) ?? `Category ${row.id}`,
    })),
    places: (places as Row[]).map((row) => ({
      id: Number(row.id),
      title: (row.title as string | null) ?? `Place ${row.id}`,
      category_id: row.category_id ? Number(row.category_id) : null,
      phone: (row.phone_e164 as string | null) ?? null,
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      address: (row.address as string | null) ?? null,
    })),
  }
}

export async function listVideos(params: { status?: string; q?: string; page?: number }) {
  const page =
    Number.isSafeInteger(params.page) && params.page! > 0 ? Math.min(params.page!, 10000) : 1
  const status = ['draft', 'published'].includes(params.status ?? '') ? params.status : ''
  const text = (params.q ?? '').trim().slice(0, 120)
  const apply = (query: any) => {
    if (status) query.where('v.status', status)
    if (text) query.where('v.caption_en', 'like', `%${text}%`)
    return query
  }
  const totalRow = await apply(db.from('videos as v')).count('* as total').first()
  const total = Number(totalRow?.total ?? 0)
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, lastPage)
  const rows = (await apply(
    db
      .from('videos as v')
      .leftJoin('place_translations as pt', (join) =>
        join.on('pt.place_id', 'v.place_id').andOnVal('pt.locale', 'en')
      )
      .leftJoin('category_translations as ct', (join) =>
        join.on('ct.category_id', 'v.category_id').andOnVal('ct.locale', 'en')
      )
  )
    .select(
      'v.*',
      'pt.title as place_title',
      'ct.name as category_name',
      db.raw(
        "(select count(*) from video_reports r where r.video_id = v.id and r.status = 'open') as open_reports"
      )
    )
    .orderBy('v.id', 'desc')
    .limit(pageSize)
    .offset((current - 1) * pageSize)) as Row[]
  return { rows, total, page: current, lastPage, pageSize }
}

export async function findVideo(id: number) {
  const row = await db
    .from('videos as v')
    .leftJoin('place_translations as pt', (join) =>
      join.on('pt.place_id', 'v.place_id').andOnVal('pt.locale', 'en')
    )
    .where('v.id', id)
    .select('v.*', 'pt.title as place_title')
    .first()
  return (row as Row | undefined) ?? null
}

async function validateTargets(input: VideoInput) {
  if (input.categoryId && !(await db.from('categories').where('id', input.categoryId).first())) {
    throw new ApiError(422, 'INVALID_CATEGORY', 'Choose a valid category', {
      categoryId: ['Choose a valid category'],
    })
  }
  if (input.placeId) {
    const place = await db.from('places').where('id', input.placeId).first()
    if (!place) {
      throw new ApiError(422, 'INVALID_PLACE', 'Choose a valid business', {
        placeId: ['Choose a valid business'],
      })
    }
    if (input.categoryId && place.category_id && Number(place.category_id) !== input.categoryId) {
      throw new ApiError(
        422,
        'PLACE_CATEGORY_MISMATCH',
        'This business is in a different category',
        {
          placeId: ['This business is in a different category'],
        }
      )
    }
  }
}

/**
 * Creates or updates a video. `intent` publishes, unpublishes or leaves the
 * status as it is. Files are stored first and removed again if the write fails.
 */
export async function saveVideo(
  input: VideoInput,
  files: VideoFiles,
  actorId: number,
  id: number | undefined,
  intent: 'save' | 'publish' | 'unpublish'
) {
  await validateTargets(input)
  if (!id && !files.video) {
    throw new ApiError(422, 'VIDEO_REQUIRED', 'Upload a video', { video: ['Upload a video'] })
  }
  const newVideoKey = files.video ? await storeVideo(files.video) : null
  try {
    return await withStoredImages(files.thumbnail ? [files.thumbnail] : [], async (imageKeys) => {
      const released: string[] = []
      const releasedVideo: string[] = []
      const savedId = await db.transaction(async (trx) => {
        const existing = id ? await trx.from('videos').where('id', id).forUpdate().first() : null
        if (id && !existing) throw new ApiError(404, 'NOT_FOUND', 'Video not found')
        const now = new Date()
        const status =
          intent === 'publish'
            ? 'published'
            : intent === 'unpublish'
              ? 'draft'
              : (existing?.status ?? 'draft')
        const values: Row = {
          caption_en: input.captionEn,
          caption_ar: input.captionAr,
          category_id: input.categoryId,
          place_id: input.placeId,
          phone_e164: input.phone,
          location_name_en: input.locationNameEn,
          location_name_ar: input.locationNameAr,
          latitude: input.latitude,
          longitude: input.longitude,
          status,
          published_at:
            status === 'published'
              ? (existing?.published_at ?? now)
              : (existing?.published_at ?? null),
          updated_at: now,
        }
        if (newVideoKey) {
          values.video_key = newVideoKey
          values.size_bytes = files.video!.size
          if (existing?.video_key) releasedVideo.push(existing.video_key)
        }
        if (imageKeys[0]) {
          values.thumbnail_key = imageKeys[0]
          if (existing?.thumbnail_key) released.push(existing.thumbnail_key)
        } else if (files.removeThumbnail && existing?.thumbnail_key) {
          values.thumbnail_key = null
          released.push(existing.thumbnail_key)
        }
        if (existing) {
          await trx.from('videos').where('id', id!).update(values)
          await audit(trx, actorId, id!, status !== existing.status ? status : 'updated')
          return id!
        }
        const [created] = await trx
          .table('videos')
          .insert({ ...values, created_by: actorId, created_at: now })
        await audit(trx, actorId, Number(created), 'created')
        return Number(created)
      })
      await deleteVideoFiles(releasedVideo)
      return { result: savedId, released }
    })
  } catch (error) {
    await deleteVideoFiles([newVideoKey])
    throw error
  }
}

export async function setVideoStatus(id: number, status: 'draft' | 'published', actorId: number) {
  await db.transaction(async (trx) => {
    const video = await trx.from('videos').where('id', id).forUpdate().first()
    if (!video) throw new ApiError(404, 'NOT_FOUND', 'Video not found')
    if (video.status === status) return
    await trx
      .from('videos')
      .where('id', id)
      .update({
        status,
        published_at:
          status === 'published' ? (video.published_at ?? new Date()) : video.published_at,
        updated_at: new Date(),
      })
    await audit(trx, actorId, id, status)
  })
}

export async function deleteVideo(id: number, actorId: number) {
  const video = await db.transaction(async (trx) => {
    const row = await trx.from('videos').where('id', id).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Video not found')
    await trx.from('videos').where('id', id).delete()
    await audit(trx, actorId, id, 'deleted')
    return row
  })
  await deleteVideoFiles([video.video_key])
  const { deleteImages } = await import('./image_storage_service.js')
  await deleteImages([video.thumbnail_key])
}

export async function recentComments(videoId: number, limit = 50) {
  return (await db
    .from('video_comments as c')
    .join('customers as u', 'u.id', 'c.customer_id')
    .where('c.video_id', videoId)
    .select('c.*', 'u.first_name', 'u.last_name', 'u.phone_e164')
    .orderBy('c.id', 'desc')
    .limit(limit)) as Row[]
}

/** Hides or restores a comment; the video's public comment count follows. */
export async function setCommentStatus(
  commentId: number,
  status: 'visible' | 'hidden',
  actorId: number
) {
  return db.transaction(async (trx) => {
    const comment = await trx.from('video_comments').where('id', commentId).forUpdate().first()
    if (!comment) throw new ApiError(404, 'NOT_FOUND', 'Comment not found')
    if (comment.status === status) return Number(comment.video_id)
    await trx.from('video_comments').where('id', commentId).update({ status })
    const videoId = Number(comment.video_id)
    await recountVideos(trx, [videoId])
    await audit(trx, actorId, videoId, `comment_${status}`)
    return videoId
  })
}

export async function listReports(status: string, pageValue: number) {
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 10000) : 1
  const filter = ['open', 'reviewed', 'dismissed'].includes(status) ? status : 'open'
  const total = Number(
    (await db.from('video_reports').where('status', filter).count('* as total').first())?.total ?? 0
  )
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, lastPage)
  const rows = (await db
    .from('video_reports as r')
    .join('videos as v', 'v.id', 'r.video_id')
    .join('customers as u', 'u.id', 'r.customer_id')
    .where('r.status', filter)
    .select(
      'r.*',
      'v.caption_en',
      'v.status as video_status',
      'u.first_name',
      'u.last_name',
      'u.phone_e164'
    )
    .orderBy('r.id', 'desc')
    .limit(pageSize)
    .offset((current - 1) * pageSize)) as Row[]
  return {
    rows: rows.map((row): Row => ({
      ...row,
      reason_label: REPORT_REASONS.find((item) => item.code === row.reason)?.en ?? row.reason,
    })),
    total,
    page: current,
    lastPage,
    status: filter,
  }
}

export async function setReportStatus(
  reportId: number,
  status: 'reviewed' | 'dismissed',
  actorId: number,
  unpublish: boolean
) {
  await db.transaction(async (trx) => {
    const report = await trx.from('video_reports').where('id', reportId).forUpdate().first()
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'Report not found')
    await trx
      .from('video_reports')
      .where('id', reportId)
      .update({ status, reviewed_at: new Date() })
    await audit(trx, actorId, Number(report.video_id), `report_${status}`)
    if (unpublish && status === 'reviewed') {
      await trx
        .from('videos')
        .where('id', report.video_id)
        .where('status', 'published')
        .update({ status: 'draft', updated_at: new Date() })
      await audit(trx, actorId, Number(report.video_id), 'draft')
    }
  })
}
