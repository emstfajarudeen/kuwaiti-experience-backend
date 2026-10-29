import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('countries', (table) => {
      table.string('code', 2).primary()
      table.string('name_en', 160).notNullable()
      table.string('name_ar', 160).nullable()
      table.boolean('active').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.index(['active', 'sort_order', 'name_en'])
    })
    this.defer(async () => {
      await this.db.table('countries').insert({
        code: 'KW',
        name_en: 'Kuwait',
        name_ar: 'الكويت',
        active: true,
        sort_order: 0,
        created_at: new Date(),
      })
      for (const action of ['view', 'create', 'update', 'delete']) {
        const key = `countries.${action}`
        if (await this.db.from('permissions').where('key', key).first()) continue
        await this.db.table('permissions').insert({
          key,
          module: 'countries',
          action,
          label: `${action[0].toUpperCase()}${action.slice(1)} countries`,
          description: `Allows ${action} countries in the CMS.`,
          is_active: true,
          created_at: new Date(),
        })
      }
    })
  }

  async down() {
    this.schema.dropTable('countries')
    this.defer(async () => {
      await this.db.from('permissions').where('module', 'countries').delete()
    })
  }
}
