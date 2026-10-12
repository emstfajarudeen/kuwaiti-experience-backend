import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { homeValidator, settingsValidator } from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'

async function assertMedia(id?: number | null) {
  if (id && !(await db.from('media').where('id', id).first())) {
    throw new ApiError(422, 'INVALID_MEDIA', 'Image not found')
  }
}

function httpOnly(value?: string | null) {
  if (value && !['http:', 'https:'].includes(new URL(value).protocol)) {
    throw new ApiError(422, 'INVALID_URL', 'Use an HTTP or HTTPS URL')
  }
  return value ?? null
}

export default class AdminSiteController {
  async dashboard() {
    const counts = await db
      .from('places')
      .select('type', 'status')
      .count('* as count')
      .groupBy('type', 'status')
    const pages = await db.from('pages').count('* as count').first()
    const media = await db.from('media').count('* as count').first()
    const recent = await db
      .from('audit_logs')
      .select('action', 'entity_type', 'entity_id', 'created_at')
      .orderBy('id', 'desc')
      .limit(10)
    return {
      data: {
        placeCounts: counts,
        pageCount: Number(pages?.count ?? 0),
        mediaCount: Number(media?.count ?? 0),
        recent,
      },
    }
  }

  async settings() {
    return {
      data: (await db.from('site_settings').where('id', 1).first()) ?? {
        id: 1,
        brand_name: 'The Kuwaiti Experience',
      },
    }
  }

  async updateSettings({ request, admin }: HttpContext) {
    const input = await request.validateUsing(settingsValidator)
    await assertMedia(input.logoMediaId)
    const fields = {
      id: 1,
      brand_name: input.brandName,
      whatsapp_number: input.whatsappNumber ?? null,
      contact_email: input.contactEmail ?? null,
      app_store_url: httpOnly(input.appStoreUrl),
      play_store_url: httpOnly(input.playStoreUrl),
      logo_media_id: input.logoMediaId ?? null,
      updated_at: new Date(),
    }
    await db.transaction(async (trx) => {
      await trx.table('site_settings').insert(fields).onConflict('id').merge()
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'site.settings.updated',
        entity_type: 'site_settings',
        entity_id: '1',
        created_at: new Date(),
      })
    })
    return { data: fields }
  }

  async home({ request }: HttpContext) {
    const locale = request.input('locale') === 'ar' ? 'ar' : 'en'
    const row = await db.from('home_content').where('locale', locale).first()
    return {
      data: {
        locale,
        hero_eyebrow: row?.hero_eyebrow ?? 'WELCOME TO KUWAIT',
        hero_title: row?.hero_title ?? 'Explore Kuwait',
        discovery_title: row?.discovery_title ?? 'What would you like to do?',
        hero_media_id: row?.hero_media_id ?? null,
      },
    }
  }

  async updateHome({ request, admin }: HttpContext) {
    const input = await request.validateUsing(homeValidator)
    await assertMedia(input.heroMediaId)
    const fields = {
      locale: input.locale,
      hero_eyebrow: input.heroEyebrow,
      hero_title: input.heroTitle,
      discovery_title: input.discoveryTitle,
      hero_media_id: input.heroMediaId ?? null,
      updated_at: new Date(),
    }
    await db.transaction(async (trx) => {
      await trx.table('home_content').insert(fields).onConflict('locale').merge()
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'home.updated',
        entity_type: 'home_content',
        entity_id: input.locale,
        created_at: new Date(),
      })
    })
    return { data: fields }
  }
}
