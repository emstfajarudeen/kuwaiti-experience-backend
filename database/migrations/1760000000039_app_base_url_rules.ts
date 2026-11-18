import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Server address per app version: GET /api/v2/config?platform=ios&version=1.1.0 returns the
 * address of the most specific matching rule instead of the default one.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('app_base_url_rules', (table) => {
      table.increments('id')
      table.string('environment', 16).notNullable()
      table.string('platform', 10).notNullable()
      table.string('version', 32).notNullable()
      table.string('api_base_url', 500).notNullable()
      table.string('image_base_url', 500).nullable()
      table.string('note', 200).nullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.unique(['environment', 'platform', 'version'])
    })
  }

  async down() {
    this.schema.dropTable('app_base_url_rules')
  }
}
