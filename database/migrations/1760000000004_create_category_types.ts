import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('category_types', (table) => {
      table.string('code', 32).primary()
      table.string('name_en', 160).notNullable()
      table.string('name_ar', 160).nullable()
      table.integer('image_id').unsigned().nullable().references('media.id').onDelete('RESTRICT')
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('updated_at').nullable()
      table.index(['sort_order', 'code'])
    })
    this.defer(async () => {
      await this.db.table('category_types').insert([
        { code: 'attraction', name_en: 'Attractions', sort_order: 0 },
        { code: 'restaurant', name_en: 'Restaurants', sort_order: 1 },
        { code: 'hotel_resort', name_en: 'Hotels & Resorts', sort_order: 2 },
        { code: 'theater', name_en: 'Theaters', sort_order: 3 },
      ])
    })
  }

  async down() {
    this.schema.dropTable('category_types')
  }
}
