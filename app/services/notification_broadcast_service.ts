import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { ApiError } from './api_error.js'
import { dispatchPushOutbox, isPushConfigured } from './customer_notification_service.js'
import { formatKuwaitDateTime } from './date_service.js'

export type BroadcastAudience = 'all' | 'ios' | 'android' | 'customer'

export type BroadcastInput = {
  request_key: string
  title: string
  body: string
  title_ar?: string | null
  body_ar?: string | null
  audience: BroadcastAudience
  customer_id?: number | null
  customer_phone?: string | null
}

/** Mobile clients receive this as `type` on the inbox item and in the push data payload. */
export const BROADCAST_NOTIFICATION_TYPE = 'general'

const FAN_OUT_CHUNK = 1000
const STALE_LOCK_MS = 5 * 60 * 1000
const OVERDUE_AFTER_MS = 2 * 60 * 1000
const PAGE_SIZE = 10

type Counts = { delivered: number; failed: number; pending: number; removed: number }

const count = (row: { total?: unknown } | undefined | null) => Number(row?.total ?? 0)
const affected = (result: unknown) => Number(Array.isArray(result) ? result[0] : result)
const placeholders = (values: unknown[]) => values.map(() => '?').join(',')

/**
 * Queue a broadcast. This only writes one small row (plus an audit entry), so the HTTP
 * request stays fast no matter how many customers the audience contains; the fan-out
 * into per-customer inbox rows and push outbox rows happens in `processBroadcast`.
 */
export async function createBroadcast(input: BroadcastInput, adminId: number) {
  let customerId: number | null = null
  if (input.audience === 'customer') {
    const lookup = input.customer_id
      ? db.from('customers').where('id', input.customer_id)
      : input.customer_phone
        ? db.from('customers').where('phone_e164', input.customer_phone)
        : null
    const customer = lookup ? await lookup.select('id').first() : null
    if (!customer) {
      const field = input.customer_id || !input.customer_phone ? 'customer_id' : 'customer_phone'
      const message = input.customer_phone && !input.customer_id
        ? 'No registered app user has that phone number'
        : 'Select a registered app user'
      throw new ApiError(422, 'CUSTOMER_NOT_FOUND', message, { [field]: [message] })
    }
    customerId = Number(customer.id)
  }

  try {
    const id = await db.transaction(async (trx) => {
      const [created] = await trx.table('notification_broadcasts').insert({
        request_key: input.request_key,
        title: input.title,
        body: input.body,
        title_ar: input.title_ar ?? null,
        body_ar: input.body_ar ?? null,
        audience: input.audience,
        customer_id: customerId,
        status: 'queued',
        created_by: adminId,
        created_at: new Date(),
      })
      await trx.table('audit_logs').insert({
        actor_id: adminId,
        action: 'notification.broadcast',
        entity_type: 'notification_broadcast',
        entity_id: String(created),
        changed_fields: JSON.stringify({
          audience: input.audience,
          customer_id: customerId,
          title: input.title,
          has_arabic: Boolean(input.title_ar),
        }),
        created_at: new Date(),
      })
      return Number(created)
    })
    return { id, duplicate: false }
  } catch (error) {
    // The same form submitted twice (double click, retried POST) hits the unique key.
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      const existing = await db
        .from('notification_broadcasts')
        .where('request_key', input.request_key)
        .select('id')
        .first()
      if (existing) return { id: Number(existing.id), duplicate: true }
    }
    throw error
  }
}

async function claimBroadcast(id: number) {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS)
  const claimed = await db
    .from('notification_broadcasts')
    .where('id', id)
    .where((query) =>
      query
        .where('status', 'queued')
        .orWhere((stale) =>
          stale.where('status', 'processing').where('locked_at', '<=', staleBefore)
        )
    )
    .update({ status: 'processing', locked_at: new Date(), last_error: null })
  return affected(claimed) > 0
}

function audienceCustomerIds(
  broadcast: { audience: BroadcastAudience; customer_id: number | null },
  cursor: number
) {
  const query = db
    .from('customers')
    .where('id', '>', cursor)
    .orderBy('id')
    .limit(FAN_OUT_CHUNK)
    .select('id')
  if (broadcast.audience === 'customer') query.where('id', broadcast.customer_id ?? 0)
  else if (broadcast.audience !== 'all')
    query.whereIn(
      'id',
      db.from('customer_push_tokens').where('platform', broadcast.audience).select('customer_id')
    )
  return query
}

/**
 * Fan a queued broadcast out into customer inbox rows and push outbox rows, one
 * transaction per chunk of customers using set-based INSERT ... SELECT. Every insert is
 * idempotent (unique keys + INSERT IGNORE) and progress is checkpointed on the
 * broadcast, so a crashed or restarted process resumes where it stopped.
 * Returns false when another process already owns the broadcast.
 */
export async function processBroadcast(id: number) {
  if (!(await claimBroadcast(id))) return false
  try {
    const broadcast = await db.from('notification_broadcasts').where('id', id).firstOrFail()
    let cursor = Number(broadcast.cursor_customer_id)
    for (;;) {
      const customers = (await audienceCustomerIds(broadcast, cursor)).map((row) => Number(row.id))
      if (!customers.length) break
      const now = new Date()
      const platform = ['ios', 'android'].includes(broadcast.audience) ? broadcast.audience : null
      await db.transaction(async (trx) => {
        await trx.rawQuery(
          `INSERT IGNORE INTO customer_notifications
             (customer_id, type, title, body, title_ar, body_ar, action_data, created_at, broadcast_id)
           SELECT id, ?, ?, ?, ?, ?, NULL, ?, ? FROM customers WHERE id IN (${placeholders(customers)})`,
          [
            BROADCAST_NOTIFICATION_TYPE,
            broadcast.title,
            broadcast.body,
            broadcast.title_ar ?? null,
            broadcast.body_ar ?? null,
            now,
            id,
            ...customers,
          ]
        )
        await trx.rawQuery(
          `INSERT IGNORE INTO customer_notification_outbox (notification_id, push_token_id, available_at)
           SELECT n.id, t.id, ?
           FROM customer_notifications n
           JOIN customer_push_tokens t ON t.customer_id = n.customer_id
           WHERE n.broadcast_id = ? AND n.customer_id IN (${placeholders(customers)})
           ${platform ? 'AND t.platform = ?' : ''}`,
          [now, id, ...customers, ...(platform ? [platform] : [])]
        )
        await trx
          .from('notification_broadcasts')
          .where('id', id)
          .update({ cursor_customer_id: customers[customers.length - 1], locked_at: new Date() })
      })
      cursor = customers[customers.length - 1]
    }

    const [recipients, pushes] = await Promise.all([
      db.from('customer_notifications').where('broadcast_id', id).count('* as total').first(),
      db
        .from('customer_notification_outbox as o')
        .join('customer_notifications as n', 'n.id', 'o.notification_id')
        .where('n.broadcast_id', id)
        .count('* as total')
        .first(),
    ])
    await db
      .from('notification_broadcasts')
      .where('id', id)
      .update({
        status: 'completed',
        recipient_count: count(recipients),
        push_count: count(pushes),
        completed_at: new Date(),
        locked_at: null,
      })
  } catch (error) {
    logger.error({ err: error, broadcastId: id }, 'Notification broadcast fan-out failed')
    await db
      .from('notification_broadcasts')
      .where('id', id)
      .update({
        status: 'failed',
        locked_at: null,
        last_error: (error instanceof Error ? error.message : 'Unknown error').slice(0, 1000),
      })
  }
  return true
}

/** Worker entry point: pick up queued broadcasts and any whose owner died mid-fan-out. */
export async function processPendingBroadcasts(limit = 3) {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS)
  const rows = await db
    .from('notification_broadcasts')
    .where((query) =>
      query
        .where('status', 'queued')
        .orWhere((stale) =>
          stale.where('status', 'processing').where('locked_at', '<=', staleBefore)
        )
    )
    .orderBy('id')
    .limit(limit)
    .select('id')
  let processed = 0
  for (const row of rows) if (await processBroadcast(Number(row.id))) processed++
  return processed
}

/**
 * Start a freshly queued broadcast right away from the web process so the CMS gives
 * instant feedback, without depending on the worker's polling interval. It is
 * fire-and-forget and race-safe: the claim is atomic, so the worker and this call can
 * never process the same broadcast twice. Bulk delivery stays with the worker; this
 * only drains a few batches, enough to confirm that push works.
 */
export function dispatchBroadcast(id: number) {
  if (env.get('NODE_ENV') === 'test') return
  setImmediate(() => {
    void (async () => {
      try {
        await processBroadcast(id)
        dispatchPushOutbox({ broadcastId: id })
      } catch (error) {
        logger.error({ err: error, broadcastId: id }, 'Notification broadcast dispatch failed')
      }
    })()
  })
}

async function deliveryCounts(ids: number[]) {
  const stats = new Map<number, Counts & { total: number }>()
  if (!ids.length) return stats
  const rows = await db
    .from('customer_notification_outbox as o')
    .join('customer_notifications as n', 'n.id', 'o.notification_id')
    .whereIn('n.broadcast_id', ids)
    .groupBy('n.broadcast_id')
    .select(
      'n.broadcast_id as broadcast_id',
      db.raw('COUNT(*) as total'),
      db.raw('SUM(o.delivered_at IS NOT NULL) as delivered'),
      db.raw('SUM(o.failed_at IS NOT NULL) as failed')
    )
  for (const row of rows) {
    const total = Number(row.total)
    const delivered = Number(row.delivered)
    const failed = Number(row.failed)
    stats.set(Number(row.broadcast_id), {
      total,
      delivered,
      failed,
      pending: total - delivered - failed,
      removed: 0,
    })
  }
  return stats
}

export async function listBroadcasts(pageValue: unknown) {
  const requested = Number(pageValue)
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 10000) : 1
  const total = count(await db.from('notification_broadcasts').count('* as total').first())
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page, lastPage)
  const rows = await db
    .from('notification_broadcasts as b')
    .leftJoin('users as u', 'u.id', 'b.created_by')
    .orderBy('b.id', 'desc')
    .limit(PAGE_SIZE)
    .offset((current - 1) * PAGE_SIZE)
    .select(
      'b.id',
      'b.title',
      'b.body',
      'b.title_ar',
      'b.body_ar',
      'b.audience',
      'b.status',
      'b.recipient_count',
      'b.push_count',
      'b.created_at',
      'b.last_error',
      'u.full_name as sent_by'
    )
  const stats = await deliveryCounts(rows.map((row) => Number(row.id)))
  return {
    data: rows.map((row) => {
      const delivery = stats.get(Number(row.id))
      const pushCount = Number(row.push_count)
      return {
        id: Number(row.id),
        title: String(row.title),
        body: String(row.body),
        title_ar: row.title_ar ? String(row.title_ar) : null,
        body_ar: row.body_ar ? String(row.body_ar) : null,
        audience: String(row.audience) as BroadcastAudience,
        status: String(row.status) as 'queued' | 'processing' | 'completed' | 'failed',
        recipients: Number(row.recipient_count),
        devices: pushCount,
        delivered: delivery?.delivered ?? 0,
        failed: delivery?.failed ?? 0,
        pending: delivery?.pending ?? 0,
        // Rows disappear when FCM reports a device token as unregistered.
        removed: Math.max(0, pushCount - (delivery?.total ?? 0)),
        error: row.last_error ? String(row.last_error) : null,
        sent_by: row.sent_by ? String(row.sent_by) : null,
        created_at: formatKuwaitDateTime(row.created_at),
      }
    }),
    meta: { page: current, per_page: PAGE_SIZE, total, last_page: lastPage },
  }
}

/** Audience sizes for the composer, plus a health read-out for the push pipeline. */
export async function notificationOverview() {
  const overdueBefore = new Date(Date.now() - OVERDUE_AFTER_MS)
  const pending = () =>
    db.from('customer_notification_outbox').whereNull('delivered_at').whereNull('failed_at')
  const [customers, devices, pendingTotal, overdue, queuedBroadcasts] = await Promise.all([
    db.from('customers').count('* as total').first(),
    db
      .from('customer_push_tokens')
      .groupBy('platform')
      .select(
        'platform',
        db.raw('COUNT(*) as devices'),
        db.raw('COUNT(DISTINCT customer_id) as users')
      ),
    pending().count('* as total').first(),
    pending().where('available_at', '<=', overdueBefore).count('* as total').first(),
    db
      .from('notification_broadcasts')
      .whereIn('status', ['queued', 'processing'])
      .where('created_at', '<=', overdueBefore)
      .count('* as total')
      .first(),
  ])
  const byPlatform = new Map(
    devices.map((row) => [
      String(row.platform),
      { devices: Number(row.devices), users: Number(row.users) },
    ])
  )
  const platform = (name: string) => byPlatform.get(name) ?? { devices: 0, users: 0 }
  const ios = platform('ios')
  const android = platform('android')
  return {
    configured: isPushConfigured(),
    audiences: {
      all: { users: count(customers), devices: ios.devices + android.devices },
      ios,
      android,
    },
    queue: {
      pending: count(pendingTotal),
      overdue: count(overdue),
      stalledBroadcasts: count(queuedBroadcasts),
    },
  }
}

/**
 * Registered app users for the single-user dropdown (newest first). The list is capped so
 * the page stays light; the dropdown filters it by name or phone number in the browser.
 */
export async function notificationCustomerOptions(limit = 1000) {
  const rows = await db
    .from('customers')
    .orderBy('id', 'desc')
    .limit(limit)
    .select('id', 'first_name', 'last_name', 'phone_e164')
  return rows.map((row) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    return {
      value: Number(row.id),
      label: name ? `${name} · ${row.phone_e164}` : String(row.phone_e164),
    }
  })
}
