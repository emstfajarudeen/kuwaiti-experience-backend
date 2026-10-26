import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'

export async function bootstrapRbac(ownerEmailValue: string) {
  const email = ownerEmailValue.trim().toLowerCase()
  if (!email)
    throw new ApiError(422, 'OWNER_REQUIRED', 'Provide the active administrator email to promote')
  return db.transaction(async (trx) => {
    const state = await trx.from('rbac_state').where('id', 1).forUpdate().first()
    if (!state) throw new Error('RBAC state row is missing; apply migrations first')
    if (state.initialized_at)
      throw new ApiError(409, 'ALREADY_INITIALIZED', 'RBAC is already initialized')
    const superRole = await trx.from('roles').where('slug', 'super_admin').first()
    const administratorRole = await trx.from('roles').where('slug', 'administrator').first()
    if (!superRole?.is_system || !administratorRole?.is_system) {
      throw new Error('Run the permission seeder before the RBAC bootstrap command')
    }
    const owner = await trx.from('users').where('email', email).forUpdate().first()
    if (!owner || owner.role !== 'admin' || !owner.active) {
      throw new ApiError(
        422,
        'INVALID_OWNER',
        'The owner must be an existing active CMS administrator'
      )
    }
    const admins = await trx
      .from('users')
      .where('role', 'admin')
      .select('id')
      .orderBy('id')
      .forUpdate()
    const now = new Date()
    for (const user of admins) {
      const roleId = Number(user.id) === Number(owner.id) ? superRole.id : administratorRole.id
      await trx.table('user_roles').insert({ user_id: user.id, role_id: roleId, created_at: now })
    }
    await trx.table('audit_logs').insert({
      actor_id: owner.id,
      action: 'rbac.bootstrapped',
      entity_type: 'rbac',
      entity_id: '1',
      changed_fields: JSON.stringify({
        owner_user_id: owner.id,
        migrated_admin_count: admins.length,
      }),
      created_at: now,
    })
    await trx.from('rbac_state').where('id', 1).update({ initialized_at: now, updated_at: now })
    return { ownerEmail: owner.email, migratedAdmins: admins.length }
  })
}
