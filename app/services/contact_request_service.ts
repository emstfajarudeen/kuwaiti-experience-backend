import db from '@adonisjs/lucid/services/db'
import { contactRequest } from '../serializers/customer.js'
import { ApiError } from './api_error.js'

export function contactId(value: unknown) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1)
    throw new ApiError(404, 'NOT_FOUND', 'Contact request not found')
  return id
}

export async function listContacts(page: number, status?: string) {
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new ApiError(422, 'INVALID_PAGINATION', 'Invalid page')
  if (status && !['new', 'in_progress', 'resolved'].includes(status))
    throw new ApiError(422, 'INVALID_STATUS', 'Invalid status')
  const query = db.from('contact_requests')
  if (status) query.where('status', status)
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

export async function updateContact(id: number, status: string, actorId: number) {
  await db.transaction(async (trx) => {
    const changed = await trx
      .from('contact_requests')
      .where('id', id)
      .update({ status, updated_at: new Date() })
    if (!changed) throw new ApiError(404, 'NOT_FOUND', 'Contact request not found')
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'contact.status.updated',
      entity_type: 'contact_request',
      entity_id: String(id),
      created_at: new Date(),
    })
  })
  return showContact(id)
}
