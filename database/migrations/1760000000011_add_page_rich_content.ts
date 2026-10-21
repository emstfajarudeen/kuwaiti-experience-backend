import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('page_translations', (table) => {
      table.string('eyebrow', 120).nullable()
      table.string('body_format', 16).notNullable().defaultTo('plain_text')
    })
  }

  async down() {
    this.schema.alterTable('page_translations', (table) => {
      table.dropColumn('body_format')
      table.dropColumn('eyebrow')
    })
  }
}
