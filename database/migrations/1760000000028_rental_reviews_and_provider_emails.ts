import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Customer reviews of completed rentals, and a log of booking emails sent to rental providers.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('rental_reviews', (table) => {
      table.increments('id')
      table
        .integer('booking_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('rental_bookings.id')
        .onDelete('CASCADE')
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table
        .integer('vehicle_id')
        .unsigned()
        .notNullable()
        .references('rental_vehicles.id')
        .onDelete('CASCADE')
      table
        .integer('provider_id')
        .unsigned()
        .notNullable()
        .references('rental_providers.id')
        .onDelete('CASCADE')
      table.tinyint('rating').unsigned().notNullable()
      table.text('comment').nullable()
      table.string('status', 16).notNullable().defaultTo('published')
      table.timestamp('hidden_at').nullable()
      table.integer('hidden_by').unsigned().nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['vehicle_id', 'status', 'id'])
      table.index(['provider_id', 'status', 'id'])
      table.index(['status', 'id'])
    })

    this.schema.createTable('rental_provider_emails', (table) => {
      table.increments('id')
      table
        .integer('booking_id')
        .unsigned()
        .notNullable()
        .references('rental_bookings.id')
        .onDelete('CASCADE')
      table.string('kind', 16).notNullable()
      table.string('recipient', 254).nullable()
      table.string('status', 16).notNullable()
      table.string('message_id', 120).nullable()
      table.string('error', 500).nullable()
      table.integer('sent_by').unsigned().nullable()
      table.timestamp('created_at').notNullable()
      table.index(['booking_id', 'id'])
    })
  }

  async down() {
    this.schema.dropTable('rental_provider_emails')
    this.schema.dropTable('rental_reviews')
  }
}
