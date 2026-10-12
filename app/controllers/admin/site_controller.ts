import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { homeValidator, locationValidator, settingsValidator } from '../../validators/content.js'

function numberOrNull(value: unknown) {
  return value ? Number(value) : null
}

export default class AdminSitePageController {
  async home({ view, admin, request }: HttpContext) {
    const locale = request.input('locale') === 'ar' ? 'ar' : 'en'
    const home = await db.from('home_content').where('locale', locale).first()
    const media = await db
      .from('media')
      .select('id', 'original_name')
      .orderBy('id', 'desc')
      .limit(100)
    return view.render('admin/home', { admin, locale, home, media })
  }

  async saveHome({ request, response, session, admin }: HttpContext) {
    try {
      const input = await homeValidator.validate({
        locale: request.input('locale'),
        heroEyebrow: request.input('heroEyebrow'),
        heroTitle: request.input('heroTitle'),
        discoveryTitle: request.input('discoveryTitle'),
        heroMediaId: numberOrNull(request.input('heroMediaId')),
      })
      if (input.heroMediaId && !(await db.from('media').where('id', input.heroMediaId).first()))
        throw new Error('Image not found')
      await db.transaction(async (trx) => {
        await trx
          .table('home_content')
          .insert({
            locale: input.locale,
            hero_eyebrow: input.heroEyebrow,
            hero_title: input.heroTitle,
            discovery_title: input.discoveryTitle,
            hero_media_id: input.heroMediaId ?? null,
            updated_at: new Date(),
          })
          .onConflict('locale')
          .merge()
        await trx.table('audit_logs').insert({
          actor_id: admin.id,
          action: 'home.updated',
          entity_type: 'home_content',
          entity_id: input.locale,
          created_at: new Date(),
        })
      })
      session.flash('success', 'Homepage content saved.')
      return response.redirect(`/admin/home?locale=${input.locale}`)
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to save homepage')
      return response.redirect('/admin/home')
    }
  }

  async settings({ view, admin }: HttpContext) {
    const settings = await db.from('site_settings').where('id', 1).first()
    const media = await db
      .from('media')
      .select('id', 'original_name')
      .orderBy('id', 'desc')
      .limit(100)
    return view.render('admin/settings', { admin, settings, media })
  }

  async saveSettings({ request, response, session, admin }: HttpContext) {
    try {
      const input = await settingsValidator.validate({
        brandName: request.input('brandName'),
        whatsappNumber: request.input('whatsappNumber') || null,
        contactEmail: request.input('contactEmail') || null,
        appStoreUrl: request.input('appStoreUrl') || null,
        playStoreUrl: request.input('playStoreUrl') || null,
        logoMediaId: numberOrNull(request.input('logoMediaId')),
      })
      for (const value of [input.appStoreUrl, input.playStoreUrl]) {
        if (value && !['https:', 'http:'].includes(new URL(value).protocol))
          throw new Error('Store links must use HTTP or HTTPS')
      }
      if (input.logoMediaId && !(await db.from('media').where('id', input.logoMediaId).first())) {
        throw new Error('Logo image not found')
      }
      await db.transaction(async (trx) => {
        await trx
          .table('site_settings')
          .insert({
            id: 1,
            brand_name: input.brandName,
            whatsapp_number: input.whatsappNumber ?? null,
            contact_email: input.contactEmail ?? null,
            app_store_url: input.appStoreUrl ?? null,
            play_store_url: input.playStoreUrl ?? null,
            logo_media_id: input.logoMediaId ?? null,
            updated_at: new Date(),
          })
          .onConflict('id')
          .merge()
        await trx.table('audit_logs').insert({
          actor_id: admin.id,
          action: 'site.settings.updated',
          entity_type: 'site_settings',
          entity_id: '1',
          created_at: new Date(),
        })
      })
      session.flash('success', 'Site settings saved.')
    } catch (error) {
      session.flash('error', error instanceof Error ? error.message : 'Unable to save settings')
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
