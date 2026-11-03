import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      const duplicates = await db
        .from('customers')
        .whereNotNull('email')
        .groupBy('email')
        .havingRaw('COUNT(*) > 1')
        .select('email')
        .count('* as total')
      if (duplicates.length > 0) {
        const list = duplicates.map((row) => `${row.email} (${row.total})`).join(', ')
        throw new Error(
          `Cannot make customer emails unique: resolve duplicates first (clear or change the email on all but one account): ${list}`
        )
      }
      // Blank strings would collide with each other; treat them as "no email".
      await db.from('customers').where('email', '').update({ email: null })
      await db.schema.alterTable('customers', (table) => {
        table.unique(['email'], 'customers_email_unique')
      })
    })
  }

  async down() {
    this.schema.alterTable('customers', (table) => {
      table.dropUnique(['email'], 'customers_email_unique')
    })
  }
}
