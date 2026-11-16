import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Registers the rental report permissions so the Administrator role can open the
 * reports right after deploy, without a separate permission sync. Values match
 * permission_catalog.ts exactly so a later sync is a no-op.
 */
const permissions = [
  { key: 'rental_reports.view', action: 'view', label: 'View rental reports' },
  { key: 'rental_reports.export', action: 'export', label: 'Export rental reports' },
] as const

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      for (const permission of permissions) {
        const existing = await db.from('permissions').where('key', permission.key).first()
        if (existing) continue
        await db.table('permissions').insert({
          key: permission.key,
          module: 'rental_reports',
          action: permission.action,
          label: permission.label,
          description: `Allows ${permission.label.toLowerCase()} in the CMS.`,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      await db
        .from('permissions')
        .whereIn(
          'key',
          permissions.map(({ key }) => key)
        )
        .delete()
    })
  }
}
