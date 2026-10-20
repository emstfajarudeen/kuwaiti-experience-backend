import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('customers', (table) => {
      table.uuid('profile_photo_id').nullable()
    })
    this.schema.alterTable('customer_otp_challenges', (table) => {
      table.string('purpose', 20).notNullable().defaultTo('sign_in')
      table
        .integer('customer_id')
        .unsigned()
        .nullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table.uuid('session_id').nullable().references('customer_sessions.id').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.alterTable('customer_otp_challenges', (table) => {
      table.dropForeign('session_id')
      table.dropForeign('customer_id')
      table.dropColumns('purpose', 'customer_id', 'session_id')
    })
    this.schema.alterTable('customers', (table) => table.dropColumn('profile_photo_id'))
  }
}
