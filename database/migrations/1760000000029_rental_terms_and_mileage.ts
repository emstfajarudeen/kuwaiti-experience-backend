import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Rental terms become an ordered list of short labels managed per vehicle. Minimum age, deposit
 * and the free-text terms move into that list, and vehicles gain an extra-km rate for the mileage
 * card. Existing values are copied into terms before their columns are dropped.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('rental_vehicle_terms', (table) => {
      table.increments('id')
      table
        .integer('vehicle_id')
        .unsigned()
        .notNullable()
        .references('rental_vehicles.id')
        .onDelete('CASCADE')
      table.text('label_en').notNullable()
      table.text('label_ar').nullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.index(['vehicle_id', 'sort_order'])
    })

    this.schema.alterTable('rental_vehicles', (table) => {
      table.decimal('extra_km_rate', 10, 3).nullable()
    })

    this.defer(async (db) => {
      const vehicles = await db
        .from('rental_vehicles')
        .select('id', 'min_driver_age', 'deposit_amount', 'terms_en', 'terms_ar')
      const now = new Date()
      for (const vehicle of vehicles) {
        const rows: Array<{ label_en: string; label_ar: string | null }> = []
        if (vehicle.min_driver_age)
          rows.push({
            label_en: `${vehicle.min_driver_age}+ age`,
            label_ar: `العمر ${vehicle.min_driver_age}+`,
          })
        const deposit = Number(vehicle.deposit_amount ?? 0)
        if (deposit > 0) {
          const amount = Number.isInteger(deposit) ? String(deposit) : deposit.toFixed(3)
          rows.push({ label_en: `KD ${amount} deposit`, label_ar: `تأمين ${amount} د.ك` })
        }
        if (vehicle.terms_en?.trim())
          rows.push({
            label_en: vehicle.terms_en.trim(),
            label_ar: vehicle.terms_ar?.trim() || null,
          })
        if (rows.length)
          await db.table('rental_vehicle_terms').multiInsert(
            rows.map((row, index) => ({
              vehicle_id: vehicle.id,
              ...row,
              sort_order: index,
              created_at: now,
            }))
          )
      }
    })

    this.schema.alterTable('rental_vehicles', (table) => {
      table.dropColumns('min_driver_age', 'deposit_amount', 'terms_en', 'terms_ar')
    })
    this.schema.alterTable('rental_bookings', (table) => {
      table.dropColumn('deposit_amount')
    })
  }

  async down() {
    this.schema.alterTable('rental_bookings', (table) => {
      table.decimal('deposit_amount', 10, 3).notNullable().defaultTo(0)
    })
    this.schema.alterTable('rental_vehicles', (table) => {
      table.decimal('deposit_amount', 10, 3).notNullable().defaultTo(0)
      table.tinyint('min_driver_age').unsigned().notNullable().defaultTo(21)
      table.text('terms_en').nullable()
      table.text('terms_ar').nullable()
      table.dropColumn('extra_km_rate')
    })
    this.schema.dropTable('rental_vehicle_terms')
  }
}
