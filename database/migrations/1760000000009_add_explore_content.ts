import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('places', (table) => {
      table.string('phone_e164', 16).nullable()
      table.time('check_in_time').nullable()
      table.time('check_out_time').nullable()
      table.integer('screen_count').unsigned().nullable()
    })
    this.schema.createTable('place_features', (table) => {
      table.increments('id')
      table.string('type', 32).notNullable().references('category_types.code').onDelete('RESTRICT')
      table.string('code', 80).notNullable()
      table.string('kind', 16).notNullable()
      table.string('name_en', 120).notNullable()
      table.string('name_ar', 120).nullable()
      table.boolean('active').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at', { precision: 3 }).notNullable()
      table.timestamp('updated_at', { precision: 3 }).nullable()
      table.unique(['type', 'code'])
      table.index(['type', 'active', 'sort_order'])
    })
    this.schema.createTable('place_feature_assignments', (table) => {
      table.integer('place_id').unsigned().notNullable().references('places.id').onDelete('CASCADE')
      table
        .integer('feature_id')
        .unsigned()
        .notNullable()
        .references('place_features.id')
        .onDelete('RESTRICT')
      table.primary(['place_id', 'feature_id'])
      table.index(['feature_id', 'place_id'])
    })
    this.schema.createTable('customer_saved_places', (table) => {
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table.integer('place_id').unsigned().notNullable().references('places.id').onDelete('CASCADE')
      table.timestamp('created_at', { precision: 3 }).notNullable()
      table.primary(['customer_id', 'place_id'])
      table.index(['customer_id', 'created_at', 'place_id'])
    })
    this.schema.createTable('movies', (table) => {
      table.increments('id')
      table.string('title_en', 200).notNullable()
      table.string('title_ar', 200).nullable()
      table.text('synopsis_en').nullable()
      table.text('synopsis_ar').nullable()
      table.integer('duration_minutes').unsigned().nullable()
      table.string('age_rating', 30).nullable()
      table.string('poster_image_key', 120).nullable().unique()
      table.string('status', 16).notNullable().defaultTo('draft')
      table.timestamp('published_at', { precision: 3 }).nullable()
      table.timestamp('created_at', { precision: 3 }).notNullable()
      table.timestamp('updated_at', { precision: 3 }).nullable()
      table.index(['status', 'published_at', 'id'])
    })
    this.schema.createTable('theater_showtimes', (table) => {
      table.increments('id')
      table.integer('place_id').unsigned().notNullable().references('places.id').onDelete('CASCADE')
      table
        .integer('movie_id')
        .unsigned()
        .notNullable()
        .references('movies.id')
        .onDelete('RESTRICT')
      table.timestamp('starts_at', { precision: 3 }).notNullable()
      table.string('format', 80).notNullable()
      table.string('status', 16).notNullable().defaultTo('draft')
      table.timestamp('created_at', { precision: 3 }).notNullable()
      table.timestamp('updated_at', { precision: 3 }).nullable()
      table.unique(['place_id', 'movie_id', 'starts_at', 'format'])
      table.index(['place_id', 'status', 'starts_at'])
    })
  }

  async down() {
    for (const table of [
      'theater_showtimes',
      'movies',
      'customer_saved_places',
      'place_feature_assignments',
      'place_features',
    ])
      this.schema.dropTable(table)
    this.schema.alterTable('places', (table) => {
      table.dropColumns('phone_e164', 'check_in_time', 'check_out_time', 'screen_count')
    })
  }
}
