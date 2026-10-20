export type Row = Record<string, any>

export function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return new Date(value as string | Date).toISOString()
}

export function customer(row: Row) {
  return {
    id: Number(row.id),
    phone_e164: String(row.phone_e164),
    first_name: String(row.first_name),
    last_name: String(row.last_name),
    email: row.email ?? null,
    profile_photo_id: row.profile_photo_id ?? null,
    phone_verified_at: iso(row.phone_verified_at),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}

export function contactRequest(row: Row) {
  return {
    id: Number(row.id),
    customer_id: row.customer_id === null ? null : Number(row.customer_id),
    full_name: row.full_name,
    email: row.email,
    message: row.message,
    status: row.status,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}
