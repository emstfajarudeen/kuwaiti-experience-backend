import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { syncPermissions } from '../../app/services/permission_sync_service.js'
import logger from '@adonisjs/core/services/logger'

export default class PermissionSeeder extends BaseSeeder {
  async run() {
    const result = await syncPermissions()
    logger.info(result, 'RBAC permissions synchronized')
  }
}
