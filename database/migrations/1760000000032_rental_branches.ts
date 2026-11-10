import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pickup and return locations become branches of a rental provider, with working hours and
 * closed dates. A location shared by several providers is copied once per provider so each
 * provider owns its branches; existing bookings keep pointing at the original rows.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('rental_locations', (table) => {
      table
        .integer('provider_id')
        .unsigned()
        .nullable()
        .references('rental_providers.id')
        .onDelete('CASCADE')
      table.string('phone_e164', 16).nullable()
      // Off: the branch takes pickups and returns at any time.
      table.boolean('hours_enabled').notNullable().defaultTo(false)
      table.index(['provider_id', 'active', 'sort_order'])
    })

    this.schema.createTable('rental_location_hours', (table) => {
      table.increments('id')
      table
        .integer('location_id')
        .unsigned()
        .notNullable()
        .references('rental_locations.id')
        .onDelete('CASCADE')
      // 0 = Sunday … 6 = Saturday, in Kuwait time.
      table.tinyint('weekday').unsigned().notNullable()
      table.string('opens_at', 5).notNullable()
      table.string('closes_at', 5).notNullable()
      table.index(['location_id', 'weekday'])
    })

    this.schema.createTable('rental_location_closures', (table) => {
      table.increments('id')
      table
        .integer('location_id')
        .unsigned()
        .notNullable()
        .references('rental_locations.id')
        .onDelete('CASCADE')
      table.date('starts_on').notNullable()
      table.date('ends_on').notNullable()
      table.string('reason', 200).nullable()
      table.timestamp('created_at').notNullable()
      table.index(['location_id', 'ends_on'])
    })

    this.defer(async (db) => {
      const locations = await db.from('rental_locations').orderBy('id')
      for (const location of locations) {
        const providerRows = await db
          .from('rental_vehicle_locations as vl')
          .join('rental_vehicles as v', 'v.id', 'vl.vehicle_id')
          .where('vl.location_id', location.id)
          .distinct('v.provider_id')
          .orderBy('v.provider_id')
        const providers = providerRows.map((row) => Number(row.provider_id))
        if (!providers.length) {
          const used = await db
            .from('rental_bookings')
            .where('pickup_location_id', location.id)
            .orWhere('return_location_id', location.id)
            .first()
          if (used)
            await db.from('rental_locations').where('id', location.id).update({ active: false })
          else await db.from('rental_locations').where('id', location.id).delete()
          continue
        }
        const [first, ...others] = providers
        await db.from('rental_locations').where('id', location.id).update({ provider_id: first })
        for (const providerId of others) {
          const copy = { ...location }
          delete copy.id
          const [cloneId] = await db
            .table('rental_locations')
            .insert({ ...copy, provider_id: providerId, created_at: new Date(), updated_at: null })
          const vehicleRows = await db
            .from('rental_vehicles')
            .where('provider_id', providerId)
            .select('id')
          const vehicleIds = vehicleRows.map((row) => row.id)
          await db
            .from('rental_vehicle_locations')
            .where('location_id', location.id)
            .whereIn('vehicle_id', vehicleIds)
            .update({ location_id: cloneId })
        }
      }
    })
  }

  async down() {
    this.schema.dropTable('rental_location_closures')
    this.schema.dropTable('rental_location_hours')
    this.schema.alterTable('rental_locations', (table) => {
      table.dropForeign(['provider_id'])
      table.dropIndex(['provider_id', 'active', 'sort_order'])
      table.dropColumns('provider_id', 'phone_e164', 'hours_enabled')
    })
  }
}
