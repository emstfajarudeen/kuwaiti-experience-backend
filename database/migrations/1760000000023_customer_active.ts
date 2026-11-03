import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('customers', (table) => {
      table.boolean('active').notNullable().defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable('customers', (table) => {
      table.dropColumn('active')
    })
  }
}
