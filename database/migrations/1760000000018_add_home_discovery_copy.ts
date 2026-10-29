import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'home_content'

  async up() {
    const addEyebrow = !(await this.schema.hasColumn(this.tableName, 'discovery_eyebrow'))
    const addDescription = !(await this.schema.hasColumn(this.tableName, 'discovery_description'))
    if (addEyebrow || addDescription) {
      this.schema.alterTable(this.tableName, (table) => {
        if (addEyebrow) table.string('discovery_eyebrow', 120).nullable()
        if (addDescription) table.text('discovery_description').nullable()
      })
    }
  }

  async down() {
    const dropEyebrow = await this.schema.hasColumn(this.tableName, 'discovery_eyebrow')
    const dropDescription = await this.schema.hasColumn(this.tableName, 'discovery_description')
    if (dropEyebrow || dropDescription) {
      this.schema.alterTable(this.tableName, (table) => {
        if (dropDescription) table.dropColumn('discovery_description')
        if (dropEyebrow) table.dropColumn('discovery_eyebrow')
      })
    }
  }
}
