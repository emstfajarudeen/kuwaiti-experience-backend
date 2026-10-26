import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ApiError } from './api_error.js'
import { ensureRbacState } from './permission_sync_service.js'
import { requireLiveAdminOperator } from './authorization_service.js'

type Actor = { id: number; sessionId: string }
const elevatedRoleSlugs = ['super_admin', 'administrator']

function validId(value: unknown) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function roleIds(values: unknown) {
  if (!Array.isArray(values) || values.length < 1) {
    throw new ApiError(422, 'ROLE_REQUIRED', 'Assign at least one role to this staff member')
  }
  const ids = values.map(validId)
  if (ids.some((id) => !id)) throw new ApiError(422, 'INVALID_ROLES', 'Choose valid staff roles')
  return [...new Set(ids as number[])].sort((a, b) => a - b)
}

async function requireRoles(trx: TransactionClientContract, ids: number[]) {
  const rows = await trx.from('roles').whereIn('id', ids).select('id', 'slug').orderBy('id')
  if (rows.length !== ids.length)
    throw new ApiError(422, 'INVALID_ROLES', 'One or more roles no longer exist')
  return rows
}

async function audit(
  trx: TransactionClientContract,
  actorId: number,
  action: string,
  userId: number,
  changedFields: Record<string, unknown>
) {
  await trx.table('audit_logs').insert({
    actor_id: actorId,
    action,
    entity_type: 'staff',
    entity_id: String(userId),
    changed_fields: JSON.stringify(changedFields),
    created_at: new Date(),
  })
}

async function assertAnActiveSuperAdminRemains(
  trx: TransactionClientContract,
  targetId: number,
  newRoles?: Array<{ slug: string }>,
  remainsActive = false
) {
  const current = await trx
    .from('users as u')
    .join('user_roles as ur', 'ur.user_id', 'u.id')
    .join('roles as r', 'r.id', 'ur.role_id')
    .where('u.id', targetId)
    .whereIn('r.slug', ['super_admin', 'administrator'])
    .where('r.is_system', true)
    .first()
  if (!current) return
  if (remainsActive && newRoles?.some((role) => elevatedRoleSlugs.includes(role.slug))) return
  const other = await trx
    .from('users as u')
    .join('user_roles as ur', 'ur.user_id', 'u.id')
    .join('roles as r', 'r.id', 'ur.role_id')
    .where('u.role', 'admin')
    .where('u.active', true)
    .whereIn('r.slug', ['super_admin', 'administrator'])
    .where('r.is_system', true)
    .whereNot('u.id', targetId)
    .countDistinct('u.id as total')
    .first()
  if (Number(other?.total ?? 0) < 1) {
    throw new ApiError(
      409,
      'LAST_ADMIN',
      'Keep at least one other active full-access administrator'
    )
  }
}

export async function availableStaffRoles() {
  return db.from('roles').select('id', 'slug', 'name', 'is_system').orderBy('name')
}

export async function listStaff(filters: {
  query: string
  status: string
  reset: string
  roleId: number | null
  page: number
  pageSize: number
}) {
  const apply = (query: ReturnType<typeof db.from>) => {
    query.where('u.role', 'admin')
    if (filters.query)
      query.where((builder) =>
        builder
          .where('u.full_name', 'like', '%' + filters.query + '%')
          .orWhere('u.email', 'like', '%' + filters.query + '%')
      )
    if (filters.status) query.where('u.active', filters.status === 'active')
    if (filters.reset) query.where('u.must_change_password', filters.reset === 'required')
    if (filters.roleId)
      query.whereExists((subquery) =>
        subquery
          .from('user_roles')
          .whereColumn('user_roles.user_id', 'u.id')
          .where('user_roles.role_id', filters.roleId!)
      )
    return query
  }
  const count = await apply(db.from('users as u')).count('* as total').first()
  const total = Number(count?.total ?? 0)
  const lastPage = Math.max(1, Math.ceil(total / filters.pageSize))
  const page = Math.min(filters.page, lastPage)
  const rows = await apply(
    db
      .from('users as u')
      .select(
        'u.id',
        'u.full_name',
        'u.email',
        'u.active',
        'u.must_change_password',
        'u.created_at',
        'u.updated_at'
      )
  )
    .orderBy('u.created_at', 'desc')
    .orderBy('u.id', 'desc')
    .limit(filters.pageSize)
    .offset((page - 1) * filters.pageSize)
  const ids = rows.map((row) => row.id)
  const assignments = ids.length
    ? await db
        .from('user_roles as ur')
        .join('roles as r', 'r.id', 'ur.role_id')
        .whereIn('ur.user_id', ids)
        .select('ur.user_id', 'r.id', 'r.slug', 'r.name')
    : []
  const byUser = new Map<number, typeof assignments>()
  for (const assignment of assignments) {
    const id = Number(assignment.user_id)
    const list = byUser.get(id) ?? []
    list.push(assignment)
    byUser.set(id, list)
  }
  return {
    rows: rows.map((row) => ({
      ...row,
      id: Number(row.id),
      active: Boolean(row.active),
      must_change_password: Boolean(row.must_change_password),
      roles: byUser.get(Number(row.id)) ?? [],
    })),
    meta: { page, per_page: filters.pageSize, total, last_page: lastPage },
  }
}

export async function staffById(value: unknown) {
  const id = validId(value)
  if (!id) return null
  const user = await db.from('users').where('id', id).where('role', 'admin').first()
  if (!user) return null
  const roles = await db
    .from('user_roles as ur')
    .join('roles as r', 'r.id', 'ur.role_id')
    .where('ur.user_id', id)
    .select('r.id', 'r.slug', 'r.name')
  return {
    ...user,
    id: Number(user.id),
    active: Boolean(user.active),
    roles: roles.map((role) => ({ ...role, id: Number(role.id) })),
  }
}

export async function createStaff(
  actor: Actor,
  input: { fullName: string; email: string; password: string; roleIds: unknown }
) {
  const assignedIds = roleIds(input.roleIds)
  const email = input.email.trim().toLowerCase()
  const passwordHash = await hash.make(input.password)
  return db.transaction(async (trx) => {
    await ensureRbacState(trx)
    await requireLiveAdminOperator(actor.id, actor.sessionId, trx)
    if (await trx.from('users').where('email', email).first())
      throw new ApiError(409, 'EMAIL_EXISTS', 'A staff member already uses that email')
    const roles = await requireRoles(trx, assignedIds)
    const now = new Date()
    const [userId] = await trx.table('users').insert({
      full_name: input.fullName.trim(),
      email,
      password: passwordHash,
      role: 'admin',
      active: true,
      must_change_password: true,
      created_at: now,
      updated_at: now,
    })
    await trx
      .table('user_roles')
      .insert(assignedIds.map((roleId) => ({ user_id: userId, role_id: roleId, created_at: now })))
    await audit(trx, actor.id, 'staff.created', Number(userId), {
      roleIds: roles.map((role) => role.id),
    })
    return Number(userId)
  })
}

export async function updateStaff(
  actor: Actor,
  value: unknown,
  input: { fullName: string; email: string; active: boolean; roleIds: unknown }
) {
  const id = validId(value)
  if (!id) throw new ApiError(404, 'NOT_FOUND', 'Staff member not found')
  if (id === actor.id && !input.active)
    throw new ApiError(409, 'SELF_DEACTIVATION', 'You cannot deactivate your own account')
  const assignedIds = roleIds(input.roleIds)
  const email = input.email.trim().toLowerCase()
  return db.transaction(async (trx) => {
    await ensureRbacState(trx)
    await requireLiveAdminOperator(actor.id, actor.sessionId, trx)
    const user = await trx.from('users').where('id', id).where('role', 'admin').forUpdate().first()
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'Staff member not found')
    const oldRoles = await trx
      .from('user_roles')
      .where('user_id', id)
      .select('role_id')
      .orderBy('role_id')
    const oldIds = oldRoles.map((role) => Number(role.role_id))
    if (
      id === actor.id &&
      (oldIds.length !== assignedIds.length ||
        oldIds.some((roleId, index) => roleId !== assignedIds[index]))
    ) {
      throw new ApiError(409, 'SELF_ROLE_CHANGE', 'You cannot change your own roles')
    }
    if (user.email !== email && (await trx.from('users').where('email', email).first())) {
      throw new ApiError(409, 'EMAIL_EXISTS', 'A staff member already uses that email')
    }
    const roles = await requireRoles(trx, assignedIds)
    const oldSuper = await trx
      .from('user_roles as ur')
      .join('roles as r', 'r.id', 'ur.role_id')
      .where('ur.user_id', id)
      .whereIn('r.slug', ['super_admin', 'administrator'])
      .where('r.is_system', true)
      .first()
    if (
      oldSuper &&
      (!input.active || !roles.some((role) => elevatedRoleSlugs.includes(role.slug)))
    ) {
      await assertAnActiveSuperAdminRemains(trx, id, roles, input.active)
    }
    const now = new Date()
    await trx.from('users').where('id', id).update({
      full_name: input.fullName.trim(),
      email,
      active: input.active,
      updated_at: now,
    })
    await trx.from('user_roles').where('user_id', id).delete()
    await trx
      .table('user_roles')
      .insert(assignedIds.map((roleId) => ({ user_id: id, role_id: roleId, created_at: now })))
    if (user.active && !input.active) {
      await trx
        .from('auth_sessions')
        .where('user_id', id)
        .whereNull('revoked_at')
        .update({ revoked_at: now })
      await trx
        .from('admin_password_reset_tokens')
        .where('user_id', id)
        .whereNull('consumed_at')
        .update({ consumed_at: now })
    }
    await audit(trx, actor.id, input.active ? 'staff.updated' : 'staff.deactivated', id, {
      oldRoleIds: oldIds,
      newRoleIds: roles.map((role) => role.id),
      active: { old: Boolean(user.active), new: input.active },
    })
    return id
  })
}

export async function deleteStaff(actor: Actor, value: unknown) {
  const id = validId(value)
  if (!id) throw new ApiError(404, 'NOT_FOUND', 'Staff member not found')
  if (id === actor.id) throw new ApiError(409, 'SELF_DELETE', 'You cannot delete your own account')
  await db.transaction(async (trx) => {
    await ensureRbacState(trx)
    await requireLiveAdminOperator(actor.id, actor.sessionId, trx)
    const user = await trx.from('users').where('id', id).where('role', 'admin').forUpdate().first()
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'Staff member not found')
    if (user.active) await assertAnActiveSuperAdminRemains(trx, id)
    const now = new Date()
    await trx
      .from('auth_sessions')
      .where('user_id', id)
      .whereNull('revoked_at')
      .update({ revoked_at: now })
    await trx
      .from('admin_password_reset_tokens')
      .where('user_id', id)
      .whereNull('consumed_at')
      .update({ consumed_at: now })
    await audit(trx, actor.id, 'staff.deleted', id, {
      email: user.email,
      active: Boolean(user.active),
    })
    await trx.from('users').where('id', id).delete()
  })
}

export async function activeStaffById(value: unknown) {
  const id = validId(value)
  if (!id) return null
  return db.from('users').where('id', id).where('role', 'admin').where('active', true).first()
}
