import { createHash, randomBytes, randomUUID } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { sendAdminPasswordResetEmail } from './admin_password_reset_mailer.js'
import { ensureRbacState } from './permission_sync_service.js'
import { requireLiveAdminOperator } from './authorization_service.js'
import { sendProviderPortalEmail } from './rental_provider_mailer.js'

/** Staff and rental provider portal logins share the CMS password flows. */
const cmsRoles = ['admin', 'provider']
const inviteLifetimeMs = 72 * 60 * 60 * 1000

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
    .whereIn('role', cmsRoles)
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
      .whereIn('role', cmsRoles)
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
    return { id: currentUser.id, email: currentUser.email, role: currentUser.role }
  })
  if (!target) return

  try {
    if (target.role === 'provider')
      await sendProviderPortalEmail('reset', { recipient: target.email, url: resetUrl(token) })
    else await sendAdminPasswordResetEmail({ recipient: target.email, resetUrl: resetUrl(token) })
  } catch (error) {
    await db.from('admin_password_reset_tokens').where('id', resetId).delete()
    logger.error({ err: error, userId: target.id }, 'Admin password-reset email delivery failed')
  }
}

export async function isAdminPasswordResetTokenValid(token: string) {
  return (await passwordTokenPurpose(token)) !== null
}

/** 'invite' for a provider's first password, 'reset' otherwise; null when the link is unusable. */
export async function passwordTokenPurpose(token: string): Promise<'invite' | 'reset' | null> {
  if (!isPasswordResetToken(token)) return null
  const reset = await db
    .from('admin_password_reset_tokens as reset')
    .join('users as user', 'user.id', 'reset.user_id')
    .where('reset.token_hash', digest(token))
    .whereNull('reset.consumed_at')
    .where('reset.expires_at', '>', new Date())
    .whereIn('user.role', cmsRoles)
    .where('user.active', true)
    .select('reset.purpose')
    .first()
  if (!reset) return null
  return reset.purpose === 'invite' ? 'invite' : 'reset'
}

/**
 * Emails a provider portal login a link to set its password. The link lasts 72 hours.
 * When email cannot be sent, the link is returned so staff can pass it on themselves.
 */
export async function inviteProviderUser(userId: number, actorId: number) {
  const token = createToken()
  const now = new Date()
  const user = await db.transaction(async (trx) => {
    const row = await trx
      .from('users')
      .where('id', userId)
      .where('role', 'provider')
      .forUpdate()
      .first()
    if (!row) return null
    await trx
      .from('admin_password_reset_tokens')
      .where('user_id', userId)
      .whereNull('consumed_at')
      .update({ consumed_at: now })
    await trx.table('admin_password_reset_tokens').insert({
      id: randomUUID(),
      user_id: userId,
      token_hash: digest(token),
      purpose: 'invite',
      expires_at: new Date(now.getTime() + inviteLifetimeMs),
      created_at: now,
    })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'provider_login.invite',
      entity_type: 'user',
      entity_id: String(userId),
      created_at: now,
    })
    return row
  })
  if (!user) return { status: 'failed' as const, error: 'Login not found.', url: null }
  const url = resetUrl(token)
  try {
    await sendProviderPortalEmail('invite', {
      recipient: user.email,
      url,
      name: user.full_name,
    })
    return { status: 'sent' as const, error: null, url: null }
  } catch (error) {
    logger.warn({ err: error, userId }, 'Provider portal invite email failed')
    return {
      status: 'failed' as const,
      error: error instanceof Error ? error.message : 'The email could not be sent.',
      url,
    }
  }
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
      !cmsRoles.includes(reset.role) ||
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
        password_set_at: now,
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
