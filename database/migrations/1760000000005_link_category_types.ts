import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('categories', (table) => {
      table.foreign('type').references('category_types.code').onDelete('RESTRICT')
    })
    this.schema.alterTable('places', (table) => {
      table.foreign('type').references('category_types.code').onDelete('RESTRICT')
    })
  }

  async down() {
    this.schema.alterTable('places', (table) => table.dropForeign('type'))
    this.schema.alterTable('categories', (table) => table.dropForeign('type'))
  }
}
