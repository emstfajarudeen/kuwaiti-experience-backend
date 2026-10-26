import type { HttpContext } from '@adonisjs/core/http'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'
import {
  permissionKeys,
  reservedPermissionKeys,
  type PermissionKey,
} from '../authorization/permission_catalog.js'
import type { AuthorizationContext } from '../authorization/types.js'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    authorization: AuthorizationContext
  }
}

export async function loadAuthorization(userId: number): Promise<AuthorizationContext> {
  const roles = await db
    .from('user_roles as ur')
    .join('roles as r', 'r.id', 'ur.role_id')
    .where('ur.user_id', userId)
    .select('r.id', 'r.slug', 'r.is_system')
    .orderBy('r.id')
  const roleIds = roles.map((role) => Number(role.id))
  const isSuperAdmin = roles.some((role) => role.slug === 'super_admin' && Boolean(role.is_system))
  const isFullAccessAdmin = roles.some(
    (role) =>
      Boolean(role.is_system) && ['super_admin', 'administrator'].includes(String(role.slug))
  )
  const rows = roleIds.length
    ? await db
        .from('role_permissions as rp')
        .join('permissions as p', 'p.id', 'rp.permission_id')
        .whereIn('rp.role_id', roleIds)
        .where('p.is_active', true)
        .select('p.key')
    : []
  const granted = new Set(rows.map((row) => String(row.key)))
  const activeRows = await db
    .from('permissions')
    .where('is_active', true)
    .whereIn('key', [...permissionKeys])
    .select('key')
  const activeKeys = new Set(activeRows.map((row) => String(row.key)))
  const permissions = new Set<PermissionKey>()
  for (const key of permissionKeys) {
    if (
      activeKeys.has(key) &&
      (granted.has(key) || isFullAccessAdmin) &&
      !reservedPermissionKeys.has(key)
    ) {
      permissions.add(key as PermissionKey)
    }
  }
  // Super Admin capabilities are synthesized from the current catalogue. Reserved
  // management permissions are included only for an actual protected membership.
  if (isFullAccessAdmin) {
    for (const key of reservedPermissionKeys) {
      if (activeKeys.has(key)) permissions.add(key as PermissionKey)
    }
  }
  return {
    roleIds,
    roleSlugs: roles.map((role) => String(role.slug)),
    isSuperAdmin,
    isFullAccessAdmin,
    permissions,
  }
}

export function can(authz: AuthorizationContext, permission: string) {
  return permissionKeys.has(permission) && authz.permissions.has(permission as PermissionKey)
}

export function requireAll(authz: AuthorizationContext, permissions: readonly string[]) {
  if (permissions.some((permission) => !can(authz, permission))) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action')
  }
}

export function requireSuperAdmin(authz: AuthorizationContext) {
  if (!authz.isSuperAdmin) {
    throw new ApiError(403, 'FORBIDDEN', 'Super Admin access is required')
  }
}

export async function requireLiveAdminOperator(
  userId: number,
  sessionId: string,
  trx: TransactionClientContract
) {
  const actor = await trx
    .from('auth_sessions as s')
    .join('users as u', 'u.id', 's.user_id')
    .join('user_roles as ur', 'ur.user_id', 'u.id')
    .join('roles as r', 'r.id', 'ur.role_id')
    .where('u.id', userId)
    .where('s.id', sessionId)
    .whereNull('s.revoked_at')
    .where('s.expires_at', '>', new Date())
    .where('u.active', true)
    .where('u.role', 'admin')
    .whereIn('r.slug', ['super_admin', 'administrator'])
    .where('r.is_system', true)
    .first()
  if (!actor) throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required')
}

export async function requestAuthorization(ctx: HttpContext) {
  const authz = await loadAuthorization(ctx.admin.id)
  ctx.authorization = authz
  return authz
}
