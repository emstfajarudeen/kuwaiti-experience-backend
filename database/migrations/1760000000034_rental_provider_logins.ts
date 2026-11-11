import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Provider portal logins. A provider login is a `users` row with role 'provider' that is
 * tied to one rental provider; it signs in to the CMS and only sees that provider's data.
 * Invites reuse the password-reset tokens, marked with a purpose so the page can say
 * "Set your password" instead of "Reset your password".
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('users', (table) => {
      table
        .integer('rental_provider_id')
        .unsigned()
        .nullable()
        .references('rental_providers.id')
        .onDelete('CASCADE')
      table.timestamp('last_login_at').nullable()
      table.timestamp('password_set_at').nullable()
      table.index(['rental_provider_id'])
    })
    this.schema.alterTable('admin_password_reset_tokens', (table) => {
      table.string('purpose', 16).notNullable().defaultTo('reset')
    })
  }

  async down() {
    this.schema.alterTable('admin_password_reset_tokens', (table) => {
      table.dropColumn('purpose')
    })
    this.schema.alterTable('users', (table) => {
      table.dropForeign(['rental_provider_id'])
      table.dropIndex(['rental_provider_id'])
      table.dropColumn('rental_provider_id')
      table.dropColumn('last_login_at')
      table.dropColumn('password_set_at')
    })
  }
}
