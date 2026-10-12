import { createHash, randomBytes, randomUUID } from 'node:crypto'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import env from '#start/env'
import { ApiError } from './api_error.js'

const accessSeconds = 15 * 60
const sessionSeconds = 7 * 24 * 60 * 60
const issuer = env.get('JWT_ISSUER')
const audience = env.get('JWT_AUDIENCE')
const secret = env.get('JWT_SECRET').release()

export type AdminIdentity = { id: number; fullName: string; email: string; sessionId: string }
type TokenPair = { accessToken: string; refreshToken: string; expiresIn: number }

function digest(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function signAccess(userId: number, sessionId: string) {
  return jwt.sign({ sid: sessionId }, secret, {
    algorithm: 'HS256',
    subject: String(userId),
    issuer,
    audience,
    expiresIn: accessSeconds,
  })
}

function newRefreshToken() {
  return randomBytes(48).toString('base64url')
}

export async function loginAdmin(email: string, password: string): Promise<TokenPair> {
  const normalizedEmail = email.trim().toLowerCase()
  const user = await db.from('users').where('email', normalizedEmail).first()
  if (
    !user ||
    user.role !== 'admin' ||
    !user.active ||
    !(await hash.verify(user.password, password))
  ) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
  }

  const sessionId = randomUUID()
  const refreshToken = newRefreshToken()
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000)
  await db.transaction(async (trx) => {
    await trx.table('auth_sessions').insert({
      id: sessionId,
      user_id: user.id,
      expires_at: expiresAt,
      created_at: new Date(),
    })
    await trx.table('refresh_tokens').insert({
      id: randomUUID(),
      session_id: sessionId,
      token_hash: digest(refreshToken),
      expires_at: expiresAt,
      created_at: new Date(),
    })
  })
  return { accessToken: signAccess(user.id, sessionId), refreshToken, expiresIn: accessSeconds }
}

export async function authenticateAdmin(token: string): Promise<AdminIdentity> {
  let payload: JwtPayload
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience })
    if (typeof decoded !== 'object') throw new Error('Invalid token payload')
    payload = decoded
  } catch {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
  }
  if (
    !payload.sub ||
    !Number.isSafeInteger(Number(payload.sub)) ||
    typeof payload.sid !== 'string'
  ) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
  }
  const row = await db
    .from('auth_sessions as s')
    .join('users as u', 'u.id', 's.user_id')
    .select('u.id', 'u.full_name', 'u.email', 'u.role', 'u.active')
    .where('s.id', payload.sid)
    .where('u.id', Number(payload.sub))
    .whereNull('s.revoked_at')
    .where('s.expires_at', '>', new Date())
    .first()
  if (!row || !row.active || row.role !== 'admin') {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
  }
  return { id: row.id, fullName: row.full_name, email: row.email, sessionId: payload.sid }
}

export async function rotateRefreshToken(token: string): Promise<TokenPair> {
  if (token.length < 50 || token.length > 200) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Session expired')
  }
  const outcome = await db.transaction(async (trx) => {
    const old = await trx
      .from('refresh_tokens as r')
      .join('auth_sessions as s', 's.id', 'r.session_id')
      .join('users as u', 'u.id', 's.user_id')
      .select(
        'r.id',
        'r.session_id',
        'r.consumed_at',
        'r.expires_at',
        's.revoked_at',
        's.expires_at as session_expires_at',
        'u.id as user_id',
        'u.active',
        'u.role'
      )
      .where('r.token_hash', digest(token))
      .forUpdate()
      .first()
    if (
      !old ||
      old.revoked_at ||
      new Date(old.expires_at) <= new Date() ||
      new Date(old.session_expires_at) <= new Date() ||
      !old.active ||
      old.role !== 'admin'
    ) {
      return { kind: 'invalid' as const }
    }
    if (old.consumed_at) {
      await trx.from('auth_sessions').where('id', old.session_id).update({ revoked_at: new Date() })
      return { kind: 'reused' as const }
    }
    const refreshToken = newRefreshToken()
    await trx.from('refresh_tokens').where('id', old.id).update({ consumed_at: new Date() })
    await trx.table('refresh_tokens').insert({
      id: randomUUID(),
      session_id: old.session_id,
      token_hash: digest(refreshToken),
      expires_at: old.session_expires_at,
      created_at: new Date(),
    })
    return {
      kind: 'ok' as const,
      accessToken: signAccess(old.user_id, old.session_id),
      refreshToken,
      expiresIn: accessSeconds,
    }
  })
  if (outcome.kind !== 'ok') {
    throw new ApiError(
      401,
      outcome.kind === 'reused' ? 'REFRESH_REUSE' : 'INVALID_REFRESH_TOKEN',
      'Session expired'
    )
  }
  return {
    accessToken: outcome.accessToken,
    refreshToken: outcome.refreshToken,
    expiresIn: outcome.expiresIn,
  }
}

export async function revokeSession(sessionId: string) {
  await db
    .from('auth_sessions')
    .where('id', sessionId)
    .whereNull('revoked_at')
    .update({ revoked_at: new Date() })
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  nextPassword: string
) {
  const user = await db.from('users').where('id', userId).first()
  if (!user || !(await hash.verify(user.password, currentPassword))) {
    throw new ApiError(422, 'INVALID_PASSWORD', 'Current password is incorrect')
  }
  await db.transaction(async (trx) => {
    await trx
      .from('users')
      .where('id', userId)
      .update({
        password: await hash.make(nextPassword),
        must_change_password: false,
        updated_at: new Date(),
      })
    await trx
      .from('auth_sessions')
      .where('user_id', userId)
      .whereNull('revoked_at')
      .update({ revoked_at: new Date() })
  })
}
