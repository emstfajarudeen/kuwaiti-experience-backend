import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import env from '#start/env'
import { allImageKeys } from '#services/image_reference_service'
import { isManagedImageKey } from '#services/image_storage_service'

/** Files younger than this may belong to an upload whose transaction is still running. */
const GRACE_PERIOD_MS = 60 * 60 * 1000

export default class ImagesPruneOrphans extends BaseCommand {
  static commandName = 'images:prune-orphans'
  static description = 'Find or remove stored images that no record owns'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Delete orphaned files after listing them' })
  declare delete: boolean

  async run() {
    const root = app.makePath(
      env.get('NODE_ENV') === 'test' ? 'storage/test-uploads' : 'storage/uploads'
    )
    const known = await allImageKeys()
    const profiles = await db
      .from('customers')
      .whereNotNull('profile_photo_id')
      .select('profile_photo_id')
    for (const profile of profiles) known.add(`customer-profiles/${profile.profile_photo_id}.webp`)
    const files: string[] = []
    async function walk(path: string, prefix = ''): Promise<void> {
      for (const item of await readdir(path, { withFileTypes: true })) {
        const key = prefix ? `${prefix}/${item.name}` : item.name
        if (item.isDirectory()) await walk(join(path, item.name), key)
        else if (item.isFile()) files.push(key)
      }
    }
    try {
      await walk(root)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const orphans: string[] = []
    for (const key of files) {
      const managed = isManagedImageKey(key) || /^customer-profiles\/[0-9a-f-]{36}\.webp$/.test(key)
      if (!managed || known.has(key)) continue
      const file = await stat(join(root, key))
      // Never remove a file while an upload transaction may still attach it.
      if (Date.now() - file.mtimeMs > GRACE_PERIOD_MS) orphans.push(key)
    }
    this.logger.info(`${orphans.length} managed orphaned image(s) found`)
    for (const key of orphans) {
      this.logger.info(key)
      if (this.delete) await drive.use('local').delete(key)
    }
  }
}
