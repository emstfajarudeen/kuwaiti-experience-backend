import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('full_name', 120).notNullable()
      table.string('email', 254).notNullable().unique()
      table.string('password').notNullable()
      table.string('role', 24).notNullable().defaultTo('admin')
      table.boolean('active').notNullable().defaultTo(true)
      table.boolean('must_change_password').notNullable().defaultTo(false)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
