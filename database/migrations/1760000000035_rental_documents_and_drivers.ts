import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Provider legal documents (any label plus a PDF/JPG/PNG file, kept for staff only) and
 * provider drivers, who are assigned to with-driver bookings.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('rental_provider_documents', (table) => {
      table.increments('id')
      table
        .integer('provider_id')
        .unsigned()
        .notNullable()
        .references('rental_providers.id')
        .onDelete('CASCADE')
      table.string('label', 160).notNullable()
      table.string('storage_key', 120).notNullable().unique()
      table.string('original_name', 255).notNullable()
      table.string('mime_type', 60).notNullable()
      table.integer('size_bytes').unsigned().notNullable()
      table.integer('uploaded_by').unsigned().nullable().references('users.id').onDelete('SET NULL')
      table.timestamp('created_at').notNullable()
      table.index(['provider_id', 'id'])
    })

    this.schema.createTable('rental_drivers', (table) => {
      table.increments('id')
      table
        .integer('provider_id')
        .unsigned()
        .notNullable()
        .references('rental_providers.id')
        .onDelete('CASCADE')
      table.string('name', 120).notNullable()
      table.string('phone_e164', 16).nullable()
      table.string('photo_image_key', 120).nullable().unique()
      table.boolean('active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['provider_id', 'active'])
    })

    this.schema.alterTable('rental_bookings', (table) => {
      // A driver with bookings cannot be deleted; it is deactivated instead.
      table
        .integer('driver_id')
        .unsigned()
        .nullable()
        .references('rental_drivers.id')
        .onDelete('RESTRICT')
      table.timestamp('driver_assigned_at').nullable()
      table.index(['driver_id', 'pickup_at'])
    })
  }

  async down() {
    this.schema.alterTable('rental_bookings', (table) => {
      table.dropForeign(['driver_id'])
      table.dropIndex(['driver_id', 'pickup_at'])
      table.dropColumn('driver_id')
      table.dropColumn('driver_assigned_at')
    })
    this.schema.dropTable('rental_drivers')
    this.schema.dropTable('rental_provider_documents')
  }
}
