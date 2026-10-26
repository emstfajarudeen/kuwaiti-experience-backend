import { createHash, randomBytes, randomUUID } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { sendAdminPasswordResetEmail } from './admin_password_reset_mailer.js'
import { ensureRbacState } from './permission_sync_service.js'
import { requireLiveAdminOperator } from './authorization_service.js'

const tokenBytes = 48
const resetLifetimeMs = 20 * 60 * 1000
const tokenPattern = /^[A-Za-z0-9_-]{64}$/

function digest(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createToken() {
  return randomBytes(tokenBytes).toString('base64url')
}

function resetUrl(token: string) {
  const url = new URL('/admin/reset-password', env.get('APP_URL'))
  url.searchParams.set('token', token)
  return url.toString()
}

export function isPasswordResetToken(token: string) {
  return tokenPattern.test(token)
}

export async function requestAdminPasswordReset(
  email: string,
  actorId?: number,
  actorSessionId?: string
) {
  const normalizedEmail = email.trim().toLowerCase()
  const user = await db
    .from('users')
    .where('email', normalizedEmail)
    .where('role', 'admin')
    .where('active', true)
    .first()

  if (!user) return

  const token = createToken()
  const tokenHash = digest(token)
  const resetId = randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + resetLifetimeMs)

  const target = await db.transaction(async (trx) => {
    if (actorSessionId && actorId) {
      await ensureRbacState(trx)
      await requireLiveAdminOperator(actorId, actorSessionId, trx)
    }
    const currentUser = await trx
      .from('users')
      .where('id', user.id)
      .where('role', 'admin')
      .where('active', true)
      .forUpdate()
      .first()
    if (!currentUser) return null
    await trx
      .from('admin_password_reset_tokens')
      .where('user_id', user.id)
      .whereNull('consumed_at')
      .update({ consumed_at: now })
    await trx.table('admin_password_reset_tokens').insert({
      id: resetId,
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_at: now,
    })
    await trx.table('audit_logs').insert({
      actor_id: actorId ?? null,
      action: 'admin.password_reset.requested',
      entity_type: 'user',
      entity_id: String(currentUser.id),
      created_at: now,
    })
    return { id: currentUser.id, email: currentUser.email }
  })
  if (!target) return

  try {
    await sendAdminPasswordResetEmail({ recipient: target.email, resetUrl: resetUrl(token) })
  } catch (error) {
    await db.from('admin_password_reset_tokens').where('id', resetId).delete()
    logger.error({ err: error, userId: target.id }, 'Admin password-reset email delivery failed')
  }
}

export async function isAdminPasswordResetTokenValid(token: string) {
  if (!isPasswordResetToken(token)) return false
  const reset = await db
    .from('admin_password_reset_tokens as reset')
    .join('users as user', 'user.id', 'reset.user_id')
    .where('reset.token_hash', digest(token))
    .whereNull('reset.consumed_at')
    .where('reset.expires_at', '>', new Date())
    .where('user.role', 'admin')
    .where('user.active', true)
    .first()
  return Boolean(reset)
}

export async function resetAdminPassword(token: string, nextPassword: string) {
  if (!isPasswordResetToken(token)) return false

  return db.transaction(async (trx) => {
    const reset = await trx
      .from('admin_password_reset_tokens as reset')
      .join('users as user', 'user.id', 'reset.user_id')
      .select(
        'reset.id',
        'reset.user_id',
        'reset.consumed_at',
        'reset.expires_at',
        'user.role',
        'user.active'
      )
      .where('reset.token_hash', digest(token))
      .forUpdate()
      .first()

    if (
      !reset ||
      reset.consumed_at ||
      new Date(reset.expires_at) <= new Date() ||
      reset.role !== 'admin' ||
      !reset.active
    ) {
      return false
    }

    const now = new Date()
    await trx
      .from('admin_password_reset_tokens')
      .where('user_id', reset.user_id)
      .whereNull('consumed_at')
      .update({ consumed_at: now })
    await trx
      .from('users')
      .where('id', reset.user_id)
      .update({
        password: await hash.make(nextPassword),
        must_change_password: false,
        updated_at: now,
      })
    await trx
      .from('auth_sessions')
      .where('user_id', reset.user_id)
      .whereNull('revoked_at')
      .update({ revoked_at: now })
    await trx.table('audit_logs').insert({
      actor_id: reset.user_id,
      action: 'admin.password_reset.completed',
      entity_type: 'user',
      entity_id: String(reset.user_id),
      created_at: now,
    })
    return true
  })
}
