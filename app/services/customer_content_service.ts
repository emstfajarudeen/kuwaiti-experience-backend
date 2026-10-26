import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { iso } from '../serializers/customer.js'
import { ApiError } from './api_error.js'
import { publicImageUrl } from './image_storage_service.js'
import { pageBodyFormat, safePageBody } from './page_content_service.js'

export function serializePage(page: any, translations: any[]) {
  return {
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
      eyebrow: t.eyebrow ?? null,
      body: safePageBody(t.body, pageBodyFormat(t.body_format)),
      body_format: pageBodyFormat(t.body_format),
      seo_title: t.seo_title ?? null,
      seo_description: t.seo_description ?? null,
    })),
  }
}

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
  const english = translations.find((t) => t.locale === 'en')
  const selected = translations.find((t) => t.locale === locale) ?? english
  if (!selected) throw new ApiError(404, 'NOT_FOUND', 'Page translation not found')
  const selectedField = (field: string) => {
    const value = selected[field]
    return selected.locale === 'ar' &&
      (value === null || value === undefined || !String(value).trim())
      ? english?.[field]
      : value
  }
  const title = selectedField('title')
  const body = selectedField('body')
  const bodyFormat =
    selected.locale === 'ar' && !String(selected.body ?? '').trim()
      ? english?.body_format
      : selected.body_format
  if (
    ['privacy-policy', 'terms-and-conditions'].includes(slug) &&
    /Gheyar Seller App|demo placeholder|placeholder content|Draft demo content/i.test(body)
  ) {
    throw new ApiError(503, 'LEGAL_CONTENT_UNAVAILABLE', 'Approved legal content is not published')
  }
  const contentHash = createHash('sha256')
    .update(
      JSON.stringify([
        page.slug,
        selected.locale,
        title,
        safePageBody(body, pageBodyFormat(bodyFormat)),
      ])
    )
    .digest('hex')
  return {
    data: serializePage(page, translations),
    meta: { locale: selected.locale, content_hash: contentHash },
  }
}

export function contactInquiryTypes(value: unknown): string[] {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

export async function canonicalSettings() {
  const row = await db.from('site_settings').where('id', 1).first()
  const logoImageKey = row?.logo_image_key ?? null
  return {
    data: {
      id: 1,
      brand_name: row?.brand_name ?? 'The Kuwaiti Experience',
      direct_phone_number: row?.direct_phone_number ?? null,
      direct_phone_description: row?.direct_phone_description ?? null,
      whatsapp_number: row?.whatsapp_number ?? null,
      whatsapp_description: row?.whatsapp_description ?? null,
      contact_email: row?.contact_email ?? null,
      headquarters_name: row?.headquarters_name ?? null,
      headquarters_address: row?.headquarters_address ?? null,
      headquarters_map_url: row?.headquarters_map_url ?? null,
      contact_inquiry_types: contactInquiryTypes(row?.contact_inquiry_types),
      app_store_url: row?.app_store_url ?? null,
      play_store_url: row?.play_store_url ?? null,
      logo_image_key: logoImageKey,
      updated_at: iso(row?.updated_at),
    },
    meta: {
      images: logoImageKey
        ? [{ storage_key: logoImageKey, url: publicImageUrl(logoImageKey) }]
        : [],
    },
  }
}
