import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { settingsValidator } from '../../validators/content.js'
import { cmsImageUrl, imageFiles, prepareImages } from '../../services/image_storage_service.js'
import { saveHome, saveSettings } from '../../services/site_content_service.js'
import { homeContentValidator } from '../../validators/home.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'

async function formImage(ctx: HttpContext, field: string, removeField: string) {
  const { image } = await prepareImages(ctx.admin.id, { image: imageFiles(ctx.request, field) })
  return image[0] ?? (ctx.request.input(removeField) === 'on' ? ('remove' as const) : undefined)
}

function saveError(request: HttpContext['request'], error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback
  return Object.keys(request.allFiles()).length > 0
    ? `${message.replace(/\.$/, '')}. Re-select the image you attached.`
    : message
}

export default class AdminSitePageController {
  async home({ inertia, session, admin, request }: HttpContext) {
    const locale = request.input('locale') === 'ar' ? 'ar' : 'en'
    const home = await db.from('home_content').where('locale', locale).first()
    return inertia.render(
      'site/home',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: this.formValues(session.flashMessages.get('homeForm'), [
          'hero_eyebrow',
          'hero_title',
          'discovery_eyebrow',
          'discovery_title',
          'discovery_description',
        ]),
        locale,
        home: home
          ? {
              hero_eyebrow: home.hero_eyebrow,
              hero_title: home.hero_title,
              discovery_eyebrow: home.discovery_eyebrow,
              discovery_title: home.discovery_title,
              discovery_description: home.discovery_description,
            }
          : null,
        heroImageUrl: cmsImageUrl(home?.hero_image_key),
      },
      { bodyClass: 'cms-body' }
    )
  }

  private formValues(value: unknown, keys: string[]) {
    if (!value || typeof value !== 'object') return null
    const form = value as Record<string, unknown>
    return Object.fromEntries(
      keys.map((key) => [key, typeof form[key] === 'string' ? form[key] : null])
    )
  }

  async saveHome(ctx: HttpContext) {
    const { request, response, session, admin } = ctx
    const locale = request.input('locale') === 'ar' ? 'ar' : 'en'
    try {
      const existing = await db.from('home_content').where('locale', locale).first()
      const input = await homeContentValidator.validate({
        locale: request.input('locale'),
        hero_eyebrow: request.input('hero_eyebrow') ?? request.input('heroEyebrow'),
        hero_title: request.input('hero_title') ?? request.input('heroTitle'),
        discovery_eyebrow: request.input('discovery_eyebrow'),
        discovery_title: request.input('discovery_title'),
        discovery_description: request.input('discovery_description'),
        app_title: existing?.app_title ?? null,
        app_body: existing?.app_body ?? null,
      })
      await saveHome(
        {
          locale: input.locale,
          heroEyebrow: input.hero_eyebrow,
          heroTitle: input.hero_title,
          discoveryEyebrow: input.discovery_eyebrow,
          discoveryTitle: input.discovery_title,
          discoveryDescription: input.discovery_description,
          appTitle: input.app_title,
          appBody: input.app_body,
        },
        admin.id,
        await formImage(ctx, 'heroImage', 'removeHeroImage')
      )
      session.flash('success', 'Homepage content saved.')
    } catch (error) {
      const fieldErrors = validationErrorBag(error)
      if (fieldErrors) session.flash('inputErrorsBag', fieldErrors)
      session.flash('error', saveError(request, error, 'Unable to save homepage'))
      session.flash('homeForm', request.except(['heroImage']))
    }
    return response.redirect(`/admin/home?locale=${locale}`)
  }

  async settings({ inertia, request, session, admin }: HttpContext) {
    const settings = await db.from('site_settings').where('id', 1).first()
    const keys = [
      'app_store_url', 'play_store_url', 'direct_phone_number', 'direct_phone_description',
      'whatsapp_number', 'whatsapp_description', 'contact_email', 'headquarters_name',
      'headquarters_address', 'headquarters_map_url',
    ]
    return inertia.render(
      'site/settings',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: this.formValues(session.flashMessages.get('settingsForm'), [
          'appStoreUrl',
          'playStoreUrl',
          'directPhoneNumber', 'directPhoneDescription', 'whatsappNumber',
          'whatsappDescription', 'contactEmail', 'headquartersName',
          'headquartersAddress', 'headquartersMapUrl',
        ]),
        settings: settings ? Object.fromEntries(keys.map((key) => [key, settings[key]])) : null,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async saveSettings(ctx: HttpContext) {
    const { request, response, session, admin } = ctx
    try {
      const input = await settingsValidator.validate({
        appStoreUrl: request.input('appStoreUrl') || null,
        playStoreUrl: request.input('playStoreUrl') || null,
        directPhoneNumber: request.input('directPhoneNumber') || null,
        directPhoneDescription: request.input('directPhoneDescription') || null,
        whatsappNumber: request.input('whatsappNumber') || null,
        whatsappDescription: request.input('whatsappDescription') || null,
        contactEmail: request.input('contactEmail') || null,
        headquartersName: request.input('headquartersName') || null,
        headquartersAddress: request.input('headquartersAddress') || null,
        headquartersMapUrl: request.input('headquartersMapUrl') || null,
      })
      await saveSettings(input, admin.id)
      session.flash('success', 'Site settings saved.')
    } catch (error) {
      const fieldErrors = validationErrorBag(error)
      if (fieldErrors) session.flash('inputErrorsBag', fieldErrors)
      session.flash('error', saveError(request, error, 'Unable to save settings'))
      session.flash('settingsForm', request.all())
    }
    return response.redirect('/admin/settings')
  }

}
