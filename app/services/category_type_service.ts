import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'

const typeCodePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

export async function assertPlaceType(value: unknown): Promise<string> {
  if (typeof value !== 'string' || !typeCodePattern.test(value) || value.length > 32) {
    throw new ApiError(422, 'INVALID_TYPE', 'Choose a valid place type')
  }
  if (!(await db.from('category_types').where('code', value).first())) {
    throw new ApiError(422, 'INVALID_TYPE', 'Choose a valid place type')
  }
  return value
}

export async function categoryTypes() {
  return db.from('category_types').orderBy('sort_order').orderBy('code')
}

export async function publicCategoryTypes(locale: 'en' | 'ar') {
  const rows = await categoryTypes()
  return rows.map((row) => ({
    type: row.code,
    name: locale === 'ar' ? row.name_ar || row.name_en : row.name_en,
    image: row.image_id ? `/api/v1/media/${row.image_id}` : null,
    order: row.sort_order,
  }))
}

export async function updateCategoryType(
  code: string,
  input: { nameEn: string; nameAr?: string | null; imageId?: number | null; sortOrder: number },
  actorId: number
) {
  const existing = await db.from('category_types').where('code', code).first()
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Category type not found')
  if (input.imageId && !(await db.from('media').where('id', input.imageId).first())) {
    throw new ApiError(422, 'INVALID_MEDIA', 'Image not found')
  }
  await db.transaction(async (trx) => {
    await trx
      .from('category_types')
      .where('code', code)
      .update({
        name_en: input.nameEn,
        name_ar: input.nameAr || null,
        image_id: input.imageId ?? null,
        sort_order: input.sortOrder,
        updated_at: new Date(),
      })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'category_type.updated',
      entity_type: 'category_type',
      entity_id: code,
      created_at: new Date(),
    })
  })
}

export async function createCategoryType(
  input: {
    code: string
    nameEn: string
    nameAr?: string | null
    imageId?: number | null
    sortOrder: number
  },
  actorId: number
) {
  if (await db.from('category_types').where('code', input.code).first()) {
    throw new ApiError(409, 'TYPE_EXISTS', 'Category type code already exists')
  }
  if (input.imageId && !(await db.from('media').where('id', input.imageId).first())) {
    throw new ApiError(422, 'INVALID_MEDIA', 'Image not found')
  }
  await db.transaction(async (trx) => {
    await trx.table('category_types').insert({
      code: input.code,
      name_en: input.nameEn,
      name_ar: input.nameAr || null,
      image_id: input.imageId ?? null,
      sort_order: input.sortOrder,
      updated_at: new Date(),
    })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'category_type.created',
      entity_type: 'category_type',
      entity_id: input.code,
      created_at: new Date(),
    })
  })
}

export async function deleteCategoryType(code: string, actorId: number) {
  await db.transaction(async (trx) => {
    const row = await trx.from('category_types').where('code', code).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Category type not found')
    if (
      (await trx.from('categories').where('type', code).first()) ||
      (await trx.from('places').where('type', code).first())
    ) {
      throw new ApiError(409, 'TYPE_IN_USE', 'Reassign or delete categories and places first')
    }
    await trx.from('category_types').where('code', code).delete()
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'category_type.deleted',
      entity_type: 'category_type',
      entity_id: code,
      created_at: new Date(),
    })
  })
}
