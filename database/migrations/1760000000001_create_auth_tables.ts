import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('auth_sessions', (table) => {
      table.uuid('id').primary()
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.timestamp('expires_at').notNullable()
      table.timestamp('revoked_at').nullable()
      table.timestamp('created_at').notNullable()
      table.index(['user_id', 'revoked_at'])
      table.index('expires_at')
    })

    this.schema.createTable('refresh_tokens', (table) => {
      table.uuid('id').primary()
      table.uuid('session_id').notNullable().references('auth_sessions.id').onDelete('CASCADE')
      table.string('token_hash', 64).notNullable().unique()
      table.timestamp('expires_at').notNullable()
      table.timestamp('consumed_at').nullable()
      table.timestamp('created_at').notNullable()
      table.index(['session_id', 'consumed_at'])
    })
  }

  async down() {
    this.schema.dropTable('refresh_tokens')
    this.schema.dropTable('auth_sessions')
  }
}
