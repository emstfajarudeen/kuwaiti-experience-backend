import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('contact_requests', (table) => {
      table.string('phone_number', 25).nullable()
      table.string('inquiry_type', 120).nullable()
    })
  }

  async down() {
    this.schema.alterTable('contact_requests', (table) => {
      table.dropColumn('inquiry_type')
      table.dropColumn('phone_number')
    })
  }
}
