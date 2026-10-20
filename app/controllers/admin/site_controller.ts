import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { homeValidator, locationValidator, settingsValidator } from '../../validators/content.js'
import { cmsImageUrl, imageFiles, prepareImages } from '../../services/image_storage_service.js'
import { saveHome, saveSettings } from '../../services/site_content_service.js'

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
  async home({ view, admin, request }: HttpContext) {
    const locale = request.input('locale') === 'ar' ? 'ar' : 'en'
    const home = await db.from('home_content').where('locale', locale).first()
    return view.render('admin/home', {
      admin,
      locale,
      home,
      heroImageUrl: cmsImageUrl(home?.hero_image_key),
    })
  }

  async saveHome(ctx: HttpContext) {
    const { request, response, session, admin } = ctx
    const locale = request.input('locale') === 'ar' ? 'ar' : 'en'
    try {
      const input = await homeValidator.validate({
        locale: request.input('locale'),
        heroEyebrow: request.input('heroEyebrow'),
        heroTitle: request.input('heroTitle'),
        discoveryTitle: request.input('discoveryTitle'),
      })
      await saveHome(input, admin.id, await formImage(ctx, 'heroImage', 'removeHeroImage'))
      session.flash('success', 'Homepage content saved.')
    } catch (error) {
      session.flash('error', saveError(request, error, 'Unable to save homepage'))
    }
    return response.redirect(`/admin/home?locale=${locale}`)
  }

  async settings({ view, admin }: HttpContext) {
    const settings = await db.from('site_settings').where('id', 1).first()
    return view.render('admin/settings', {
      admin,
      settings,
      logoImageUrl: cmsImageUrl(settings?.logo_image_key),
    })
  }

  async saveSettings(ctx: HttpContext) {
    const { request, response, session, admin } = ctx
    try {
      const input = await settingsValidator.validate({
        brandName: request.input('brandName'),
        whatsappNumber: request.input('whatsappNumber') || null,
        contactEmail: request.input('contactEmail') || null,
        appStoreUrl: request.input('appStoreUrl') || null,
        playStoreUrl: request.input('playStoreUrl') || null,
      })
      await saveSettings(input, admin.id, await formImage(ctx, 'logoImage', 'removeLogo'))
      session.flash('success', 'Site settings saved.')
    } catch (error) {
      session.flash('error', saveError(request, error, 'Unable to save settings'))
    }
    return response.redirect('/admin/settings')
  }

  async transport({ view, admin }: HttpContext) {
    const locations = await db
      .from('transport_locations as l')
      .join('transport_location_translations as en', function () {
        this.on('en.location_id', '=', 'l.id').andOnVal('en.locale', '=', 'en')
      })
      .leftJoin('transport_location_translations as ar', function () {
        this.on('ar.location_id', '=', 'l.id').andOnVal('ar.locale', '=', 'ar')
      })
      .select(
        'l.id',
        'l.code',
        'l.active',
        'l.pickup_enabled',
        'l.dropoff_enabled',
        'l.sort_order',
        'en.name',
        'ar.name as name_ar'
      )
      .orderBy('l.sort_order')
      .orderBy('l.id')
    return view.render('admin/transport', { admin, locations })
  }

  async saveLocation({ request, params, response, session, admin }: HttpContext) {
    try {
      const input = await locationValidator.validate({
        code: request.input('code'),
        nameEn: request.input('nameEn'),
        nameAr: request.input('nameAr') || null,
        pickupEnabled: request.input('pickupEnabled') === 'on',
        dropoffEnabled: request.input('dropoffEnabled') === 'on',
        active: request.input('active') === 'on',
        sortOrder: Number(request.input('sortOrder', 0)),
      })
      await db.transaction(async (trx) => {
        let id = params.id ? Number(params.id) : undefined
        const fields = {
          code: input.code,
          pickup_enabled: input.pickupEnabled,
          dropoff_enabled: input.dropoffEnabled,
          active: input.active,
          sort_order: input.sortOrder,
        }
        if (id) await trx.from('transport_locations').where('id', id).update(fields)
        else {
          const createdLocationIds = await trx.table('transport_locations').insert(fields)
          id = createdLocationIds[0]
        }
        await trx
          .table('transport_location_translations')
          .insert({ location_id: id, locale: 'en', name: input.nameEn })
          .onConflict(['location_id', 'locale'])
          .merge()
        if (input.nameAr)
          await trx
            .table('transport_location_translations')
            .insert({
              location_id: id,
              locale: 'ar',
              name: input.nameAr,
            })
            .onConflict(['location_id', 'locale'])
            .merge()
        else
          await trx
            .from('transport_location_translations')
            .where('location_id', id!)
            .where('locale', 'ar')
            .delete()
        await trx.table('audit_logs').insert({
          actor_id: admin.id,
          action: params.id ? 'location.updated' : 'location.created',
          entity_type: 'transport_location',
          entity_id: String(id),
          created_at: new Date(),
        })
      })
      session.flash('success', 'Transport location saved.')
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to save location')
    }
    return response.redirect('/admin/transport')
  }

  async deleteLocation({ params, response, session }: HttpContext) {
    await db.from('transport_locations').where('id', Number(params.id)).delete()
    session.flash('success', 'Location deleted.')
    return response.redirect('/admin/transport')
  }
}
