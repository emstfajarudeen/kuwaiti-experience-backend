import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Uploaded videos are converted to an app-friendly MP4 in the background.
 * `source_key` holds the original upload until the conversion has replaced `video_key`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('videos', (table) => {
      table.string('video_key', 80).nullable().alter()
      table.string('source_key', 80).nullable().unique('videos_source_key_unique')
      // ready | pending | processing | failed
      table.string('processing_status', 16).notNullable().defaultTo('ready')
      table.string('processing_error', 500).nullable()
      table.timestamp('processing_started_at').nullable()
      table.tinyint('processing_attempts').unsigned().notNullable().defaultTo(0)
      table.integer('width').unsigned().nullable()
      table.integer('height').unsigned().nullable()
      table.integer('duration_ms').unsigned().nullable()
      table.index(['processing_status', 'id'], 'videos_processing_idx')
    })
  }

  async down() {
    this.schema.alterTable('videos', (table) => {
      table.dropIndex(['processing_status', 'id'], 'videos_processing_idx')
      table.dropUnique(['source_key'], 'videos_source_key_unique')
      table.dropColumn('source_key')
      table.dropColumn('processing_status')
      table.dropColumn('processing_error')
      table.dropColumn('processing_started_at')
      table.dropColumn('processing_attempts')
      table.dropColumn('width')
      table.dropColumn('height')
      table.dropColumn('duration_ms')
    })
    this.defer(async (client) => {
      await client.from('videos').whereNull('video_key').delete()
    })
    this.schema.alterTable('videos', (table) => {
      table.string('video_key', 80).notNullable().alter()
    })
  }
}
