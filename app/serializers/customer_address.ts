import { iso, type Row } from './customer.js'

export function savedAddress(row: Row) {
  return {
    id: Number(row.id),
    customer_id: Number(row.customer_id),
    label: row.label,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    notes: row.notes ?? null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}
