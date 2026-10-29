import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('customer_saved_addresses', (table) => {
      table.increments('id')
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table.string('label', 80).notNullable()
      table.string('address', 500).notNullable()
      table.decimal('latitude', 10, 7).notNullable()
      table.decimal('longitude', 10, 7).notNullable()
      table.string('notes', 500).nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['customer_id', 'id'])
    })
  }

  async down() {
    this.schema.dropTable('customer_saved_addresses')
  }
}
