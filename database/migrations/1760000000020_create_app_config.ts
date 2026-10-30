import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('app_config', (table) => {
      table.string('environment', 16).primary()
      table.string('ios_version', 32).nullable()
      table.boolean('ios_force').notNullable().defaultTo(false)
      table.string('ios_store_url', 500).nullable()
      table.string('android_version', 32).nullable()
      table.boolean('android_force').notNullable().defaultTo(false)
      table.string('android_store_url', 500).nullable()
      table.string('update_title_en', 200).notNullable()
      table.string('update_title_ar', 200).nullable()
      table.text('update_message_en').notNullable()
      table.text('update_message_ar').nullable()
      table.boolean('maintenance_enabled').notNullable().defaultTo(false)
      table.string('maintenance_title_en', 200).notNullable()
      table.string('maintenance_title_ar', 200).nullable()
      table.text('maintenance_message_en').notNullable()
      table.text('maintenance_message_ar').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable('app_config')
  }
}
