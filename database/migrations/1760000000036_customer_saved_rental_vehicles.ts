import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('customer_saved_rental_vehicles', (table) => {
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table
        .integer('vehicle_id')
        .unsigned()
        .notNullable()
        .references('rental_vehicles.id')
        .onDelete('CASCADE')
      table.timestamp('created_at', { precision: 3 }).notNullable()
      table.primary(['customer_id', 'vehicle_id'])
      table.index(['customer_id', 'created_at', 'vehicle_id'], 'saved_rental_vehicles_customer_idx')
      table.index(['vehicle_id'], 'saved_rental_vehicles_vehicle_idx')
    })
  }

  async down() {
    this.schema.dropTable('customer_saved_rental_vehicles')
  }
}
