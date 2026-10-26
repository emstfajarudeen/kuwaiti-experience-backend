import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { defaultRoles } from '../authorization/default_roles.js'
import {
  permissionCatalog,
  validatePermissionCatalog,
} from '../authorization/permission_catalog.js'

async function lockState(trx: TransactionClientContract) {
  const state = await trx.from('rbac_state').where('id', 1).forUpdate().first()
  if (!state) throw new Error('RBAC state row is missing; re-run the RBAC schema migration')
  return state
}

async function seedDefaultRoles(trx: TransactionClientContract) {
  const state = await lockState(trx)
  if (state.defaults_initialized_at) {
    // Administrator is a protected full-access system role. Upgrade an existing
    // preset created by an earlier release during the next explicit sync.
    const administrator = await trx.from('roles').where('slug', 'administrator').first()
    if (administrator && !administrator.is_system) {
      await trx
        .from('roles')
        .where('id', administrator.id)
        .update({ is_system: true, updated_at: new Date() })
    }
    return { created: 0, grants: 0 }
  }
  let created = 0
  let grants = 0

  for (const definition of defaultRoles) {
    let role = await trx.from('roles').where('slug', definition.slug).first()
    if (!role) {
      const [id] = await trx.table('roles').insert({
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
        is_system: 'system' in definition && definition.system,
        created_at: new Date(),
      })
      role = await trx.from('roles').where('id', id).first()
      created++
    } else {
      throw new Error(
        `Default role slug collision before RBAC presets were initialized: ${definition.slug}`
      )
    }
    if (!role) throw new Error(`Unable to load default role ${definition.slug}`)

    // Existing role grants and names are deliberately left untouched.
    const hasGrants = await trx.from('role_permissions').where('role_id', role.id).first()
    if (!hasGrants) {
      const rows = await trx
        .from('permissions')
        .whereIn('key', [...definition.permissions])
        .where('is_active', true)
        .select('id', 'key')
      const byKey = new Map(rows.map((permission) => [permission.key, permission.id]))
      if (definition.permissions.some((key) => !byKey.has(key))) {
        throw new Error(`Seed the permission catalogue before default role ${definition.slug}`)
      }
      if (rows.length) {
        await trx
          .table('role_permissions')
          .insert(rows.map((permission) => ({ role_id: role.id, permission_id: permission.id })))
        grants += rows.length
      }
    }
  }
  await trx
    .from('rbac_state')
    .where('id', 1)
    .update({ defaults_initialized_at: new Date(), updated_at: new Date() })
  return { created, grants }
}

export async function syncPermissions() {
  validatePermissionCatalog()
  return db.transaction(async (trx) => {
    await lockState(trx)
    let inserted = 0
    let updated = 0
    for (const permission of permissionCatalog) {
      const existing = await trx.from('permissions').where('key', permission.key).first()
      const definition = {
        module: permission.module,
        action: permission.action,
        label: permission.label,
        description: permission.description,
        is_active: true,
        updated_at: new Date(),
      }
      if (existing) {
        const changed =
          existing.module !== definition.module ||
          existing.action !== definition.action ||
          existing.label !== definition.label ||
          existing.description !== definition.description ||
          !existing.is_active
        if (changed) {
          await trx.from('permissions').where('id', existing.id).update(definition)
          updated++
        }
      } else {
        await trx.table('permissions').insert({
          key: permission.key,
          ...definition,
          created_at: new Date(),
        })
        inserted++
      }
    }

    const declared = permissionCatalog.map(({ key }) => key)
    const stale = await trx.from('permissions').where('is_active', true).select('id', 'key')
    let retired = 0
    for (const permission of stale) {
      if (declared.includes(permission.key)) continue
      await trx.from('permissions').where('id', permission.id).update({
        is_active: false,
        updated_at: new Date(),
      })
      retired++
    }

    const superRole = await trx.from('roles').where('slug', 'super_admin').first()
    if (!superRole) {
      await trx.table('roles').insert({
        slug: 'super_admin',
        name: 'Super Admin',
        description: 'Protected system role with all active catalogue permissions.',
        is_system: true,
        created_at: new Date(),
      })
    } else if (!superRole.is_system) {
      throw new Error('The super_admin role slug is already used by a non-system role')
    }

    const defaults = await seedDefaultRoles(trx)
    if (inserted || retired) {
      await trx.table('audit_logs').insert({
        actor_id: null,
        action: 'permissions.synced',
        entity_type: 'permission_catalog',
        entity_id: null,
        changed_fields: JSON.stringify({ inserted, retired }),
        created_at: new Date(),
      })
    }
    return {
      inserted,
      updated,
      retired,
      defaultRolesCreated: defaults.created,
      grantsCreated: defaults.grants,
    }
  })
}

export async function ensureRbacState(trx: TransactionClientContract) {
  return lockState(trx)
}
