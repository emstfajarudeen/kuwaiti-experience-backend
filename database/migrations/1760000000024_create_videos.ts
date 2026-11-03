import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('videos', (table) => {
      table.increments('id')
      table.string('caption_en', 1000).notNullable()
      table.string('caption_ar', 1000).nullable()
      table.string('video_key', 80).notNullable().unique()
      table.string('thumbnail_key', 80).nullable().unique()
      table.integer('size_bytes').unsigned().notNullable().defaultTo(0)
      table.string('status', 16).notNullable().defaultTo('draft')
      table.timestamp('published_at').nullable()
      // Both optional: a video without a business is shown as the platform itself.
      table
        .integer('category_id')
        .unsigned()
        .nullable()
        .references('categories.id')
        .onDelete('SET NULL')
      table.integer('place_id').unsigned().nullable().references('places.id').onDelete('SET NULL')
      table.string('phone_e164', 16).nullable()
      table.string('location_name_en', 200).nullable()
      table.string('location_name_ar', 200).nullable()
      table.decimal('latitude', 10, 7).nullable()
      table.decimal('longitude', 10, 7).nullable()
      table.integer('like_count').unsigned().notNullable().defaultTo(0)
      table.integer('comment_count').unsigned().notNullable().defaultTo(0)
      table.integer('share_count').unsigned().notNullable().defaultTo(0)
      table.integer('save_count').unsigned().notNullable().defaultTo(0)
      table.integer('created_by').unsigned().nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['status', 'published_at', 'id'])
      table.index(['category_id', 'status'])
      table.index(['place_id', 'status'])
    })

    this.schema.createTable('video_likes', (table) => {
      table.integer('video_id').unsigned().notNullable().references('videos.id').onDelete('CASCADE')
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.primary(['video_id', 'customer_id'])
      table.index(['customer_id'])
    })

    this.schema.createTable('video_saves', (table) => {
      table.integer('video_id').unsigned().notNullable().references('videos.id').onDelete('CASCADE')
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.primary(['video_id', 'customer_id'])
      table.index(['customer_id', 'created_at'])
    })

    this.schema.createTable('video_comments', (table) => {
      table.increments('id')
      table.integer('video_id').unsigned().notNullable().references('videos.id').onDelete('CASCADE')
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table.string('body', 500).notNullable()
      table.string('status', 16).notNullable().defaultTo('visible')
      table.integer('like_count').unsigned().notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.index(['video_id', 'status', 'id'])
    })

    this.schema.createTable('video_comment_likes', (table) => {
      table
        .integer('comment_id')
        .unsigned()
        .notNullable()
        .references('video_comments.id')
        .onDelete('CASCADE')
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.primary(['comment_id', 'customer_id'])
    })

    this.schema.createTable('video_reports', (table) => {
      table.increments('id')
      table.integer('video_id').unsigned().notNullable().references('videos.id').onDelete('CASCADE')
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table.string('reason', 32).notNullable()
      table.string('note', 500).nullable()
      table.string('status', 16).notNullable().defaultTo('open')
      table.timestamp('created_at').notNullable()
      table.timestamp('reviewed_at').nullable()
      table.unique(['video_id', 'customer_id'])
      table.index(['status', 'id'])
    })
  }

  async down() {
    this.schema.dropTable('video_reports')
    this.schema.dropTable('video_comment_likes')
    this.schema.dropTable('video_comments')
    this.schema.dropTable('video_saves')
    this.schema.dropTable('video_likes')
    this.schema.dropTable('videos')
  }
}
