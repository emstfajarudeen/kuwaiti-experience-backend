import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
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

    this.schema.createTable('categories', (table) => {
      table.increments('id')
      table.string('type', 32).notNullable()
      table.string('slug', 120).notNullable()
      table.integer('image_id').unsigned().nullable().references('media.id').onDelete('SET NULL')
      table.integer('sort_order').notNullable().defaultTo(0)
      table.boolean('active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.unique(['type', 'slug'])
      table.index(['type', 'active', 'sort_order'])
    })

    this.schema.createTable('category_translations', (table) => {
      table.increments('id')
      table
        .integer('category_id')
        .unsigned()
        .notNullable()
        .references('categories.id')
        .onDelete('CASCADE')
      table.string('locale', 2).notNullable()
      table.string('name', 160).notNullable()
      table.unique(['category_id', 'locale'])
    })

    this.schema.createTable('places', (table) => {
      table.increments('id')
      table.string('type', 32).notNullable()
      table
        .integer('category_id')
        .unsigned()
        .nullable()
        .references('categories.id')
        .onDelete('RESTRICT')
      table.string('slug', 160).notNullable().unique()
      table.string('status', 16).notNullable().defaultTo('draft')
      table
        .integer('cover_media_id')
        .unsigned()
        .nullable()
        .references('media.id')
        .onDelete('RESTRICT')
      table.decimal('latitude', 10, 7).nullable()
      table.decimal('longitude', 10, 7).nullable()
      table.decimal('price_amount', 10, 3).nullable()
      table.string('price_currency', 3).notNullable().defaultTo('KWD')
      table.string('price_mode', 16).notNullable().defaultTo('unknown')
      table.string('website_url', 500).nullable()
      table.integer('featured_order').nullable()
      table.timestamp('published_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['type', 'status', 'published_at', 'id'])
      table.index(['category_id', 'status', 'id'])
      table.index(['type', 'featured_order'])
    })

    this.schema.createTable('place_translations', (table) => {
      table.increments('id')
      table.integer('place_id').unsigned().notNullable().references('places.id').onDelete('CASCADE')
      table.string('locale', 2).notNullable()
      table.string('title', 200).notNullable()
      table.string('summary', 500).notNullable()
      table.text('body').nullable()
      table.string('address', 300).notNullable()
      table.string('hours_note', 200).nullable()
      table.string('price_unit', 80).nullable()
      table.string('seo_title', 200).nullable()
      table.string('seo_description', 300).nullable()
      table.unique(['place_id', 'locale'])
    })

    this.schema.createTable('place_hours', (table) => {
      table.increments('id')
      table.integer('place_id').unsigned().notNullable().references('places.id').onDelete('CASCADE')
      table.integer('weekday').unsigned().notNullable()
      table.integer('interval_index').unsigned().notNullable().defaultTo(0)
      table.time('opens_at').nullable()
      table.time('closes_at').nullable()
      table.boolean('closes_next_day').notNullable().defaultTo(false)
      table.boolean('closed').notNullable().defaultTo(false)
      table.unique(['place_id', 'weekday', 'interval_index'])
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

    this.schema.createTable('pages', (table) => {
      table.increments('id')
      table.string('slug', 120).notNullable().unique()
      table.string('status', 16).notNullable().defaultTo('draft')
      table.timestamp('published_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('page_translations', (table) => {
      table.increments('id')
      table.integer('page_id').unsigned().notNullable().references('pages.id').onDelete('CASCADE')
      table.string('locale', 2).notNullable()
      table.string('title', 200).notNullable()
      table.text('body').notNullable()
      table.string('seo_title', 200).nullable()
      table.string('seo_description', 300).nullable()
      table.unique(['page_id', 'locale'])
    })

    this.schema.createTable('site_settings', (table) => {
      table.integer('id').primary()
      table.string('brand_name', 120).notNullable()
      table.string('whatsapp_number', 25).nullable()
      table.string('contact_email', 254).nullable()
      table.string('app_store_url', 500).nullable()
      table.string('play_store_url', 500).nullable()
      table
        .integer('logo_media_id')
        .unsigned()
        .nullable()
        .references('media.id')
        .onDelete('RESTRICT')
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('home_content', (table) => {
      table.string('locale', 2).primary()
      table.string('hero_eyebrow', 120).notNullable().defaultTo('WELCOME TO KUWAIT')
      table.string('hero_title', 200).notNullable().defaultTo('Explore Kuwait')
      table.string('discovery_title', 200).notNullable().defaultTo('What would you like to do?')
      table.string('app_title', 200).nullable()
      table.text('app_body').nullable()
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
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('transport_locations', (table) => {
      table.increments('id')
      table.string('code', 100).notNullable().unique()
      table.boolean('pickup_enabled').notNullable().defaultTo(true)
      table.boolean('dropoff_enabled').notNullable().defaultTo(true)
      table.boolean('active').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.decimal('latitude', 10, 7).nullable()
      table.decimal('longitude', 10, 7).nullable()
    })

    this.schema.createTable('transport_location_translations', (table) => {
      table.increments('id')
      table
        .integer('location_id')
        .unsigned()
        .notNullable()
        .references('transport_locations.id')
        .onDelete('CASCADE')
      table.string('locale', 2).notNullable()
      table.string('name', 180).notNullable()
      table.unique(['location_id', 'locale'])
    })

    this.schema.createTable('audit_logs', (table) => {
      table.bigIncrements('id')
      table.integer('actor_id').unsigned().nullable().references('users.id').onDelete('SET NULL')
      table.string('action', 80).notNullable()
      table.string('entity_type', 80).notNullable()
      table.string('entity_id', 80).nullable()
      table.json('changed_fields').nullable()
      table.string('request_id', 80).nullable()
      table.timestamp('created_at').notNullable()
      table.index(['entity_type', 'entity_id'])
      table.index(['created_at'])
    })
  }

  async down() {
    for (const table of [
      'audit_logs',
      'transport_location_translations',
      'transport_locations',
      'home_content',
      'site_settings',
      'page_translations',
      'pages',
      'place_media',
      'place_hours',
      'place_translations',
      'places',
      'category_translations',
      'categories',
      'media',
    ]) {
      this.schema.dropTable(table)
    }
  }
}
