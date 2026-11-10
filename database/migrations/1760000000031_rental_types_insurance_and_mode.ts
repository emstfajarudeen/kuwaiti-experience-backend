import { BaseSchema } from '@adonisjs/lucid/schema'

const TYPES = [
  ['sedan', 'Sedan', 'سيدان'],
  ['suv', 'SUV', 'دفع رباعي'],
  ['hatchback', 'Hatchback', 'هاتشباك'],
  ['luxury', 'Luxury', 'فاخرة'],
  ['sports', 'Sports', 'رياضية'],
  ['van', 'Van', 'فان'],
  ['pickup', 'Pickup', 'بيك أب'],
] as const

/**
 * Vehicle types and insurance options become lists managed in the CMS, and vehicles say whether
 * they can be rented self-drive, with a driver, or both.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('rental_vehicle_types', (table) => {
      table.increments('id')
      table.string('code', 60).notNullable().unique()
      table.string('name_en', 80).notNullable()
      table.string('name_ar', 80).nullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
    })

    this.schema.createTable('rental_insurance_options', (table) => {
      table.increments('id')
      table.string('name_en', 120).notNullable()
      table.string('name_ar', 120).nullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
    })

    this.schema.alterTable('rental_vehicles', (table) => {
      table
        .integer('insurance_option_id')
        .unsigned()
        .nullable()
        .references('rental_insurance_options.id')
        .onDelete('SET NULL')
      table.boolean('self_drive_available').notNullable().defaultTo(true)
    })

    this.defer(async (db) => {
      const now = new Date()
      await db.table('rental_vehicle_types').multiInsert(
        TYPES.map(([code, nameEn, nameAr], index) => ({
          code,
          name_en: nameEn,
          name_ar: nameAr,
          sort_order: index,
          created_at: now,
        }))
      )
      const [comprehensive] = await db.table('rental_insurance_options').insert({
        name_en: 'Comprehensive (full cover)',
        name_ar: 'تأمين شامل',
        sort_order: 0,
        created_at: now,
      })
      const [thirdParty] = await db.table('rental_insurance_options').insert({
        name_en: 'Third party',
        name_ar: 'تأمين ضد الغير',
        sort_order: 1,
        created_at: now,
      })
      const vehicles = await db.from('rental_vehicles').select('id', 'insurance_en')
      for (const vehicle of vehicles) {
        const text = String(vehicle.insurance_en ?? '').toLowerCase()
        const option = /third/.test(text)
          ? thirdParty
          : /comprehensive|full/.test(text)
            ? comprehensive
            : null
        if (option)
          await db
            .from('rental_vehicles')
            .where('id', vehicle.id)
            .update({ insurance_option_id: option })
      }
    })

    this.schema.alterTable('rental_vehicles', (table) => {
      table.dropColumns('insurance_en', 'insurance_ar')
    })
  }

  async down() {
    this.schema.alterTable('rental_vehicles', (table) => {
      table.text('insurance_en').nullable()
      table.text('insurance_ar').nullable()
    })
    this.defer(async (db) => {
      const options = await db.from('rental_insurance_options')
      for (const option of options)
        await db
          .from('rental_vehicles')
          .where('insurance_option_id', option.id)
          .update({ insurance_en: option.name_en, insurance_ar: option.name_ar })
    })
    this.schema.alterTable('rental_vehicles', (table) => {
      table.dropForeign(['insurance_option_id'])
      table.dropColumns('insurance_option_id', 'self_drive_available')
    })
    this.schema.dropTable('rental_insurance_options')
    this.schema.dropTable('rental_vehicle_types')
  }
}
