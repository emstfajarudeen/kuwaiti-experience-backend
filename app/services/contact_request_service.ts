import db from '@adonisjs/lucid/services/db'
import { contactRequest } from '../serializers/customer.js'
import logger from '@adonisjs/core/services/logger'
import { ApiError } from './api_error.js'
import { createCustomerNotification } from './customer_notification_service.js'

type NewContactRequest = {
  full_name: string
  email: string
  phone_number?: string | null
  inquiry_type?: string | null
  message: string
}

export function contactId(value: unknown) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1)
    throw new ApiError(404, 'NOT_FOUND', 'Contact request not found')
  return id
}

export async function createContactRequest(input: NewContactRequest, customerId?: number) {
  const createdAt = new Date()
  const [id] = await db.table('contact_requests').insert({
    customer_id: customerId ?? null,
    full_name: input.full_name,
    email: input.email.toLowerCase(),
    phone_number: input.phone_number ?? null,
    inquiry_type: input.inquiry_type ?? null,
    message: input.message,
    status: 'new',
    created_at: createdAt,
  })
  return { id: Number(id), created_at: createdAt.toISOString() }
}

export async function listContacts(page: number, status?: string, search?: string) {
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new ApiError(422, 'INVALID_PAGINATION', 'Invalid page')
  if (status && !['new', 'in_progress', 'resolved'].includes(status))
    throw new ApiError(422, 'INVALID_STATUS', 'Invalid status')
  const query = db.from('contact_requests')
  if (status) query.where('status', status)
  const term = search?.trim()
  if (term) {
    const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`
    query.where((builder) =>
      builder
        .where('full_name', 'like', like)
        .orWhere('email', 'like', like)
        .orWhere('phone_number', 'like', like)
        .orWhere('message', 'like', like)
    )
  }
  const count = await query.clone().count('* as total').first()
  const total = Number(count?.total ?? 0)
  const rows = await query
    .orderBy('id', 'desc')
    .limit(20)
    .offset((page - 1) * 20)
  return {
    data: rows.map(contactRequest),
    meta: { page, per_page: 20, total, last_page: Math.max(1, Math.ceil(total / 20)) },
  }
}

export async function showContact(id: number) {
  const row = await db.from('contact_requests').where('id', id).first()
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Contact request not found')
  return { data: contactRequest(row) }
}

const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  in_progress: {
    title: 'We are looking into your request / نحن نراجع طلبك',
    body: 'Our team has started working on your message. / بدأ فريقنا بالعمل على رسالتك.',
  },
  resolved: {
    title: 'Your request has been resolved / تم حل طلبك',
    body: 'We have replied to your message. Thank you for contacting us. / لقد قمنا بالرد على رسالتك. شكراً لتواصلك معنا.',
  },
}

export async function updateContact(id: number, status: string, actorId: number) {
  let notify: { customerId: number } | null = null
  await db.transaction(async (trx) => {
    const current = await trx.from('contact_requests').where('id', id).forUpdate().first()
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Contact request not found')
    await trx.from('contact_requests').where('id', id).update({ status, updated_at: new Date() })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'contact.status.updated',
      entity_type: 'contact_request',
      entity_id: String(id),
      created_at: new Date(),
    })
    if (current.customer_id && current.status !== status && STATUS_MESSAGES[status]) {
      notify = { customerId: Number(current.customer_id) }
    }
  })
  // Push is best-effort: a notification problem must never block the staff update.
  const target = notify as { customerId: number } | null
  if (target) {
    try {
      await createCustomerNotification(target.customerId, {
        type: 'contact_request_update',
        ...STATUS_MESSAGES[status],
        action_data: { screen: 'contact_request', contact_request_id: id, status },
      })
    } catch (error) {
      logger.error({ err: error, contactRequestId: id }, 'Contact status notification failed')
    }
  }
  return showContact(id)
}
