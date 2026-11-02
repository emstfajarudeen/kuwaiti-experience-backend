import { BaseSchema } from '@adonisjs/lucid/schema'

const permissions = [
  { key: 'notifications.view', action: 'view', label: 'View notifications' },
  { key: 'notifications.send', action: 'send', label: 'Send notifications' },
] as const

export default class extends BaseSchema {
  async up() {
    if (!(await this.schema.hasTable('notification_broadcasts')))
      this.schema.createTable('notification_broadcasts', (table) => {
        table.increments('id')
        // Client-generated idempotency key: a double click or a retried POST can
        // never queue the same broadcast twice.
        table.string('request_key', 64).notNullable().unique()
        table.string('title', 160).notNullable()
        table.string('body', 1000).notNullable()
        table.enum('audience', ['all', 'ios', 'android', 'customer']).notNullable()
        table
          .integer('customer_id')
          .unsigned()
          .nullable()
          .references('customers.id')
          .onDelete('SET NULL')
        table
          .enum('status', ['queued', 'processing', 'completed', 'failed'])
          .notNullable()
          .defaultTo('queued')
        // Fan-out resumes from this customer id after a crash or restart.
        table.integer('cursor_customer_id').unsigned().notNullable().defaultTo(0)
        table.integer('recipient_count').unsigned().notNullable().defaultTo(0)
        table.integer('push_count').unsigned().notNullable().defaultTo(0)
        table
          .integer('created_by')
          .unsigned()
          .nullable()
          .references('users.id')
          .onDelete('SET NULL')
        table.timestamp('created_at').notNullable()
        table.timestamp('locked_at').nullable()
        table.timestamp('completed_at').nullable()
        table.string('last_error', 1000).nullable()
        table.index(['status', 'locked_at', 'id'], 'nb_status_locked_id_index')
        table.index(['created_at', 'id'], 'nb_created_id_index')
      })

    if (!(await this.schema.hasColumn('customer_notifications', 'broadcast_id')))
      this.schema.alterTable('customer_notifications', (table) => {
        table
          .integer('broadcast_id')
          .unsigned()
          .nullable()
          .references('notification_broadcasts.id')
          .onDelete('SET NULL')
        // One inbox row per customer per broadcast makes fan-out idempotent.
        table.unique(['broadcast_id', 'customer_id'], 'cn_broadcast_customer_unique')
      })

    this.defer(async (db) => {
      const indexes = await db
        .from('information_schema.statistics')
        .whereRaw('table_schema = DATABASE()')
        .where('table_name', 'customer_notification_outbox')
        .select('index_name')
      if (!indexes.some((row) => row.index_name === 'cno_pending_index')) {
        // Keeps the "pending deliveries" health check an index range scan.
        await db.schema.alterTable('customer_notification_outbox', (table) => {
          table.index(['delivered_at', 'failed_at', 'available_at'], 'cno_pending_index')
        })
      }

      // Register the new permissions right away so the Administrator role can open
      // the page without waiting for a separate `permissions:sync` run. Values must
      // match permission_catalog.ts exactly so the next sync is a no-op.
      for (const permission of permissions) {
        const existing = await db.from('permissions').where('key', permission.key).first()
        if (existing) continue
        await db.table('permissions').insert({
          key: permission.key,
          module: 'notifications',
          action: permission.action,
          label: permission.label,
          description: `Allows ${permission.label.toLowerCase()} in the CMS.`,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      await db
        .from('permissions')
        .whereIn(
          'key',
          permissions.map(({ key }) => key)
        )
        .delete()
    })
    this.schema.alterTable('customer_notifications', (table) => {
      // The foreign key leans on the unique index, so it has to go first.
      table.dropForeign(['broadcast_id'])
      table.dropUnique(['broadcast_id', 'customer_id'], 'cn_broadcast_customer_unique')
      table.dropColumn('broadcast_id')
    })
    this.schema.alterTable('customer_notification_outbox', (table) => {
      table.dropIndex(['delivered_at', 'failed_at', 'available_at'], 'cno_pending_index')
    })
    this.schema.dropTable('notification_broadcasts')
  }
}
