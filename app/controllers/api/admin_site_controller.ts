import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { homeValidator, settingsValidator } from '../../validators/content.js'
import { contactInquiryTypes } from '../../services/customer_content_service.js'
import { ApiError } from '../../services/api_error.js'
import { can } from '../../services/authorization_service.js'
import {
  adminApiImageUrl,
  imageFiles,
  prepareImages,
} from '../../services/image_storage_service.js'
import {
  saveHome,
  saveSettings,
  setHeroImage,
  setLogo,
} from '../../services/site_content_service.js'

async function settingsData() {
  const row = await db.from('site_settings').where('id', 1).first()
  if (!row) {
    return {
      id: 1,
      brand_name: 'The Kuwaiti Experience',
      direct_phone_number: null,
      direct_phone_description: null,
      whatsapp_number: null,
      whatsapp_description: null,
      contact_email: null,
      headquarters_name: null,
      headquarters_address: null,
      headquarters_map_url: null,
      contact_inquiry_types: [],
      app_store_url: null,
      play_store_url: null,
      logo_image_url: null,
      updated_at: null,
    }
  }
  const { logo_image_key: logoImageKey, contact_inquiry_types: inquiryTypes, ...fields } = row
  return {
    ...fields,
    contact_inquiry_types: contactInquiryTypes(inquiryTypes),
    logo_image_url: adminApiImageUrl(logoImageKey),
  }
}

async function homeData(locale: 'en' | 'ar') {
  const row = await db.from('home_content').where('locale', locale).first()
  return {
    locale,
    hero_eyebrow: row?.hero_eyebrow ?? 'WELCOME TO KUWAIT',
    hero_title: row?.hero_title ?? 'Explore Kuwait',
    discovery_eyebrow: row?.discovery_eyebrow ?? 'EVERYTHING IN ONE PLACE',
    discovery_title: row?.discovery_title ?? 'What would you like to do?',
    discovery_description:
      row?.discovery_description ??
      'Start with a ride, then make the city yours. Find the best of Kuwait by category.',
    hero_image_url: adminApiImageUrl(row?.hero_image_key),
  }
}

function localeFrom(value: unknown): 'en' | 'ar' {
  return value === 'ar' ? 'ar' : 'en'
}

async function singleImage(ctx: HttpContext) {
  const files = imageFiles(ctx.request, 'file')
  if (!files.length) throw new ApiError(422, 'INVALID_IMAGE', 'Attach an image file')
  const { image } = await prepareImages(ctx.admin.id, { image: files })
  return image[0]
}

export default class AdminSiteController {
  async dashboard({ authorization }: HttpContext) {
    const [counts, pages, rawRecent] = await Promise.all([
      can(authorization, 'places.view')
        ? db.from('places').select('type', 'status').count('* as count').groupBy('type', 'status')
        : Promise.resolve([]),
      can(authorization, 'pages.view') ? db.from('pages').count('* as count').first() : null,
      can(authorization, 'audit_logs.view')
        ? db
            .from('audit_logs')
            .select('action', 'entity_type', 'entity_id', 'created_at')
            .orderBy('id', 'desc')
            .limit(30)
        : Promise.resolve([]),
    ])
    const permissions: Record<string, string> = {
      place: 'places.view',
      page: 'pages.view',
      category: 'categories.view',
      category_type: 'category_types.view',
      movie: 'movies.view',
      showtime: 'showtimes.view',
      theater_showtime: 'showtimes.view',
      contact: 'contact_requests.view',
      contact_request: 'contact_requests.view',
      user: 'staff.view',
      staff: 'staff.view',
      role: 'roles.view',
      permission: 'roles.view',
      permission_catalog: 'roles.view',
      rbac: 'roles.view',
      home_content: 'home.view',
      home_explore_card: 'home.view',
      site_settings: 'settings.view',
      transport_location: 'transport.view',
    }
    const recent = rawRecent
      .filter((row) => {
        const permission = permissions[String(row.entity_type)]
        return (
          can(authorization, 'audit_logs.view') &&
          Boolean(permission) &&
          can(authorization, permission)
        )
      })
      .slice(0, 10)
    return {
      data: {
        ...(can(authorization, 'places.view') ? { placeCounts: counts } : {}),
        ...(can(authorization, 'pages.view') ? { pageCount: Number(pages?.count ?? 0) } : {}),
        recent,
      },
    }
  }

  async settings() {
    return { data: await settingsData() }
  }

  async updateSettings({ request, admin }: HttpContext) {
    const input = await request.validateUsing(settingsValidator)
    await saveSettings(input, admin.id)
    return { data: await settingsData() }
  }

  async updateLogo(ctx: HttpContext) {
    await setLogo(await singleImage(ctx), ctx.admin.id)
    return { data: await settingsData() }
  }

  async removeLogo({ admin, response }: HttpContext) {
    await setLogo('remove', admin.id)
    return response.noContent()
  }

  async home({ request }: HttpContext) {
    return { data: await homeData(localeFrom(request.input('locale'))) }
  }

  async updateHome({ request, admin }: HttpContext) {
    const input = await request.validateUsing(homeValidator)
    await saveHome(input, admin.id)
    return { data: await homeData(input.locale) }
  }

  async updateHeroImage(ctx: HttpContext) {
    const locale = localeFrom(ctx.request.input('locale'))
    await setHeroImage(locale, await singleImage(ctx), ctx.admin.id)
    return { data: await homeData(locale) }
  }

  async removeHeroImage({ request, admin, response }: HttpContext) {
    await setHeroImage(localeFrom(request.input('locale')), 'remove', admin.id)
    return response.noContent()
  }
}
