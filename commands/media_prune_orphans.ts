import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import env from '#start/env'

export default class MediaPruneOrphans extends BaseCommand {
  static commandName = 'media:prune-orphans'
  static description = 'Find or remove locally stored images without a media row'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Delete orphaned files after listing them' })
  declare delete: boolean

  async run() {
    const root = app.makePath(
      env.get('NODE_ENV') === 'test' ? 'storage/test-uploads' : 'storage/uploads'
    )
    const media = await db.from('media').select('storage_key')
    const known = new Set(media.map((row) => row.storage_key))
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
    const orphans = files.filter(
      (key) =>
        !known.has(key) &&
        (/^[0-9a-f-]{36}\.webp$/.test(key) || /^demo\/[a-z0-9-]+\.webp$/.test(key))
    )
    this.logger.info(`${orphans.length} managed orphaned image(s) found`)
    for (const key of orphans) {
      this.logger.info(key)
      if (this.delete) await drive.use('local').delete(key)
    }
  }
}
