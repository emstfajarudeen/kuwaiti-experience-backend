import { iso, type Row } from './customer.js'
import type { PublicLocale } from '../services/public_localization.js'

export function customerNotification(row: Row, locale: PublicLocale = 'en') {
  // `title` and `body` are in the request's language (Accept-Language). Arabic is used only
  // when both Arabic texts exist, so a half-translated notification never mixes languages.
  const arabic = locale === 'ar' && Boolean(row.title_ar?.trim() && row.body_ar?.trim())
  return {
    id: Number(row.id),
    type: row.type,
    title: arabic ? row.title_ar : row.title,
    body: arabic ? row.body_ar : row.body,
    // Both languages stay available for clients that pick their own.
    title_en: row.title,
    body_en: row.body,
    title_ar: row.title_ar ?? null,
    body_ar: row.body_ar ?? null,
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
