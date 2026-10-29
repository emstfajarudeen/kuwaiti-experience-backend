import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'

export type CountryInput = {
  nameEn: string
  nameAr?: string | null
  active: boolean
  sortOrder: number
}

export async function listCountries() {
  return db.from('countries').orderBy('sort_order').orderBy('name_en')
}

export async function countryByCode(code: string) {
  return db.from('countries').where('code', code).first()
}

export async function createCountry(input: CountryInput & { code: string }, actorId: number) {
  if (await countryByCode(input.code))
    throw new ApiError(409, 'COUNTRY_EXISTS', 'Country code already exists.')
  await db.transaction(async (trx) => {
    await trx.table('countries').insert({
      code: input.code,
      name_en: input.nameEn,
      name_ar: input.nameAr || null,
      active: input.active,
      sort_order: input.sortOrder,
      created_at: new Date(),
    })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'country.created',
      entity_type: 'country',
      entity_id: input.code,
      created_at: new Date(),
    })
  })
}

export async function updateCountry(code: string, input: CountryInput, actorId: number) {
  await db.transaction(async (trx) => {
    const existing = await trx.from('countries').where('code', code).forUpdate().first()
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Country not found.')
    await trx
      .from('countries')
      .where('code', code)
      .update({
        name_en: input.nameEn,
        name_ar: input.nameAr || null,
        active: input.active,
        sort_order: input.sortOrder,
        updated_at: new Date(),
      })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'country.updated',
      entity_type: 'country',
      entity_id: code,
      created_at: new Date(),
    })
  })
}

export async function updateCountryStatus(code: string, active: boolean, actorId: number) {
  await db.transaction(async (trx) => {
    const existing = await trx.from('countries').where('code', code).forUpdate().first()
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Country not found.')
    await trx.from('countries').where('code', code).update({ active, updated_at: new Date() })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'country.updated',
      entity_type: 'country',
      entity_id: code,
      changed_fields: JSON.stringify({ active }),
      created_at: new Date(),
    })
  })
}

export async function deleteCountry(code: string, actorId: number) {
  await db.transaction(async (trx) => {
    const existing = await trx.from('countries').where('code', code).forUpdate().first()
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Country not found.')
    await trx.from('countries').where('code', code).delete()
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'country.deleted',
      entity_type: 'country',
      entity_id: code,
      created_at: new Date(),
    })
  })
}
