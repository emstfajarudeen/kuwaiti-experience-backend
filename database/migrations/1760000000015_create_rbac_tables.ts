import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('roles', (table) => {
      table.increments('id').notNullable()
      table.string('slug', 80).notNullable().unique()
      table.string('name', 120).notNullable()
      table.string('description', 500).nullable()
      table.boolean('is_system').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('permissions', (table) => {
      table.increments('id').notNullable()
      table.string('key', 120).notNullable().unique()
      table.string('module', 80).notNullable()
      table.string('action', 80).notNullable()
      table.string('label', 160).notNullable()
      table.string('description', 500).nullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['module', 'is_active'])
    })

    this.schema.createTable('role_permissions', (table) => {
      table.integer('role_id').unsigned().notNullable().references('roles.id').onDelete('CASCADE')
      table
        .integer('permission_id')
        .unsigned()
        .notNullable()
        .references('permissions.id')
        .onDelete('CASCADE')
      table.primary(['role_id', 'permission_id'])
      table.index(['permission_id', 'role_id'])
    })

    this.schema.createTable('user_roles', (table) => {
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.integer('role_id').unsigned().notNullable().references('roles.id').onDelete('RESTRICT')
      table.timestamp('created_at').notNullable()
      table.primary(['user_id', 'role_id'])
      table.index(['role_id', 'user_id'])
    })

    this.schema.createTable('rbac_state', (table) => {
      table.integer('id').unsigned().primary().notNullable()
      table.timestamp('initialized_at').nullable()
      table.timestamp('defaults_initialized_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
    this.defer(async (db) => {
      await db.table('rbac_state').insert({ id: 1, created_at: new Date() })
    })
  }

  async down() {
    this.schema.dropTable('rbac_state')
    this.schema.dropTable('user_roles')
    this.schema.dropTable('role_permissions')
    this.schema.dropTable('permissions')
    this.schema.dropTable('roles')
  }
}
