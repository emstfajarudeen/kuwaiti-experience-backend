import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    if (!(await this.schema.hasTable('customer_push_tokens')))
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

    if (!(await this.schema.hasTable('customer_notifications')))
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

    const outboxExists = await this.schema.hasTable('customer_notification_outbox')
    if (!outboxExists)
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
        table.integer('attempts').unsigned().notNullable().defaultTo(0)
        table.timestamp('available_at').notNullable()
        table.timestamp('locked_at').nullable()
        table.timestamp('delivered_at').nullable()
        table.timestamp('failed_at').nullable()
        table.string('last_error', 1000).nullable()
        table.unique(['notification_id', 'push_token_id'], 'cno_notification_token_unique')
        table.index(['available_at', 'locked_at', 'id'], 'cno_available_locked_id_index')
      })
    else
      this.defer(async (db) => {
        const indexes = await db
          .from('information_schema.statistics')
          .whereRaw('table_schema = DATABASE()')
          .where('table_name', 'customer_notification_outbox')
          .select('index_name')
        const names = new Set(indexes.map((row) => row.index_name))
        if (!names.has('cno_notification_token_unique')) {
          await db.schema.alterTable('customer_notification_outbox', (table) => {
            table.unique(['notification_id', 'push_token_id'], 'cno_notification_token_unique')
          })
        }
        if (!names.has('cno_available_locked_id_index')) {
          await db.schema.alterTable('customer_notification_outbox', (table) => {
            table.index(['available_at', 'locked_at', 'id'], 'cno_available_locked_id_index')
          })
        }
      })
  }

  async down() {
    this.schema.dropTable('customer_notification_outbox')
    this.schema.dropTable('customer_notifications')
    this.schema.dropTable('customer_push_tokens')
  }
}
