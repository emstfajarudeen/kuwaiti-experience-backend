import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('site_settings', (table) => {
      table.string('direct_phone_number', 25).nullable()
      table.string('direct_phone_description', 160).nullable()
      table.string('whatsapp_description', 160).nullable()
      table.string('headquarters_name', 160).nullable()
      table.string('headquarters_address', 300).nullable()
      table.string('headquarters_map_url', 500).nullable()
      table.json('contact_inquiry_types').nullable()
    })
  }

  async down() {
    this.schema.alterTable('site_settings', (table) => {
      table.dropColumn('contact_inquiry_types')
      table.dropColumn('headquarters_map_url')
      table.dropColumn('headquarters_address')
      table.dropColumn('headquarters_name')
      table.dropColumn('whatsapp_description')
      table.dropColumn('direct_phone_description')
      table.dropColumn('direct_phone_number')
    })
  }
}
