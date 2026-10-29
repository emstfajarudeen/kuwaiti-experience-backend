import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'
import { pagination, positiveId } from './explore_read_service.js'
import { savedAddress } from '../serializers/customer_address.js'
import type { Row } from '../serializers/customer.js'

type AddressInput = {
  label: string
  address: string
  latitude: number
  longitude: number
  notes?: string | null
}

export async function listAddresses(customerId: number, input: Row) {
  const { page, perPage } = pagination(input)
  const query = db.from('customer_saved_addresses').where('customer_id', customerId)
  const count = await query.clone().count('* as total').first()
  const total = Number(count?.total ?? 0)
  const rows = await query
    .orderBy('id', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage)
  return {
    data: rows.map(savedAddress),
    meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) },
  }
}

export async function showAddress(customerId: number, id: unknown) {
  const row = await db
    .from('customer_saved_addresses')
    .where({ customer_id: customerId, id: positiveId(id) })
    .first()
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Saved address not found')
  return { data: savedAddress(row) }
}

export async function createAddress(customerId: number, input: AddressInput) {
  return db.transaction(async (trx) => {
    const customer = await trx.from('customers').where('id', customerId).forUpdate().first()
    if (!customer) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
    const [id] = await trx.table('customer_saved_addresses').insert({
      ...input,
      customer_id: customerId,
      notes: input.notes ?? null,
      created_at: new Date(),
    })
    const row = await trx.from('customer_saved_addresses').where('id', id).firstOrFail()
    return { data: savedAddress(row) }
  })
}

export async function updateAddress(customerId: number, id: unknown, input: Partial<AddressInput>) {
  if (!Object.values(input).some((value) => value !== undefined))
    throw new ApiError(422, 'EMPTY_UPDATE', 'Provide at least one address field to update')
  return db.transaction(async (trx) => {
    const key = { customer_id: customerId, id: positiveId(id) }
    const existing = await trx.from('customer_saved_addresses').where(key).forUpdate().first()
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Saved address not found')
    const changes = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined)
    )
    await trx
      .from('customer_saved_addresses')
      .where(key)
      .update({ ...changes, updated_at: new Date() })
    const row = await trx.from('customer_saved_addresses').where(key).firstOrFail()
    return { data: savedAddress(row) }
  })
}

export async function deleteAddress(customerId: number, id: unknown) {
  const removed = await db
    .from('customer_saved_addresses')
    .where({ customer_id: customerId, id: positiveId(id) })
    .delete()
  if (!removed) throw new ApiError(404, 'NOT_FOUND', 'Saved address not found')
}
