import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { locationValidator } from '../../validators/content.js'
import { ApiError } from '../../services/api_error.js'

export default class AdminLocationsController {
  async index() {
    const rows = await db
      .from('transport_locations as l')
      .join('transport_location_translations as t', function () {
        this.on('t.location_id', '=', 'l.id').andOnVal('t.locale', '=', 'en')
      })
      .select(
        'l.id',
        'l.code',
        'l.pickup_enabled',
        'l.dropoff_enabled',
        'l.active',
        'l.sort_order',
        't.name'
      )
      .orderBy('l.sort_order')
      .orderBy('l.id')
    return { data: rows }
  }

  async store({ request, admin, response }: HttpContext) {
    const input = await request.validateUsing(locationValidator)
    const id = await db.transaction(async (trx) => {
      const [createdId] = await trx.table('transport_locations').insert({
        code: input.code,
        pickup_enabled: input.pickupEnabled,
        dropoff_enabled: input.dropoffEnabled,
        active: input.active,
        sort_order: input.sortOrder,
      })
      await trx
        .table('transport_location_translations')
        .insert({ location_id: createdId, locale: 'en', name: input.nameEn })
      if (input.nameAr)
        await trx.table('transport_location_translations').insert({
          location_id: createdId,
          locale: 'ar',
          name: input.nameAr,
        })
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'location.created',
        entity_type: 'transport_location',
        entity_id: String(createdId),
        created_at: new Date(),
      })
      return createdId
    })
    return response.created({ data: { id } })
  }

  async update({ params, request, admin }: HttpContext) {
    const id = Number(params.id)
    const input = await request.validateUsing(locationValidator)
    await db.transaction(async (trx) => {
      const changed = await trx.from('transport_locations').where('id', id).update({
        code: input.code,
        pickup_enabled: input.pickupEnabled,
        dropoff_enabled: input.dropoffEnabled,
        active: input.active,
        sort_order: input.sortOrder,
      })
      if (!changed) throw new ApiError(404, 'NOT_FOUND', 'Location not found')
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
          .where('location_id', id)
          .where('locale', 'ar')
          .delete()
      await trx.table('audit_logs').insert({
        actor_id: admin.id,
        action: 'location.updated',
        entity_type: 'transport_location',
        entity_id: String(id),
        created_at: new Date(),
      })
    })
    return { data: { id } }
  }

  async destroy({ params, admin, response }: HttpContext) {
    const id = Number(params.id)
    const changed = await db.from('transport_locations').where('id', id).delete()
    if (!changed) throw new ApiError(404, 'NOT_FOUND', 'Location not found')
    await db.table('audit_logs').insert({
      actor_id: admin.id,
      action: 'location.deleted',
      entity_type: 'transport_location',
      entity_id: String(id),
      created_at: new Date(),
    })
    return response.noContent()
  }
}
