import { BaseSchema } from '@adonisjs/lucid/schema'

const tables = ['notification_broadcasts', 'customer_notifications'] as const

/** Optional Arabic title and message, stored next to the English ones and sent together. */
export default class extends BaseSchema {
  async up() {
    for (const tableName of tables) {
      const hasTitle = await this.schema.hasColumn(tableName, 'title_ar')
      const hasBody = await this.schema.hasColumn(tableName, 'body_ar')
      if (hasTitle && hasBody) continue
      this.schema.alterTable(tableName, (table) => {
        if (!hasTitle) table.string('title_ar', 160).nullable()
        if (!hasBody) table.string('body_ar', 1000).nullable()
      })
    }
  }

  async down() {
    for (const tableName of tables) {
      this.schema.alterTable(tableName, (table) => {
        table.dropColumn('title_ar')
        table.dropColumn('body_ar')
      })
    }
  }
}
