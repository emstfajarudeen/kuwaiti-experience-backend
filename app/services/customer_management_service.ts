import db from '@adonisjs/lucid/services/db'

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
      created_at: row.created_at,
    })),
    meta: { page: currentPage, per_page: pageSize, total, last_page: lastPage },
  }
}
