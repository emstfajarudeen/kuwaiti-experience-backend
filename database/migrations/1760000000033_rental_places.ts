import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pickup places are the one shared list the app shows (Airport, The Avenues…). Each provider
 * branch sits at a place; customers choose a place and see every provider's cars there.
 * Existing branches are grouped into places by their English name.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('rental_places', (table) => {
      table.increments('id')
      table.string('name_en', 160).notNullable()
      table.string('name_ar', 160).nullable()
      // Second line in the app list, e.g. "Kuwait City · Main entrance".
      table.string('subtitle_en', 200).nullable()
      table.string('subtitle_ar', 200).nullable()
      table.decimal('latitude', 10, 7).nullable()
      table.decimal('longitude', 10, 7).nullable()
      table.boolean('active').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['active', 'sort_order'])
    })

    this.schema.alterTable('rental_locations', (table) => {
      table
        .integer('place_id')
        .unsigned()
        .nullable()
        .references('rental_places.id')
        .onDelete('SET NULL')
      table.index(['place_id', 'active'])
    })

    this.defer(async (db) => {
      const branches = await db.from('rental_locations').orderBy('sort_order').orderBy('id')
      const places = new Map<string, number>()
      for (const branch of branches) {
        const key = String(branch.name_en).trim().toLowerCase()
        let placeId = places.get(key)
        if (!placeId) {
          ;[placeId] = await db.table('rental_places').insert({
            name_en: branch.name_en,
            name_ar: branch.name_ar,
            subtitle_en: branch.address,
            latitude: branch.latitude,
            longitude: branch.longitude,
            active: true,
            sort_order: places.size,
            created_at: new Date(),
          })
          places.set(key, placeId!)
        }
        await db.from('rental_locations').where('id', branch.id).update({ place_id: placeId })
      }
    })
  }

  async down() {
    this.schema.alterTable('rental_locations', (table) => {
      table.dropForeign(['place_id'])
      table.dropIndex(['place_id', 'active'])
      table.dropColumn('place_id')
    })
    this.schema.dropTable('rental_places')
  }
}
