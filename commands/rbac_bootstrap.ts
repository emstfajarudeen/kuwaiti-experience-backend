import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { bootstrapRbac } from '../app/services/rbac_bootstrap_service.js'

export default class RbacBootstrap extends BaseCommand {
  static commandName = 'rbac:bootstrap'
  static description = 'Assign the initial Super Admin and migrate existing admin accounts'
  static options: CommandOptions = { startApp: true }

  @flags.string({
    description: 'Email of the existing active CMS administrator to make Super Admin',
  })
  declare email?: string

  async run() {
    if (!this.email)
      throw new Error('Provide the owner explicitly with --email <administrator email>')
    const result = await bootstrapRbac(this.email)
    this.logger.success(
      `RBAC initialized for ${result.ownerEmail}; migrated ${result.migratedAdmins} administrator accounts.`
    )
  }
}
