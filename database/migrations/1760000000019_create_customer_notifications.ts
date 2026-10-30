import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('customer_push_tokens', (table) => {
      table.increments('id')
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table.text('token').notNullable()
      table.string('token_hash', 64).notNullable().unique()
      table.enum('platform', ['ios', 'android']).notNullable()
      table.string('device_id', 128).nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['customer_id', 'id'])
      table.index(['customer_id', 'device_id'])
    })

    this.schema.createTable('customer_notifications', (table) => {
      table.increments('id')
      table
        .integer('customer_id')
        .unsigned()
        .notNullable()
        .references('customers.id')
        .onDelete('CASCADE')
      table.string('type', 80).notNullable()
      table.string('title', 160).notNullable()
      table.string('body', 1000).notNullable()
      table.json('action_data').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('read_at').nullable()
      table.index(['customer_id', 'id'])
      table.index(['customer_id', 'read_at'])
    })

    this.schema.createTable('customer_notification_outbox', (table) => {
      table.increments('id')
      table
        .integer('notification_id')
        .unsigned()
        .notNullable()
        .references('customer_notifications.id')
        .onDelete('CASCADE')
      table
        .integer('push_token_id')
        .unsigned()
        .notNullable()
        .references('customer_push_tokens.id')
        .onDelete('CASCADE')
      table.unsignedInteger('attempts').notNullable().defaultTo(0)
      table.timestamp('available_at').notNullable()
      table.timestamp('locked_at').nullable()
      table.timestamp('delivered_at').nullable()
      table.timestamp('failed_at').nullable()
      table.string('last_error', 1000).nullable()
      table.unique(['notification_id', 'push_token_id'])
      table.index(['available_at', 'locked_at', 'id'])
    })
  }

  async down() {
    this.schema.dropTable('customer_notification_outbox')
    this.schema.dropTable('customer_notifications')
    this.schema.dropTable('customer_push_tokens')
  }
}
