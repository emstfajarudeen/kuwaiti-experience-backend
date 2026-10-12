import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import ApiMediaController from '../api/media_controller.js'

const api = new ApiMediaController()

export default class AdminMediaPageController {
  async index({ view, admin }: HttpContext) {
    const rows = await db
      .from('media')
      .select('id', 'original_name', 'alt_en', 'alt_ar', 'bytes', 'created_at')
      .orderBy('id', 'desc')
      .limit(100)
    return view.render('admin/media', { admin, rows })
  }

  async upload(ctx: HttpContext) {
    try {
      await api.upload(ctx)
      ctx.session.flash('success', 'Image added to the media library.')
    } catch (error) {
      ctx.session.flash('error', error instanceof Error ? error.message : 'Upload failed')
    }
    return ctx.response.redirect('/admin/media')
  }

  async file(ctx: HttpContext) {
    return api.file(ctx)
  }

  async updateAlt({ params, request, response, session, admin }: HttpContext) {
    const alt = String(request.input('alt_en', '')).trim()
    if (!alt || alt.length > 255) {
      session.flash('error', 'Alt text must be between 1 and 255 characters.')
      return response.redirect('/admin/media')
    }
    await db
      .from('media')
      .where('id', Number(params.id))
      .update({
        alt_en: alt,
        alt_ar: String(request.input('alt_ar', '')).trim().slice(0, 255) || null,
      })
    await db.table('audit_logs').insert({
      actor_id: admin.id,
      action: 'media.alt.updated',
      entity_type: 'media',
      entity_id: String(params.id),
      created_at: new Date(),
    })
    session.flash('success', 'Image description saved.')
    return response.redirect('/admin/media')
  }

  async destroy(ctx: HttpContext) {
    try {
      await api.destroy(ctx)
      ctx.session.flash('success', 'Image removed.')
    } catch (error) {
      ctx.session.flash('error', error instanceof Error ? error.message : 'Unable to remove image')
    }
    return ctx.response.redirect('/admin/media')
  }
}
