import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ApiError } from './api_error.js'
import { ensureRbacState } from './permission_sync_service.js'
import { requireLiveAdminOperator } from './authorization_service.js'
import {
  permissionCatalog,
  permissionKeys,
  reservedPermissionKeys,
} from '../authorization/permission_catalog.js'

function validId(value: unknown) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function normalizedKeys(values: unknown) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new ApiError(422, 'INVALID_PERMISSIONS', 'Choose valid permissions')
  }
  const keys = [...new Set(values as string[])].sort()
  for (const key of keys) {
    if (!permissionKeys.has(key) || reservedPermissionKeys.has(key)) {
      throw new ApiError(422, 'INVALID_PERMISSIONS', 'One or more permissions cannot be assigned')
    }
    const definition = permissionCatalog.find((item) => item.key === key)
    if (definition && definition.action !== 'view' && !keys.includes(`${definition.module}.view`)) {
      throw new ApiError(422, 'INVALID_PERMISSIONS', `Add ${definition.module}.view with ${key}`)
    }
  }
  return keys
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function loadRolePermissionsFromDb(roleId: number) {
  return db
    .from('role_permissions as rp')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where('rp.role_id', roleId)
    .where('p.is_active', true)
    .select('p.key', 'p.module', 'p.action', 'p.label')
    .orderBy('p.module')
    .orderBy('p.action')
}

async function loadSuperAdminPermissions() {
  return db
    .from('permissions')
    .where('is_active', true)
    .whereIn(
      'key',
      permissionCatalog.map(({ key }) => key)
    )
    .select('key', 'module', 'action', 'label')
    .orderBy('module')
    .orderBy('action')
}

async function audit(
  trx: TransactionClientContract,
  actorId: number,
  action: string,
  entityId: number,
  changedFields: Record<string, unknown>
) {
  await trx.table('audit_logs').insert({
    actor_id: actorId,
    action,
    entity_type: 'role',
    entity_id: String(entityId),
    changed_fields: JSON.stringify(changedFields),
    created_at: new Date(),
  })
}

async function loadRolePermissions(trx: TransactionClientContract, roleId: number) {
  return trx
    .from('role_permissions as rp')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where('rp.role_id', roleId)
    .where('p.is_active', true)
    .select('p.key', 'p.module', 'p.action', 'p.label')
    .orderBy('p.module')
    .orderBy('p.action')
}

export async function listRoles() {
  const roles = await db
    .from('roles as r')
    .leftJoin('user_roles as ur', 'ur.role_id', 'r.id')
    .select('r.id', 'r.slug', 'r.name', 'r.description', 'r.is_system', 'r.created_at')
    .countDistinct('ur.user_id as staff_count')
    .groupBy('r.id', 'r.slug', 'r.name', 'r.description', 'r.is_system', 'r.created_at')
    .orderBy('r.is_system', 'desc')
    .orderBy('r.name')
  return Promise.all(
    roles.map(async (role) => ({
      ...role,
      id: Number(role.id),
      is_system: Boolean(role.is_system),
      staff_count: Number(role.staff_count ?? 0),
      permissions: role.is_system
        ? await loadSuperAdminPermissions()
        : await loadRolePermissionsFromDb(Number(role.id)),
    }))
  )
}

export async function getRole(roleIdValue: unknown) {
  const roleId = validId(roleIdValue)
  if (!roleId) throw new ApiError(404, 'NOT_FOUND', 'Role not found')
  const role = await db.from('roles').where('id', roleId).first()
  if (!role) throw new ApiError(404, 'NOT_FOUND', 'Role not found')
  const isSystem = Boolean(role.is_system)
  const permissions = isSystem
    ? await loadSuperAdminPermissions()
    : await loadRolePermissionsFromDb(roleId)
  return { ...role, id: Number(role.id), is_system: isSystem, permissions }
}

export async function createRole(
  actor: { id: number; sessionId: string },
  input: {
    name: string
    description?: string | null
    permissionKeys: unknown
  }
) {
  const keys = normalizedKeys(input.permissionKeys)
  const slug = slugify(input.name)
  if (!slug || slug.length > 80)
    throw new ApiError(
      422,
      'INVALID_ROLE_NAME',
      'Enter a role name that can form a role identifier'
    )
  return db.transaction(async (trx) => {
    await ensureRbacState(trx)
    await requireLiveAdminOperator(actor.id, actor.sessionId, trx)
    if (await trx.from('roles').where('slug', slug).first()) {
      throw new ApiError(409, 'ROLE_EXISTS', 'A role with this name already exists')
    }
    const [roleId] = await trx.table('roles').insert({
      slug,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      is_system: false,
      created_at: new Date(),
    })
    await writeGrants(trx, Number(roleId), keys)
    await audit(trx, actor.id, 'role.created', Number(roleId), { permissionKeys: keys })
    return Number(roleId)
  })
}

export async function updateRole(
  actor: { id: number; sessionId: string },
  roleIdValue: unknown,
  input: {
    name: string
    description?: string | null
    permissionKeys: unknown
  }
) {
  const roleId = validId(roleIdValue)
  if (!roleId) throw new ApiError(404, 'NOT_FOUND', 'Role not found')
  const keys = normalizedKeys(input.permissionKeys)
  return db.transaction(async (trx) => {
    await ensureRbacState(trx)
    await requireLiveAdminOperator(actor.id, actor.sessionId, trx)
    const role = await trx.from('roles').where('id', roleId).forUpdate().first()
    if (!role) throw new ApiError(404, 'NOT_FOUND', 'Role not found')
    if (role.is_system || role.slug === 'super_admin') {
      throw new ApiError(409, 'PROTECTED_ROLE', 'Protected system roles cannot be edited')
    }
    const before = await loadRolePermissions(trx, roleId)
    const oldKeys = before.map((permission) => String(permission.key)).sort()
    await trx
      .from('roles')
      .where('id', roleId)
      .update({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        updated_at: new Date(),
      })
    await writeGrants(trx, roleId, keys)
    await audit(trx, actor.id, 'role.updated', roleId, {
      oldPermissionKeys: oldKeys,
      newPermissionKeys: keys,
      name: { old: role.name, new: input.name.trim() },
    })
    return roleId
  })
}

export async function deleteRole(actor: { id: number; sessionId: string }, roleIdValue: unknown) {
  const roleId = validId(roleIdValue)
  if (!roleId) throw new ApiError(404, 'NOT_FOUND', 'Role not found')
  await db.transaction(async (trx) => {
    await ensureRbacState(trx)
    await requireLiveAdminOperator(actor.id, actor.sessionId, trx)
    const role = await trx.from('roles').where('id', roleId).forUpdate().first()
    if (!role) throw new ApiError(404, 'NOT_FOUND', 'Role not found')
    if (role.is_system || role.slug === 'super_admin') {
      throw new ApiError(409, 'PROTECTED_ROLE', 'Protected system roles cannot be deleted')
    }
    const member = await trx.from('user_roles').where('role_id', roleId).first()
    if (member) throw new ApiError(409, 'ROLE_ASSIGNED', 'Reassign staff before deleting this role')
    await trx.from('roles').where('id', roleId).delete()
    await audit(trx, actor.id, 'role.deleted', roleId, { slug: role.slug, name: role.name })
  })
}

async function writeGrants(trx: TransactionClientContract, roleId: number, keys: string[]) {
  const rows = keys.length
    ? await trx
        .from('permissions')
        .whereIn('key', keys)
        .where('is_active', true)
        .select('id', 'key')
    : []
  if (rows.length !== keys.length)
    throw new ApiError(422, 'INVALID_PERMISSIONS', 'Refresh permissions and try again')
  await trx.from('role_permissions').where('role_id', roleId).delete()
  if (rows.length) {
    await trx.table('role_permissions').insert(
      rows.map((permission) => ({
        role_id: roleId,
        permission_id: permission.id,
      }))
    )
  }
}

export async function permissionOptions() {
  return permissionCatalog
    .filter((permission) => !('reserved' in permission))
    .map(({ key, module, action, label, ...rest }) => ({ key, module, action, label, ...rest }))
}
