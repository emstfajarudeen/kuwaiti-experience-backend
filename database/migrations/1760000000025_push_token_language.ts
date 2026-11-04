import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The app language of each device. It lives on the push token (not the customer) because
 * one account can be signed in on two phones that use different app languages.
 */
export default class extends BaseSchema {
  async up() {
    if (!(await this.schema.hasColumn('customer_push_tokens', 'language')))
      this.schema.alterTable('customer_push_tokens', (table) => {
        table.string('language', 2).notNullable().defaultTo('en')
      })
  }

  async down() {
    this.schema.alterTable('customer_push_tokens', (table) => {
      table.dropColumn('language')
    })
  }
}
