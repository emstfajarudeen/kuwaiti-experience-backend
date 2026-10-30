import { iso, type Row } from './customer.js'

export function customerNotification(row: Row) {
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title,
    body: row.body,
    action_data:
      row.action_data === null || row.action_data === undefined
        ? null
        : typeof row.action_data === 'string'
          ? JSON.parse(row.action_data)
          : row.action_data,
    created_at: iso(row.created_at),
    read_at: iso(row.read_at),
  }
}
