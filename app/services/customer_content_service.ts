import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { iso } from '../serializers/customer.js'
import { ApiError } from './api_error.js'
import { publicImageUrl } from './image_storage_service.js'

export async function canonicalPage(
  slug: string,
  locale: 'en' | 'ar',
  trx?: TransactionClientContract
) {
  const connection = trx ?? db
  const query = connection
    .from('pages')
    .where('slug', slug)
    .where('status', 'published')
    .where('published_at', '<=', new Date())
  if (trx) query.forUpdate()
  const page = await query.first()
  if (!page) throw new ApiError(404, 'NOT_FOUND', 'Page not found')
  const translationsQuery = connection
    .from('page_translations')
    .where('page_id', page.id)
    .orderBy('locale')
  if (trx) translationsQuery.forUpdate()
  const translations = await translationsQuery
  const selected =
    translations.find((t) => t.locale === locale) ?? translations.find((t) => t.locale === 'en')
  if (!selected) throw new ApiError(404, 'NOT_FOUND', 'Page translation not found')
  if (
    ['privacy-policy', 'terms-and-conditions'].includes(slug) &&
    /Gheyar Seller App|demo placeholder|placeholder content|Draft demo content/i.test(selected.body)
  ) {
    throw new ApiError(503, 'LEGAL_CONTENT_UNAVAILABLE', 'Approved legal content is not published')
  }
  const contentHash = createHash('sha256')
    .update(JSON.stringify([page.slug, selected.locale, selected.title, selected.body]))
    .digest('hex')
  return {
    data: {
      id: Number(page.id),
      slug: page.slug,
      status: page.status,
      published_at: iso(page.published_at),
      created_at: iso(page.created_at),
      updated_at: iso(page.updated_at),
      page_translations: translations.map((t) => ({
        id: Number(t.id),
        page_id: Number(t.page_id),
        locale: t.locale,
        title: t.title,
        body: t.body,
        seo_title: t.seo_title ?? null,
        seo_description: t.seo_description ?? null,
      })),
    },
    meta: { locale: selected.locale, content_hash: contentHash },
  }
}

export async function canonicalSettings() {
  const row = await db.from('site_settings').where('id', 1).first()
  return {
    data: {
      id: 1,
      brand_name: row?.brand_name ?? 'The Kuwaiti Experience',
      whatsapp_number: row?.whatsapp_number ?? null,
      contact_email: row?.contact_email ?? null,
      app_store_url: row?.app_store_url ?? null,
      play_store_url: row?.play_store_url ?? null,
      logo_image_url: publicImageUrl(row?.logo_image_key),
      updated_at: iso(row?.updated_at),
    },
  }
}
