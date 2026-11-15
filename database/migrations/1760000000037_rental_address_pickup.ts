import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pickup at the customer's own address (with-driver bookings only).
 *
 * Service areas are the named areas of Kuwait (Salmiya, Jahra…), each with a pin. An address
 * belongs to the area whose pin is nearest. Providers list the areas they do not serve, and
 * their cars are not offered for addresses in those areas.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('rental_service_areas', (table) => {
      table.increments('id')
      table.string('name_en', 160).notNullable()
      table.string('name_ar', 160).nullable()
      table.decimal('latitude', 10, 7).notNullable()
      table.decimal('longitude', 10, 7).notNullable()
      table.boolean('active').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['active', 'sort_order'], 'rental_service_areas_active_idx')
    })

    this.schema.createTable('rental_provider_excluded_areas', (table) => {
      table
        .integer('provider_id')
        .unsigned()
        .notNullable()
        .references('rental_providers.id')
        .onDelete('CASCADE')
      table
        .integer('area_id')
        .unsigned()
        .notNullable()
        .references('rental_service_areas.id')
        .onDelete('CASCADE')
      table.primary(['provider_id', 'area_id'])
      table.index(['area_id'], 'rental_provider_excluded_areas_area_idx')
    })

    this.schema.alterTable('rental_bookings', (table) => {
      // 'branch' = the customer goes to the branch place; 'address' = the driver picks them up.
      table.string('pickup_type', 16).notNullable().defaultTo('branch')
      table.string('pickup_address', 500).nullable()
      table.decimal('pickup_latitude', 10, 7).nullable()
      table.decimal('pickup_longitude', 10, 7).nullable()
      table
        .integer('pickup_area_id')
        .unsigned()
        .nullable()
        .references('rental_service_areas.id')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable('rental_bookings', (table) => {
      table.dropForeign(['pickup_area_id'])
      table.dropColumns(
        'pickup_type',
        'pickup_address',
        'pickup_latitude',
        'pickup_longitude',
        'pickup_area_id'
      )
    })
    this.schema.dropTable('rental_provider_excluded_areas')
    this.schema.dropTable('rental_service_areas')
  }
}
