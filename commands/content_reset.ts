import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import env from '#start/env'

const tables = [
  'audit_logs',
  'place_media',
  'place_hours',
  'place_translations',
  'places',
  'category_translations',
  'categories',
  'category_types',
  'page_translations',
  'pages',
  'home_content',
  'site_settings',
  'transport_location_translations',
  'transport_locations',
  'refresh_tokens',
  'auth_sessions',
  'media',
  'rate_limits',
] as const

export default class ContentReset extends BaseCommand {
  static commandName = 'content:reset'
  static description = 'Clear project content while preserving admin credentials'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Show what would be removed without changing data' })
  declare dryRun: boolean

  @flags.string({ description: 'Exact database name required to perform the reset' })
  declare confirm?: string

  @flags.boolean({ description: 'Required in production in addition to --confirm' })
  declare forceProduction: boolean

  async run() {
    const database = env.get('DB_DATABASE')
    if (!/^kuwaitiexperience_(dev|test|staging|production)$/.test(database)) {
      throw new Error(`Refusing reset on unexpected database name: ${database}`)
    }
    const counts: Record<string, number> = {}
    for (const table of tables) {
      const result = await db.from(table).count('* as count').first()
      counts[table] = Number(result?.count ?? 0)
    }
    const admins = await db.from('users').where('role', 'admin').select('id', 'email')
    const nonAdmin = await db.from('users').whereNot('role', 'admin').count('* as count').first()
    counts.non_admin_users = Number(nonAdmin?.count ?? 0)
    this.logger.info(`Database: ${database}`)
    this.logger.info(`Preserved admin IDs: ${admins.map((a) => a.id).join(', ') || '(none)'}`)
    for (const [table, count] of Object.entries(counts)) this.logger.info(`${table}: ${count}`)

    if (this.dryRun || !this.confirm) {
      this.logger.info(`Dry run. Execute with --confirm=${database} to clear content.`)
      return
    }
    if (this.confirm !== database) throw new Error('Confirmation must exactly match DB_DATABASE')
    if (env.get('NODE_ENV') === 'production' && !this.forceProduction) {
      throw new Error('Production reset also requires --force-production and a verified backup')
    }

    const media = await db.from('media').select('storage_key')
    await db.transaction(async (trx) => {
      for (const table of tables) await trx.from(table).delete()
      await trx.from('users').whereNot('role', 'admin').delete()
    })
    let failedFiles = 0
    for (const item of media) {
      try {
        await drive.use('local').delete(item.storage_key)
      } catch {
        failedFiles++
      }
    }
    this.logger.success(
      `Content removed. ${admins.length} admin credential(s) preserved; all sessions revoked.`
    )
    if (failedFiles) {
      this.logger.warning(
        `${failedFiles} upload file(s) could not be deleted. Run media:prune-orphans.`
      )
      this.exitCode = 1
    }
  }
}
