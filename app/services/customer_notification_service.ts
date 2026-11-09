import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { ApiError } from './api_error.js'
import { pagination, positiveId } from './explore_read_service.js'
import { customerNotification } from '../serializers/customer_notification.js'
import type { Row } from '../serializers/customer.js'

export type PushLanguage = 'en' | 'ar'
type PushTokenInput = {
  token: string
  platform: 'ios' | 'android'
  device_id?: string
  language?: PushLanguage
}

function pushTokenData(row: Row) {
  return {
    id: Number(row.id),
    platform: row.platform,
    device_id: row.device_id ?? null,
    language: row.language === 'ar' ? 'ar' : 'en',
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  }
}
export type NotificationInput = {
  type: string
  title: string
  body: string
  /** Optional Arabic text, sent together with the English text. */
  title_ar?: string | null
  body_ar?: string | null
  action_data?: Record<string, unknown> | null
}

const MAX_DELIVERY_ATTEMPTS = 10
const DELIVERY_BATCH_SIZE = 100
const DELIVERY_CONCURRENCY = 10
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
let cachedAccessToken: { value: string; expiresAt: number } | null = null

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function pushConfig() {
  const projectId = env.get('FCM_PROJECT_ID')
  const clientEmail = env.get('FCM_CLIENT_EMAIL')
  const privateKey = env.get('FCM_PRIVATE_KEY')?.release().replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('FCM_PROJECT_ID, FCM_CLIENT_EMAIL, and FCM_PRIVATE_KEY must be configured')
  }
  return { projectId, clientEmail, privateKey }
}

export function assertPushConfigured() {
  pushConfig()
}

export function isPushConfigured() {
  return Boolean(
    env.get('FCM_PROJECT_ID') && env.get('FCM_CLIENT_EMAIL') && env.get('FCM_PRIVATE_KEY')
  )
}

async function accessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000)
    return cachedAccessToken.value

  const { clientEmail, privateKey } = pushConfig()
  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign(
    { scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 },
    privateKey,
    { algorithm: 'RS256', issuer: clientEmail }
  )
  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(15_000),
  })
  const result = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!response.ok || !result.access_token) throw new Error('Could not obtain FCM access token')
  cachedAccessToken = {
    value: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000,
  }
  return cachedAccessToken.value
}

async function sendPush(input: {
  token: string
  notificationId: number
  type: string
  title: string
  body: string
  titleAr?: string | null
  bodyAr?: string | null
  /** The device's saved app language; decides the text the system shows in the tray. */
  language?: PushLanguage
  actionData: unknown
}) {
  const { projectId } = pushConfig()
  const bearer = await accessToken()
  // Both languages travel in `data` so the app can still pick its own. The visible
  // `notification` block (what the system shows while the app is in the background) uses the
  // device's saved language: Arabic only when this device is Arabic and both Arabic texts exist.
  const arabic = input.language === 'ar' && Boolean(input.titleAr?.trim() && input.bodyAr?.trim())
  const visible = arabic
    ? { title: input.titleAr as string, body: input.bodyAr as string }
    : { title: input.title, body: input.body }
  const data: Record<string, string> = {
    notification_id: String(input.notificationId),
    type: input.type,
    title_en: input.title,
    body_en: input.body,
  }
  if (input.titleAr && input.bodyAr) {
    data.title_ar = input.titleAr
    data.body_ar = input.bodyAr
  }
  if (input.actionData !== null && input.actionData !== undefined)
    data.action_data = JSON.stringify(input.actionData)

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: input.token,
          notification: visible,
          data,
          // Explicit platform settings so idle/locked devices still show the banner promptly.
          android: { priority: 'HIGH', notification: { sound: 'default' } },
          apns: {
            headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
            payload: { aps: { sound: 'default' } },
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )
  const result = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string; details?: Array<{ errorCode?: string }> }
  }
  if (response.ok) return
  const error = result.error?.status ?? 'FCM_SEND_FAILED'
  const invalidToken =
    error === 'UNREGISTERED' ||
    result.error?.details?.some((detail) => detail.errorCode === 'UNREGISTERED')
  // Keep FCM's own explanation (e.g. SENDER_ID_MISMATCH, THIRD_PARTY_AUTH_ERROR) so failures are diagnosable.
  const detail = result.error?.message ? ` - ${result.error.message}` : ''
  throw Object.assign(new Error(`FCM delivery failed: ${error}${detail}`), { invalidToken })
}

/**
 * Proves the whole push path without touching a device: service-account credentials
 * are exchanged for an OAuth token, then FCM validates a dry-run message
 * (`validate_only`). A placeholder token is rejected as INVALID_ARGUMENT only after
 * FCM has accepted our credentials and project, so that answer means "working".
 */
export async function checkPushConnection() {
  const { projectId } = pushConfig()
  const bearer = await accessToken()
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validate_only: true,
        message: {
          token: 'connection-check',
          notification: { title: 'Connection check', body: 'Connection check' },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )
  const result = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string }
  }
  const status = result.error?.status
  if (response.ok || status === 'INVALID_ARGUMENT') return { projectId }
  if (response.status === 401) cachedAccessToken = null
  throw new Error(
    `FCM rejected the connection check (${status ?? `HTTP ${response.status}`}). Check the FCM project and service account.`
  )
}

export async function registerPushToken(customerId: number, input: PushTokenInput) {
  const tokenHash = digest(input.token)
  return db.transaction(async (trx) => {
    const customer = await trx.from('customers').where('id', customerId).forUpdate().first()
    if (!customer) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')

    if (input.device_id) {
      await trx
        .from('customer_push_tokens')
        .where({ customer_id: customerId, device_id: input.device_id })
        .whereNot('token_hash', tokenHash)
        .delete()
    }

    await trx
      .table('customer_push_tokens')
      .insert({
        customer_id: customerId,
        token: input.token,
        token_hash: tokenHash,
        platform: input.platform,
        device_id: input.device_id ?? null,
        language: input.language ?? 'en',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict('token_hash')
      .merge({
        customer_id: customerId,
        platform: input.platform,
        device_id: input.device_id ?? null,
        // Registering again without a language keeps the one already saved for this device.
        ...(input.language ? { language: input.language } : {}),
        updated_at: new Date(),
      })
    const row = await trx.from('customer_push_tokens').where('token_hash', tokenHash).firstOrFail()
    return { data: pushTokenData(row) }
  })
}

/** The app calls this when the user switches language, so later pushes use it. */
export async function updatePushTokenLanguage(
  customerId: number,
  id: unknown,
  language: PushLanguage
) {
  const key = { customer_id: customerId, id: positiveId(id) }
  const existing = await db.from('customer_push_tokens').where(key).first()
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Push token not found')
  await db.from('customer_push_tokens').where(key).update({ language, updated_at: new Date() })
  return { data: pushTokenData(await db.from('customer_push_tokens').where(key).firstOrFail()) }
}

export async function removePushToken(customerId: number, id: unknown) {
  const removed = await db
    .from('customer_push_tokens')
    .where({ customer_id: customerId, id: positiveId(id) })
    .delete()
  if (!removed) throw new ApiError(404, 'NOT_FOUND', 'Push token not found')
}

export async function listNotifications(customerId: number, input: Row) {
  const { page, perPage } = pagination({ ...input, per_page: input.per_page ?? 20 })
  const query = db.from('customer_notifications').where('customer_id', customerId)
  const [count, unread, rows] = await Promise.all([
    query.clone().count('* as total').first(),
    query.clone().whereNull('read_at').count('* as total').first(),
    query
      .clone()
      .orderBy('id', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage),
  ])
  const total = Number(count?.total ?? 0)
  return {
    data: rows.map(customerNotification),
    meta: {
      page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      unread_count: Number(unread?.total ?? 0),
    },
  }
}

export async function markNotificationRead(customerId: number, id: unknown) {
  const key = { customer_id: customerId, id: positiveId(id) }
  const row = await db.from('customer_notifications').where(key).first()
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Notification not found')
  if (!row.read_at) {
    await db
      .from('customer_notifications')
      .where(key)
      .whereNull('read_at')
      .update({ read_at: new Date() })
  }
  return {
    data: customerNotification(await db.from('customer_notifications').where(key).firstOrFail()),
  }
}

export async function markAllNotificationsRead(customerId: number) {
  await db
    .from('customer_notifications')
    .where('customer_id', customerId)
    .whereNull('read_at')
    .update({ read_at: new Date() })
}

/** Internal event hook for trusted backend workflows; never expose this as a customer write API. */
export async function createCustomerNotification(customerId: number, input: NotificationInput) {
  const { result, pushCount } = await db.transaction(async (trx) => {
    const customer = await trx.from('customers').where('id', customerId).forUpdate().first()
    if (!customer) throw new ApiError(404, 'NOT_FOUND', 'Customer not found')
    const [id] = await trx.table('customer_notifications').insert({
      customer_id: customerId,
      type: input.type,
      title: input.title,
      body: input.body,
      title_ar: input.title_ar ?? null,
      body_ar: input.body_ar ?? null,
      action_data: input.action_data ?? null,
      created_at: new Date(),
    })
    const notification = await trx.from('customer_notifications').where('id', id).firstOrFail()
    const tokens = await trx
      .from('customer_push_tokens')
      .where('customer_id', customerId)
      .select('id')
    if (tokens.length) {
      const availableAt = new Date()
      await trx.table('customer_notification_outbox').insert(
        tokens.map((token) => ({
          notification_id: id,
          push_token_id: token.id,
          available_at: availableAt,
        }))
      )
    }
    return { result: { data: customerNotification(notification) }, pushCount: tokens.length }
  })
  logger.info(
    { customerId, type: input.type, notificationId: result.data.id, devices: pushCount },
    pushCount
      ? 'Customer notification queued for push'
      : 'Customer notification saved to inbox only (customer has no registered push token)'
  )
  // Send now instead of waiting for the worker; the worker still retries anything that fails.
  if (pushCount) dispatchPushOutbox({ customerId, type: input.type })
  return result
}

/**
 * Fire-and-forget delivery of queued pushes from the web process, so event and CMS
 * notifications reach devices without depending on the worker's polling. Race-safe:
 * outbox rows are claimed with row locks, so the worker never sends the same row twice.
 * Only a few batches are drained here; bulk delivery and retries stay with the worker.
 */
export function dispatchPushOutbox(context: Record<string, unknown> = {}, batches = 3) {
  if (env.get('NODE_ENV') === 'test') return
  setImmediate(() => {
    void (async () => {
      try {
        if (!isPushConfigured()) {
          logger.warn(context, 'Push not sent: FCM credentials are not configured')
          return
        }
        let sent = 0
        for (let batch = 0; batch < batches; batch++) {
          const count = await deliverPushBatch()
          if (!count) break
          sent += count
        }
        logger.info({ ...context, processed: sent }, 'Push outbox dispatched')
      } catch (error) {
        logger.error({ err: error, ...context }, 'Push outbox dispatch failed')
      }
    })()
  })
}

async function claimOutboxBatch() {
  const now = new Date()
  const staleLock = new Date(Date.now() - 5 * 60 * 1000)
  return db.transaction(async (trx) => {
    const rows = await trx
      .from('customer_notification_outbox')
      .whereNull('delivered_at')
      .whereNull('failed_at')
      .where('available_at', '<=', now)
      .where((query) => query.whereNull('locked_at').orWhere('locked_at', '<=', staleLock))
      .orderBy('id')
      .limit(DELIVERY_BATCH_SIZE)
      .forUpdate()
      .skipLocked()
    if (!rows.length) return [] as number[]
    const ids = rows.map((row) => Number(row.id))
    await trx.from('customer_notification_outbox').whereIn('id', ids).update({ locked_at: now })
    return ids
  })
}

async function deliverOne(row: Row) {
  try {
    await sendPush({
      token: row.token,
      notificationId: Number(row.notification_id),
      type: row.type,
      title: row.title,
      body: row.body,
      titleAr: row.title_ar ?? null,
      bodyAr: row.body_ar ?? null,
      language: row.language === 'ar' ? 'ar' : 'en',
      actionData:
        row.action_data === null || row.action_data === undefined
          ? null
          : typeof row.action_data === 'string'
            ? JSON.parse(row.action_data)
            : row.action_data,
    })
    await db
      .from('customer_notification_outbox')
      .where('id', row.outbox_id)
      .update({ delivered_at: new Date(), locked_at: null, last_error: null })
    logger.info(
      { outboxId: row.outbox_id, notificationId: row.notification_id, type: row.type },
      'Push delivered'
    )
  } catch (error) {
    const attempts = Number(row.attempts) + 1
    const invalidToken = Boolean((error as { invalidToken?: boolean }).invalidToken)
    const exhausted = attempts >= MAX_DELIVERY_ATTEMPTS || invalidToken
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown FCM error'
    logger.warn(
      { outboxId: row.outbox_id, pushTokenId: row.push_token_id, attempts, invalidToken },
      `Push delivery failed: ${message}`
    )
    await db
      .from('customer_notification_outbox')
      .where('id', row.outbox_id)
      .update({
        attempts,
        available_at: new Date(
          Date.now() + Math.min(6 * 60 * 60_000, 30_000 * 2 ** (attempts - 1))
        ),
        locked_at: null,
        failed_at: exhausted ? new Date() : null,
        last_error: message,
      })
    if (invalidToken) await db.from('customer_push_tokens').where('id', row.push_token_id).delete()
  }
}

export async function deliverPushBatch() {
  const ids = await claimOutboxBatch()
  if (!ids.length) return 0
  const rows = await db
    .from('customer_notification_outbox as o')
    .join('customer_notifications as n', 'n.id', 'o.notification_id')
    .join('customer_push_tokens as t', 't.id', 'o.push_token_id')
    .whereIn('o.id', ids)
    .select(
      'o.id as outbox_id',
      'o.attempts',
      'o.push_token_id',
      'n.id as notification_id',
      'n.type',
      'n.title',
      'n.body',
      'n.title_ar',
      'n.body_ar',
      'n.action_data',
      't.token',
      't.language'
    )
  // Rows are independent, so deliver with bounded concurrency: a broadcast to thousands
  // of devices would otherwise crawl at one sequential FCM round trip at a time.
  for (let offset = 0; offset < rows.length; offset += DELIVERY_CONCURRENCY)
    await Promise.all(rows.slice(offset, offset + DELIVERY_CONCURRENCY).map(deliverOne))
  return rows.length
}
