import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Removes the shared media library. Each image now belongs to exactly one
 * record and is stored as a private Drive key on that record. Existing media
 * rows and their links are discarded; image files must be uploaded again.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('places', (table) => {
      table.dropForeign(['cover_media_id'])
      table.dropColumn('cover_media_id')
      table.string('cover_image_key', 120).nullable().unique()
    })
    this.schema.alterTable('categories', (table) => {
      table.dropForeign(['image_id'])
      table.dropColumn('image_id')
    })
    this.schema.alterTable('category_types', (table) => {
      table.dropForeign(['image_id'])
      table.dropColumn('image_id')
      table.string('image_key', 120).nullable().unique()
    })
    this.schema.alterTable('home_content', (table) => {
      table.dropForeign(['hero_media_id'])
      table.dropForeign(['app_media_id'])
      table.dropColumn('hero_media_id')
      table.dropColumn('app_media_id')
      table.string('hero_image_key', 120).nullable().unique()
    })
    this.schema.alterTable('site_settings', (table) => {
      table.dropForeign(['logo_media_id'])
      table.dropColumn('logo_media_id')
      table.string('logo_image_key', 120).nullable().unique()
    })
    this.schema.dropTable('place_media')
    this.schema.dropTable('media')

    this.schema.createTable('place_images', (table) => {
      table.increments('id')
      table.integer('place_id').unsigned().notNullable().references('places.id').onDelete('CASCADE')
      table.string('storage_key', 120).notNullable().unique()
      table.string('alt_en', 255).notNullable()
      table.string('alt_ar', 255).nullable()
      table.string('caption_en', 255).nullable()
      table.string('caption_ar', 255).nullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.index(['place_id', 'sort_order'])
    })
  }

  /**
   * Schema-only rollback. Image keys are dropped and the old media tables are
   * recreated empty; no image data is restored.
   */
  async down() {
    this.schema.dropTable('place_images')

    this.schema.createTable('media', (table) => {
      table.increments('id')
      table.string('disk', 40).notNullable().defaultTo('local')
      table.string('storage_key', 300).notNullable().unique()
      table.string('original_name', 255).notNullable()
      table.string('mime', 80).notNullable()
      table.integer('bytes').unsigned().notNullable()
      table.integer('width').unsigned().nullable()
      table.integer('height').unsigned().nullable()
      table.string('alt_en', 255).notNullable().defaultTo('')
      table.string('alt_ar', 255).nullable()
      table.integer('uploaded_by').unsigned().nullable().references('users.id').onDelete('SET NULL')
      table.timestamp('created_at').notNullable()
    })
    this.schema.createTable('place_media', (table) => {
      table.increments('id')
      table.integer('place_id').unsigned().notNullable().references('places.id').onDelete('CASCADE')
      table.integer('media_id').unsigned().notNullable().references('media.id').onDelete('RESTRICT')
      table.integer('sort_order').notNullable().defaultTo(0)
      table.string('caption_en', 255).nullable()
      table.string('caption_ar', 255).nullable()
      table.unique(['place_id', 'media_id'])
      table.index(['place_id', 'sort_order'])
    })
    this.schema.alterTable('site_settings', (table) => {
      table.dropColumn('logo_image_key')
      table
        .integer('logo_media_id')
        .unsigned()
        .nullable()
        .references('media.id')
        .onDelete('RESTRICT')
    })
    this.schema.alterTable('home_content', (table) => {
      table.dropColumn('hero_image_key')
      table
        .integer('hero_media_id')
        .unsigned()
        .nullable()
        .references('media.id')
        .onDelete('RESTRICT')
      table
        .integer('app_media_id')
        .unsigned()
        .nullable()
        .references('media.id')
        .onDelete('RESTRICT')
    })
    this.schema.alterTable('category_types', (table) => {
      table.dropColumn('image_key')
      table.integer('image_id').unsigned().nullable().references('media.id').onDelete('RESTRICT')
    })
    this.schema.alterTable('categories', (table) => {
      table.integer('image_id').unsigned().nullable().references('media.id').onDelete('SET NULL')
    })
    this.schema.alterTable('places', (table) => {
      table.dropColumn('cover_image_key')
      table
        .integer('cover_media_id')
        .unsigned()
        .nullable()
        .references('media.id')
        .onDelete('RESTRICT')
    })
  }
}
