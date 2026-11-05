import { BaseSchema } from '@adonisjs/lucid/schema'

/** Working hours were removed from the product, so the weekly schedule table is dropped. */
export default class extends BaseSchema {
  async up() {
    this.schema.dropTableIfExists('place_hours')
  }

  async down() {
    this.schema.createTable('place_hours', (table) => {
      table.increments('id')
      table.integer('place_id').unsigned().notNullable().references('places.id').onDelete('CASCADE')
      table.integer('weekday').unsigned().notNullable()
      table.integer('interval_index').unsigned().notNullable().defaultTo(0)
      table.time('opens_at').nullable()
      table.time('closes_at').nullable()
      table.boolean('closes_next_day').notNullable().defaultTo(false)
      table.boolean('closed').notNullable().defaultTo(false)
      table.unique(['place_id', 'weekday', 'interval_index'])
    })
  }
}
