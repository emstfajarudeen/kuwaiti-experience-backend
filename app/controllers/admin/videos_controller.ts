import type { HttpContext } from '@adonisjs/core/http'
import { ApiError } from '../../services/api_error.js'
import { imageFiles, prepareImages, cmsImageUrl } from '../../services/image_storage_service.js'
import {
  cmsVideoUrl,
  prepareVideo,
  videoFile,
  MAX_VIDEO_MB,
} from '../../services/video_storage_service.js'
import {
  deleteVideo,
  findVideo,
  listReports,
  listVideos,
  recentComments,
  saveVideo,
  setCommentStatus,
  setReportStatus,
  setVideoStatus,
  videoFormOptions,
} from '../../services/video_admin_service.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'
import { SimpleMessagesProvider } from '@vinejs/vine'
import { videoValidator } from '../../validators/videos.js'

const dateValue = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value ? String(value) : null
const blank = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '' ? null : text
}
const optionalNumber = (value: unknown) => {
  const text = blank(value)
  return text === null ? null : Number(text)
}

function formInput(request: HttpContext['request']) {
  return {
    captionEn: request.input('captionEn') ?? '',
    captionAr: blank(request.input('captionAr')),
    categoryId: optionalNumber(request.input('categoryId')),
    placeId: optionalNumber(request.input('placeId')),
    phone: blank(request.input('phone')),
    locationNameEn: blank(request.input('locationNameEn')),
    locationNameAr: blank(request.input('locationNameAr')),
    latitude: optionalNumber(request.input('latitude')),
    longitude: optionalNumber(request.input('longitude')),
  }
}

const videoMessages = {
  'required': 'This field is required.',
  'string': 'Enter text.',
  'number': 'Enter a valid number.',
  'minLength': 'Enter at least {{ min }} characters.',
  'maxLength': 'Use {{ max }} characters or fewer.',
  'captionEn.required': 'Write a caption.',
  'captionEn.minLength': 'Write a caption of at least {{ min }} characters.',
  'phone.regex': 'Use international format, for example +96512345678.',
  'latitude.min': 'Latitude must be between -90 and 90.',
  'latitude.max': 'Latitude must be between -90 and 90.',
  'longitude.min': 'Longitude must be between -180 and 180.',
  'longitude.max': 'Longitude must be between -180 and 180.',
}

/** Maps any failure to messages for the form fields it belongs to. */
function fieldErrorsFor(error: unknown): Record<string, string[]> | null {
  const fields = validationErrorBag(error)
  if (fields) return fields
  if (error instanceof ApiError) {
    if (error.fields) return error.fields
    if (error.code === 'INVALID_VIDEO' || error.code === 'TOO_MANY_FILES')
      return { video: [error.message] }
    if (error.code === 'INVALID_IMAGE') return { thumbnail: [error.message] }
  }
  return null
}

function flashes(session: HttpContext['session']) {
  return {
    success: (session.flashMessages.get('success') as string | undefined) ?? null,
    error: (session.flashMessages.get('error') as string | undefined) ?? null,
  }
}

function serializeVideo(row: Record<string, any>) {
  return {
    id: Number(row.id),
    caption_en: row.caption_en as string,
    caption_ar: (row.caption_ar as string | null) ?? null,
    status: row.status as string,
    category_id: row.category_id ? Number(row.category_id) : null,
    place_id: row.place_id ? Number(row.place_id) : null,
    place_title: (row.place_title as string | null) ?? null,
    category_name: (row.category_name as string | null) ?? null,
    phone: (row.phone_e164 as string | null) ?? null,
    location_name_en: (row.location_name_en as string | null) ?? null,
    location_name_ar: (row.location_name_ar as string | null) ?? null,
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    // While converting, the CMS previews the converted file if there is one, else the upload.
    video_url: cmsVideoUrl(row.video_key ?? row.source_key),
    processing_status: (row.processing_status as string | null) ?? 'ready',
    processing_error: (row.processing_error as string | null) ?? null,
    width: row.width ? Number(row.width) : null,
    height: row.height ? Number(row.height) : null,
    duration_ms: row.duration_ms ? Number(row.duration_ms) : null,
    thumbnail_url: cmsImageUrl(row.thumbnail_key),
    size_bytes: Number(row.size_bytes ?? 0),
    likes: Number(row.like_count),
    comments: Number(row.comment_count),
    shares: Number(row.share_count),
    saves: Number(row.save_count),
    open_reports: Number(row.open_reports ?? 0),
    published_at: dateValue(row.published_at),
    created_at: dateValue(row.created_at),
  }
}

export default class AdminVideosController {
  async index({ request, inertia, session, admin }: HttpContext) {
    const status = String(request.input('status', ''))
    const query = String(request.input('q', '')).trim().slice(0, 120)
    const result = await listVideos({ status, q: query, page: Number(request.input('page', 1)) })
    return inertia.render(
      'videos/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        ...flashes(session),
        status: ['draft', 'published'].includes(status) ? status : '',
        query,
        rows: result.rows.map(serializeVideo),
        meta: {
          total: result.total,
          page: result.page,
          lastPage: result.lastPage,
          perPage: result.pageSize,
        },
      },
      { bodyClass: 'cms-body' }
    )
  }

  private async form(
    { request, inertia, session, admin }: HttpContext,
    video: ReturnType<typeof serializeVideo> | null,
    comments: Array<Record<string, any>>
  ) {
    const flashed = session.flashMessages.get('videoForm') as Record<string, string> | undefined
    return inertia.render(
      'videos/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        ...flashes(session),
        video,
        form: flashed ?? null,
        options: await videoFormOptions(),
        maxVideoMb: MAX_VIDEO_MB,
        comments: comments.map((row) => ({
          id: Number(row.id),
          body: row.body as string,
          status: row.status as string,
          like_count: Number(row.like_count),
          author:
            [row.first_name, row.last_name].filter(Boolean).join(' ') || (row.phone_e164 as string),
          created_at: dateValue(row.created_at),
        })),
      },
      { bodyClass: 'cms-body' }
    )
  }

  async create(ctx: HttpContext) {
    return this.form(ctx, null, [])
  }

  async edit(ctx: HttpContext) {
    const row = await findVideo(Number(ctx.params.id))
    if (!row) return ctx.response.redirect('/admin/videos')
    return this.form(ctx, serializeVideo(row), await recentComments(Number(row.id)))
  }

  async save({ params, request, response, session, admin }: HttpContext) {
    const id = params.id ? Number(params.id) : undefined
    const intent = ['publish', 'unpublish'].includes(request.input('intent'))
      ? (request.input('intent') as 'publish' | 'unpublish')
      : 'save'
    try {
      const input = await videoValidator.validate(formInput(request), {
        messagesProvider: new SimpleMessagesProvider(videoMessages),
      })
      const rawVideo = videoFile(request, 'video')
      const video = rawVideo ? await prepareVideo(rawVideo) : undefined
      const images = await prepareImages(admin.id, { thumbnail: imageFiles(request, 'thumbnail') })
      await saveVideo(
        input,
        {
          video,
          thumbnail: images.thumbnail[0],
          removeThumbnail: request.input('removeThumbnail') === 'on',
        },
        admin.id,
        id,
        intent
      )
      session.flash(
        'success',
        intent === 'publish'
          ? 'Video published.'
          : intent === 'unpublish'
            ? 'Video moved to drafts.'
            : 'Video saved.'
      )
      return response.redirect('/admin/videos')
    } catch (error) {
      const fieldErrors = fieldErrorsFor(error)
      if (fieldErrors) session.flash('inputErrorsBag', fieldErrors)
      else
        session.flash('error', error instanceof Error ? error.message : 'Unable to save the video.')
      session.flash(
        'videoForm',
        request.only([
          'captionEn',
          'captionAr',
          'categoryId',
          'placeId',
          'phone',
          'locationNameEn',
          'locationNameAr',
          'latitude',
          'longitude',
        ])
      )
      return response.redirect(id ? `/admin/videos/${id}/edit` : '/admin/videos/new')
    }
  }

  async updateStatus({ params, request, response, session, admin }: HttpContext) {
    try {
      const status = request.input('status')
      if (!['draft', 'published'].includes(status))
        throw new ApiError(422, 'INVALID_STATUS', 'Choose a valid status.')
      await setVideoStatus(Number(params.id), status, admin.id)
      session.flash(
        'success',
        status === 'published' ? 'Video published.' : 'Video moved to drafts.'
      )
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to update the video.')
    }
    const returnTo = String(request.input('returnTo', ''))
    return response.redirect(returnTo.startsWith('/admin/videos') ? returnTo : '/admin/videos')
  }

  async destroy({ params, response, session, admin }: HttpContext) {
    try {
      await deleteVideo(Number(params.id), admin.id)
      session.flash('success', 'Video deleted.')
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to delete the video.')
    }
    return response.redirect('/admin/videos')
  }

  async updateComment({ params, request, response, session, admin }: HttpContext) {
    let videoId: number | null = null
    try {
      const status = request.input('status')
      if (!['visible', 'hidden'].includes(status))
        throw new ApiError(422, 'INVALID_STATUS', 'Choose a valid status.')
      videoId = await setCommentStatus(Number(params.id), status, admin.id)
      session.flash('success', status === 'hidden' ? 'Comment hidden.' : 'Comment restored.')
    } catch (error) {
      session.flash(
        'error',
        error instanceof Error ? error.message : 'Unable to update the comment.'
      )
    }
    return response.redirect(videoId ? `/admin/videos/${videoId}/edit` : '/admin/videos')
  }

  async reports({ request, inertia, session, admin }: HttpContext) {
    const result = await listReports(
      String(request.input('status', 'open')),
      Number(request.input('page', 1))
    )
    return inertia.render(
      'videos/reports',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        ...flashes(session),
        status: result.status,
        rows: result.rows.map((row) => ({
          id: Number(row.id),
          video_id: Number(row.video_id),
          video_caption: row.caption_en as string,
          video_status: row.video_status as string,
          reason: row.reason_label as string,
          note: (row.note as string | null) ?? null,
          reporter:
            [row.first_name, row.last_name].filter(Boolean).join(' ') || (row.phone_e164 as string),
          created_at: dateValue(row.created_at),
        })),
        meta: { total: result.total, page: result.page, lastPage: result.lastPage },
      },
      { bodyClass: 'cms-body' }
    )
  }

  async updateReport({ params, request, response, session, admin }: HttpContext) {
    try {
      const status = request.input('status')
      if (!['reviewed', 'dismissed'].includes(status))
        throw new ApiError(422, 'INVALID_STATUS', 'Choose a valid status.')
      await setReportStatus(Number(params.id), status, admin.id, request.input('unpublish') === '1')
      session.flash(
        'success',
        status === 'dismissed' ? 'Report dismissed.' : 'Report marked as reviewed.'
      )
    } catch (error) {
      session.flash(
        'error',
        error instanceof Error ? error.message : 'Unable to update the report.'
      )
    }
    return response.redirect('/admin/videos/reports')
  }
}
