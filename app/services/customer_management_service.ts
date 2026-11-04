import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'

const pageSize = 20

export async function listCustomers(queryValue: string, pageValue: number) {
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 10000) : 1
  const queryText = queryValue.trim().slice(0, 120)
  const applyFilters = (query: ReturnType<typeof db.from>) => {
    if (queryText) {
      const pattern = `%${queryText}%`
      query.where((builder) =>
        builder
          .where('first_name', 'like', pattern)
          .orWhere('last_name', 'like', pattern)
          .orWhere('phone_e164', 'like', pattern)
          .orWhere('email', 'like', pattern)
      )
    }
    return query
  }

  const totalRow = await applyFilters(db.from('customers')).count('* as total').first()
  const total = Number(totalRow?.total ?? 0)
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, lastPage)
  const rows = await applyFilters(db.from('customers'))
    .select(
      'id',
      'first_name',
      'last_name',
      'phone_e164',
      'email',
      'phone_verified_at',
      'active',
      'profile_photo_id',
      'created_at'
    )
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(pageSize)
    .offset((currentPage - 1) * pageSize)

  return {
    rows: rows.map((row) => ({
      id: Number(row.id),
      first_name: String(row.first_name),
      last_name: String(row.last_name),
      phone_e164: String(row.phone_e164),
      email: row.email ? String(row.email) : null,
      phone_verified_at: row.phone_verified_at,
      active: Boolean(row.active),
      profile_photo_id: row.profile_photo_id ? String(row.profile_photo_id) : null,
      created_at: row.created_at,
    })),
    meta: { page: currentPage, per_page: pageSize, total, last_page: lastPage },
  }
}

export async function setCustomerActive(id: unknown, active: boolean, actorId: number) {
  const customerId = Number(id)
  if (!Number.isSafeInteger(customerId) || customerId < 1)
    throw new ApiError(404, 'NOT_FOUND', 'App user not found')
  await db.transaction(async (trx) => {
    const customer = await trx.from('customers').where('id', customerId).forUpdate().first()
    if (!customer) throw new ApiError(404, 'NOT_FOUND', 'App user not found')
    if (Boolean(customer.active) === active) return
    await trx.from('customers').where('id', customerId).update({ active, updated_at: new Date() })
    if (!active) {
      // Sign the user out everywhere.
      await trx
        .from('customer_sessions')
        .where('customer_id', customerId)
        .whereNull('revoked_at')
        .update({ revoked_at: new Date() })
    }
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: active ? 'customer.activated' : 'customer.deactivated',
      entity_type: 'customer',
      entity_id: String(customerId),
      created_at: new Date(),
    })
  })
}
