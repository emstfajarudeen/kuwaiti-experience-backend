import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'
import { publicImageUrl } from './image_storage_service.js'
import { publicVideoUrl } from './video_storage_service.js'
import type { PublicLocale } from './public_localization.js'
import { recountComments, recountVideos } from './video_counter_service.js'

export const PLATFORM_HANDLE = 'thekuwaitiexperience'
export const MAX_COMMENT_LENGTH = 500
export const REPORT_REASONS = [
  { code: 'sexual', en: 'Sexual or inappropriate content', ar: 'محتوى جنسي أو غير لائق' },
  { code: 'violence', en: 'Violence or dangerous acts', ar: 'عنف أو أفعال خطرة' },
  { code: 'hate', en: 'Hate speech or discrimination', ar: 'خطاب كراهية أو تمييز' },
  { code: 'harassment', en: 'Harassment or bullying', ar: 'مضايقة أو تنمر' },
  { code: 'spam', en: 'Spam or misleading content', ar: 'محتوى مزعج أو مضلل' },
  { code: 'self_harm', en: 'Self-harm or suicide', ar: 'إيذاء النفس أو الانتحار' },
  { code: 'illegal', en: 'Illegal activities', ar: 'أنشطة غير قانونية' },
  { code: 'other', en: 'Something else', ar: 'شيء آخر' },
] as const

type Row = Record<string, any>
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null)
const pick = (locale: PublicLocale, en: unknown, ar: unknown) =>
  locale === 'ar' && typeof ar === 'string' && ar.trim() ? ar : en

/** A video is visible to the public when published, playable, and its business (if any) is published too. */
function visible(query: ReturnType<typeof db.from>) {
  return (
    query
      .where('videos.status', 'published')
      // A new upload has no playable file until its conversion finishes.
      .whereNotNull('videos.video_key')
      .where('videos.published_at', '<=', new Date())
      .where((builder) =>
        builder
          .whereNull('videos.place_id')
          .orWhereExists((sub) =>
            sub
              .from('places')
              .whereRaw('places.id = videos.place_id')
              .where('places.status', 'published')
              .where('places.published_at', '<=', new Date())
          )
      )
  )
}

export function reportReasons(locale: PublicLocale) {
  return REPORT_REASONS.map((reason) => ({
    code: reason.code,
    label: locale === 'ar' ? reason.ar : reason.en,
  }))
}

async function hydrate(rows: Row[], locale: PublicLocale, customerId?: number) {
  const ids = rows.map((row) => Number(row.id))
  const placeIds = [
    ...new Set(
      rows
        .map((row) => row.place_id)
        .filter(Boolean)
        .map(Number)
    ),
  ]
  const categoryIds = [
    ...new Set(
      rows
        .map((row) => row.category_id)
        .filter(Boolean)
        .map(Number)
    ),
  ]
  const [places, placeText, categories, likes, saves, site] = await Promise.all([
    placeIds.length ? db.from('places').whereIn('id', placeIds) : [],
    placeIds.length ? db.from('place_translations').whereIn('place_id', placeIds) : [],
    categoryIds.length ? db.from('category_translations').whereIn('category_id', categoryIds) : [],
    customerId && ids.length
      ? db.from('video_likes').where('customer_id', customerId).whereIn('video_id', ids)
      : [],
    customerId && ids.length
      ? db.from('video_saves').where('customer_id', customerId).whereIn('video_id', ids)
      : [],
    db.from('site_settings').first(),
  ])
  const placeById = new Map((places as Row[]).map((row) => [Number(row.id), row]))
  const text = (placeId: number) => {
    const list = (placeText as Row[]).filter((row) => Number(row.place_id) === placeId)
    return list.find((row) => row.locale === locale) ?? list.find((row) => row.locale === 'en')
  }
  const categoryName = (categoryId: number) => {
    const list = (categories as Row[]).filter((row) => Number(row.category_id) === categoryId)
    return (
      (list.find((row) => row.locale === locale) ?? list.find((row) => row.locale === 'en'))
        ?.name ?? null
    )
  }
  const liked = new Set((likes as Row[]).map((row) => Number(row.video_id)))
  const saved = new Set((saves as Row[]).map((row) => Number(row.video_id)))

  return rows.map((row) => {
    const place = row.place_id ? placeById.get(Number(row.place_id)) : undefined
    const placeTranslation = place ? text(Number(place.id)) : undefined
    const phone = row.phone_e164 ?? place?.phone_e164 ?? null
    const latitude = row.latitude ?? place?.latitude ?? null
    const longitude = row.longitude ?? place?.longitude ?? null
    const locationName =
      pick(locale, row.location_name_en, row.location_name_ar) ?? placeTranslation?.address ?? null
    const creator = place
      ? {
          type: 'business' as const,
          name: placeTranslation?.title ?? place.slug,
          handle: place.slug,
          subtitle: row.category_id ? categoryName(Number(row.category_id)) : null,
          avatar_url: publicImageUrl(place.cover_image_key),
          place_id: Number(place.id),
          place_slug: place.slug as string,
        }
      : {
          type: 'platform' as const,
          name: site?.brand_name ?? 'The Kuwait Experience',
          handle: PLATFORM_HANDLE,
          subtitle: row.category_id ? categoryName(Number(row.category_id)) : null,
          avatar_url: publicImageUrl(site?.logo_image_key),
          place_id: null,
          place_slug: null,
        }
    return {
      id: Number(row.id),
      caption: pick(locale, row.caption_en, row.caption_ar),
      video_url: publicVideoUrl(row.video_key),
      thumbnail_url: publicImageUrl(row.thumbnail_key),
      category_id: row.category_id ? Number(row.category_id) : null,
      category_name: row.category_id ? categoryName(Number(row.category_id)) : null,
      creator,
      actions: {
        phone,
        location:
          latitude !== null && longitude !== null
            ? { name: locationName, latitude: Number(latitude), longitude: Number(longitude) }
            : null,
      },
      counts: {
        likes: Number(row.like_count),
        comments: Number(row.comment_count),
        shares: Number(row.share_count),
        saves: Number(row.save_count),
      },
      viewer: { liked: liked.has(Number(row.id)), saved: saved.has(Number(row.id)) },
      published_at: iso(row.published_at),
    }
  })
}

function encodeCursor(row: Row) {
  return Buffer.from(`${new Date(row.published_at).getTime()}:${row.id}`).toString('base64url')
}

function decodeCursor(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const [time, id] = Buffer.from(value, 'base64url').toString().split(':').map(Number)
  if (!Number.isFinite(time) || !Number.isInteger(id)) {
    throw new ApiError(422, 'INVALID_CURSOR', 'The cursor is not valid')
  }
  return { publishedAt: new Date(time), id }
}

function positiveInt(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new ApiError(422, 'INVALID_FILTER', 'Filter values must be positive whole numbers')
  }
  return number
}

/**
 * Newest-first feed with cursor paging.
 * `video_id` pins one video to the top of the first page (a shared link); it is then
 * left out of every page, so the feed continues without showing it twice.
 */
export async function feed(
  params: Record<string, unknown>,
  locale: PublicLocale,
  customerId?: number
) {
  const limit = Math.min(Math.max(positiveInt(params.limit) ?? 10, 1), 30)
  const categoryId = positiveInt(params.category_id)
  const placeId = positiveInt(params.place_id)
  const pinnedId = positiveInt(params.video_id)
  const cursor = decodeCursor(params.cursor)
  const query = visible(db.from('videos')).select('videos.*')
  if (pinnedId) query.whereNot('videos.id', pinnedId)
  if (categoryId) query.where('videos.category_id', categoryId)
  if (placeId) query.where('videos.place_id', placeId)
  if (cursor) {
    query.where((builder) =>
      builder
        .where('videos.published_at', '<', cursor.publishedAt)
        .orWhere((same) =>
          same.where('videos.published_at', cursor.publishedAt).where('videos.id', '<', cursor.id)
        )
    )
  }
  const rows = (await query
    .orderBy('videos.published_at', 'desc')
    .orderBy('videos.id', 'desc')
    .limit(limit + 1)) as Row[]
  const page = rows.slice(0, limit)
  // Only the first page (no cursor) carries the pinned video. A video that is a draft,
  // hidden or deleted is simply skipped, so an old shared link still opens the normal feed.
  const pinned =
    pinnedId && !cursor
      ? ((await visible(db.from('videos'))
          .where('videos.id', pinnedId)
          .select('videos.*')
          .first()) as Row | undefined)
      : undefined
  return {
    data: await hydrate(pinned ? [pinned, ...page] : page, locale, customerId),
    meta: {
      next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
      ...(pinnedId && !cursor ? { pinned_video_found: Boolean(pinned) } : {}),
    },
  }
}

export async function savedFeed(
  params: Record<string, unknown>,
  locale: PublicLocale,
  customerId: number
) {
  const limit = Math.min(Math.max(positiveInt(params.limit) ?? 20, 1), 50)
  const offset = (Math.max(positiveInt(params.page) ?? 1, 1) - 1) * limit
  const rows = (await visible(db.from('videos'))
    .join('video_saves', 'video_saves.video_id', 'videos.id')
    .where('video_saves.customer_id', customerId)
    .select('videos.*')
    .orderBy('video_saves.created_at', 'desc')
    .limit(limit + 1)
    .offset(offset)) as Row[]
  return {
    data: await hydrate(rows.slice(0, limit), locale, customerId),
    meta: { has_more: rows.length > limit },
  }
}

async function visibleVideo(id: number, trx = db as any) {
  const row = await visible(trx.from('videos')).where('videos.id', id).select('videos.*').first()
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Video not found')
  return row as Row
}

export async function showVideo(id: number, locale: PublicLocale, customerId?: number) {
  const row = await visibleVideo(id)
  return { data: (await hydrate([row], locale, customerId))[0] }
}

function authorName(row: Row) {
  const last = String(row.last_name ?? '').trim()
  return (
    [String(row.first_name ?? '').trim(), last ? `${last[0]}.` : ''].filter(Boolean).join(' ') ||
    'Guest'
  )
}

export async function comments(
  videoId: number,
  params: Record<string, unknown>,
  customerId?: number
) {
  await visibleVideo(videoId)
  const limit = Math.min(Math.max(positiveInt(params.limit) ?? 20, 1), 50)
  const before = positiveInt(params.cursor)
  const query = db
    .from('video_comments as c')
    .join('customers as u', 'u.id', 'c.customer_id')
    .where('c.video_id', videoId)
    .where('c.status', 'visible')
    .select('c.*', 'u.first_name', 'u.last_name')
    .orderBy('c.id', 'desc')
    .limit(limit + 1)
  if (before) query.where('c.id', '<', before)
  const rows = (await query) as Row[]
  const page = rows.slice(0, limit)
  const likes =
    customerId && page.length
      ? ((await db
          .from('video_comment_likes')
          .where('customer_id', customerId)
          .whereIn(
            'comment_id',
            page.map((row) => row.id)
          )) as Row[])
      : []
  const liked = new Set(likes.map((row) => Number(row.comment_id)))
  return {
    data: page.map((row) => serializeComment(row, liked.has(Number(row.id)), customerId)),
    meta: { next_cursor: rows.length > limit ? String(page[page.length - 1].id) : null },
  }
}

function serializeComment(row: Row, liked: boolean, customerId?: number) {
  const name = authorName(row)
  return {
    id: Number(row.id),
    body: row.body as string,
    author: {
      name,
      initials: name
        .split(/\s+/)
        .map((part: string) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    },
    like_count: Number(row.like_count),
    liked,
    mine: customerId !== undefined && Number(row.customer_id) === customerId,
    created_at: iso(row.created_at),
  }
}

/** Runs a write against a locked, visible video as an active customer. */
async function withVideo<T>(
  videoId: number,
  customerId: number,
  action: (trx: any, video: Row) => Promise<T>
) {
  return db.transaction(async (trx) => {
    const customer = await trx.from('customers').where('id', customerId).forUpdate().first()
    if (!customer) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
    if (!customer.active)
      throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been deactivated')
    const video = await visible(trx.from('videos')).where('videos.id', videoId).forUpdate().first()
    if (!video) throw new ApiError(404, 'NOT_FOUND', 'Video not found')
    return action(trx, video)
  })
}

async function toggle(
  table: 'video_likes' | 'video_saves',
  counter: 'like_count' | 'save_count',
  videoId: number,
  customerId: number,
  on: boolean
) {
  return withVideo(videoId, customerId, async (trx, video) => {
    const key = { video_id: videoId, customer_id: customerId }
    const exists = Boolean(await trx.from(table).where(key).first())
    if (on && !exists) await trx.table(table).insert({ ...key, created_at: new Date() })
    else if (!on && exists) await trx.from(table).where(key).delete()
    // Recount instead of +1/-1 so a counter that had drifted is corrected here.
    await recountVideos(trx, [Number(video.id)])
    const fresh = await trx.from('videos').where('id', videoId).select(counter).firstOrFail()
    return { data: { video_id: videoId, active: on, count: Number(fresh[counter]) } }
  })
}

export const setLike = (videoId: number, customerId: number, on: boolean) =>
  toggle('video_likes', 'like_count', videoId, customerId, on)
export const setSaved = (videoId: number, customerId: number, on: boolean) =>
  toggle('video_saves', 'save_count', videoId, customerId, on)

export async function recordShare(videoId: number, customerId: number) {
  return withVideo(videoId, customerId, async (trx, video) => {
    const count = Number(video.share_count) + 1
    await trx.from('videos').where('id', videoId).update({ share_count: count })
    return { data: { video_id: videoId, count } }
  })
}

export async function addComment(videoId: number, customerId: number, rawBody: unknown) {
  const body = typeof rawBody === 'string' ? rawBody.trim() : ''
  if (!body || body.length > MAX_COMMENT_LENGTH) {
    throw new ApiError(
      422,
      'INVALID_COMMENT',
      `Write a comment up to ${MAX_COMMENT_LENGTH} characters`,
      {
        body: [`Write a comment up to ${MAX_COMMENT_LENGTH} characters`],
      }
    )
  }
  return withVideo(videoId, customerId, async (trx, video) => {
    const [id] = await trx.table('video_comments').insert({
      video_id: videoId,
      customer_id: customerId,
      body,
      status: 'visible',
      created_at: new Date(),
    })
    await recountVideos(trx, [Number(video.id)])
    const row = await trx
      .from('video_comments as c')
      .join('customers as u', 'u.id', 'c.customer_id')
      .where('c.id', Number(id))
      .select('c.*', 'u.first_name', 'u.last_name')
      .first()
    return { data: serializeComment(row, false, customerId) }
  })
}

export async function deleteComment(commentId: number, customerId: number) {
  return db.transaction(async (trx) => {
    const comment = await trx.from('video_comments').where('id', commentId).forUpdate().first()
    if (!comment) throw new ApiError(404, 'NOT_FOUND', 'Comment not found')
    if (Number(comment.customer_id) !== customerId) {
      throw new ApiError(403, 'FORBIDDEN', 'You can only delete your own comments')
    }
    // Lock the video before changing its comments so the recount cannot race another write.
    await trx.from('videos').where('id', comment.video_id).forUpdate().first()
    await trx.from('video_comments').where('id', commentId).delete()
    await recountVideos(trx, [Number(comment.video_id)])
    return { data: { id: commentId } }
  })
}

export async function setCommentLike(commentId: number, customerId: number, on: boolean) {
  return db.transaction(async (trx) => {
    const customer = await trx.from('customers').where('id', customerId).forUpdate().first()
    if (!customer) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
    if (!customer.active)
      throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been deactivated')
    const comment = await trx
      .from('video_comments')
      .where('id', commentId)
      .where('status', 'visible')
      .forUpdate()
      .first()
    if (!comment) throw new ApiError(404, 'NOT_FOUND', 'Comment not found')
    await visibleVideo(Number(comment.video_id), trx)
    const key = { comment_id: commentId, customer_id: customerId }
    const exists = Boolean(await trx.from('video_comment_likes').where(key).first())
    if (on && !exists)
      await trx.table('video_comment_likes').insert({ ...key, created_at: new Date() })
    else if (!on && exists) await trx.from('video_comment_likes').where(key).delete()
    await recountComments(trx, [commentId])
    const fresh = await trx
      .from('video_comments')
      .where('id', commentId)
      .select('like_count')
      .firstOrFail()
    return { data: { comment_id: commentId, active: on, count: Number(fresh.like_count) } }
  })
}

export async function reportVideo(
  videoId: number,
  customerId: number,
  reason: unknown,
  note: unknown
) {
  if (typeof reason !== 'string' || !REPORT_REASONS.some((item) => item.code === reason)) {
    throw new ApiError(422, 'INVALID_REASON', 'Choose a reason for your report', {
      reason: ['Choose a reason for your report'],
    })
  }
  const text = typeof note === 'string' ? note.trim().slice(0, 500) : ''
  return withVideo(videoId, customerId, async (trx) => {
    const existing = await trx
      .from('video_reports')
      .where({ video_id: videoId, customer_id: customerId })
      .first()
    if (!existing) {
      await trx.table('video_reports').insert({
        video_id: videoId,
        customer_id: customerId,
        reason,
        note: text || null,
        status: 'open',
        created_at: new Date(),
      })
    }
    // Reporting twice is not an error; the app can show "Thanks" either way.
    return { data: { video_id: videoId, reported: true } }
  })
}
