import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('home_explore_cards', (table) => {
      table.increments('id')
      table
        .integer('place_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('places.id')
        .onDelete('RESTRICT')
      table.string('caption_en', 200).nullable()
      table.string('caption_ar', 200).nullable()
      table.integer('sort_order').unsigned().notNullable().defaultTo(0)
      table.boolean('active').notNullable().defaultTo(true)
      table.timestamp('created_at', { precision: 3 }).notNullable()
      table.timestamp('updated_at', { precision: 3 }).nullable()
      table.index(['active', 'sort_order', 'id'])
    })
  }

  async down() {
    this.schema.dropTable('home_explore_cards')
  }
}
