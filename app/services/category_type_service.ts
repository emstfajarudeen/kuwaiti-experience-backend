import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'
import {
  deleteImages,
  publicImageUrl,
  withStoredImages,
  type PreparedImage,
} from './image_storage_service.js'

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
    image: publicImageUrl(row.image_key),
    order: row.sort_order,
  }))
}

type CategoryTypeInput = { nameEn: string; nameAr?: string | null; sortOrder: number }

/** `undefined` keeps the current tile image, `'remove'` clears it. */
type ImageChange = PreparedImage | 'remove' | undefined

function newImage(image: ImageChange) {
  return image && image !== 'remove' ? [image] : []
}

async function writeCategoryType(
  code: string,
  input: CategoryTypeInput | null,
  image: ImageChange,
  actorId: number
) {
  await withStoredImages(newImage(image), async ([key]) => {
    const released: string[] = []
    await db.transaction(async (trx) => {
      const existing = await trx.from('category_types').where('code', code).forUpdate().first()
      if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Category type not found')
      const imageKey = key ?? (image === 'remove' ? null : existing.image_key)
      if (existing.image_key && existing.image_key !== imageKey) released.push(existing.image_key)
      await trx
        .from('category_types')
        .where('code', code)
        .update({
          ...(input
            ? { name_en: input.nameEn, name_ar: input.nameAr || null, sort_order: input.sortOrder }
            : {}),
          image_key: imageKey,
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
    return { result: undefined, released }
  })
}

export async function updateCategoryType(
  code: string,
  input: CategoryTypeInput,
  actorId: number,
  image?: ImageChange
) {
  await writeCategoryType(code, input, image, actorId)
}

/** Replaces or removes only the tile image (admin image endpoints). */
export async function setCategoryTypeImage(
  code: string,
  image: PreparedImage | 'remove',
  actorId: number
) {
  await writeCategoryType(code, null, image, actorId)
}

export async function createCategoryType(
  input: CategoryTypeInput & { code: string },
  actorId: number,
  image?: PreparedImage
) {
  if (await db.from('category_types').where('code', input.code).first()) {
    throw new ApiError(409, 'TYPE_EXISTS', 'Category type code already exists')
  }
  await withStoredImages(newImage(image), async ([key]) => {
    await db.transaction(async (trx) => {
      await trx.table('category_types').insert({
        code: input.code,
        name_en: input.nameEn,
        name_ar: input.nameAr || null,
        image_key: key ?? null,
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
    return { result: undefined, released: [] }
  })
}

export async function deleteCategoryType(code: string, actorId: number) {
  const imageKey = await db.transaction(async (trx) => {
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
    return row.image_key as string | null
  })
  await deleteImages([imageKey])
}
