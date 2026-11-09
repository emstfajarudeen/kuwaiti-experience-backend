import { BaseSchema } from '@adonisjs/lucid/schema'

/** Unavailable periods were removed from the CMS; availability now depends on bookings only. */
export default class extends BaseSchema {
  async up() {
    this.schema.dropTableIfExists('rental_vehicle_blocks')
  }

  async down() {
    this.schema.createTable('rental_vehicle_blocks', (table) => {
      table.increments('id')
      table
        .integer('vehicle_id')
        .unsigned()
        .notNullable()
        .references('rental_vehicles.id')
        .onDelete('CASCADE')
      table.timestamp('starts_at').notNullable()
      table.timestamp('ends_at').notNullable()
      table.string('reason', 200).nullable()
      table.timestamp('created_at').notNullable()
      table.index(['vehicle_id', 'starts_at', 'ends_at'])
    })
  }
}
