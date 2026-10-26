import db from '@adonisjs/lucid/services/db'
import { loginAdmin as loginWithCredentials } from '../../app/services/auth_service.js'
import { syncPermissions } from '../../app/services/permission_sync_service.js'
import { bootstrapRbac } from '../../app/services/rbac_bootstrap_service.js'

export { authenticateAdmin } from '../../app/services/auth_service.js'

/** Give legacy functional fixtures the same RBAC setup as a bootstrapped installation. */
export async function prepareAdminAuthorization(email: string) {
  let state = await db.from('rbac_state').where('id', 1).first()
  if (!state) {
    await db.table('rbac_state').insert({ id: 1, created_at: new Date() })
    state = await db.from('rbac_state').where('id', 1).first()
  }
  if (!state?.defaults_initialized_at) await syncPermissions()

  const initialized = await db.from('rbac_state').where('id', 1).first()
  if (!initialized?.initialized_at) {
    await bootstrapRbac(email)
    return
  }

  const user = await db.from('users').where('email', email.trim().toLowerCase()).first()
  if (!user) throw new Error(`Test administrator ${email} was not created`)
  const membership = await db.from('user_roles').where('user_id', user.id).first()
  if (membership) return

  const administrator = await db.from('roles').where('slug', 'administrator').first()
  if (!administrator) throw new Error('Test administrator role is missing')
  await db.table('user_roles').insert({
    user_id: user.id,
    role_id: administrator.id,
    created_at: new Date(),
  })
}

export async function loginAdmin(email: string, password: string) {
  await prepareAdminAuthorization(email)
  return loginWithCredentials(email, password)
}
