import db from '@adonisjs/lucid/services/db'
import { ApiError } from './api_error.js'
import { HOME_TYPES } from './home_read_service.js'

type CardInput = {
  place_id: number
  caption_en?: string | null
  caption_ar?: string | null
  sort_order: number
  active: boolean
}

export async function saveHomeCard(input: CardInput, actorId: number, id?: number) {
  return db.transaction(async (trx) => {
    const existing = id
      ? await trx.from('home_explore_cards').where('id', id).forUpdate().first()
      : null
    if (id && !existing) throw new ApiError(404, 'NOT_FOUND', 'Home Explore card not found')
    const place = await trx.from('places').where('id', input.place_id).first()
    if (!place || !HOME_TYPES.includes(place.type))
      throw new ApiError(
        422,
        'INVALID_PLACE',
        'Choose an Attraction, Dine In, Stay or Theater place'
      )
    const duplicate = await trx.from('home_explore_cards').where('place_id', input.place_id).first()
    if (duplicate && Number(duplicate.id) !== id)
      throw new ApiError(409, 'HOME_CARD_EXISTS', 'This venue already has a Home Explore card')
    if (!id) {
      const configured = await trx.from('home_explore_cards').where('id', '>=', 0).forUpdate()
      if (configured.length >= 50)
        throw new ApiError(409, 'HOME_CARDS_FULL', 'Home can have up to 50 Explore cards')
    }
    const fields = {
      place_id: input.place_id,
      caption_en: input.caption_en || null,
      caption_ar: input.caption_ar || null,
      sort_order: input.sort_order,
      active: input.active,
      updated_at: new Date(),
    }
    let cardId = id
    if (id) await trx.from('home_explore_cards').where('id', id).update(fields)
    else {
      const [createdId] = await trx.table('home_explore_cards').insert({
        ...fields,
        created_at: new Date(),
      })
      cardId = Number(createdId)
    }
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: id ? 'home_explore_card.updated' : 'home_explore_card.created',
      entity_type: 'home_explore_card',
      entity_id: String(cardId),
      created_at: new Date(),
    })
    return cardId!
  })
}

export async function deleteHomeCard(id: number, actorId: number) {
  await db.transaction(async (trx) => {
    const row = await trx.from('home_explore_cards').where('id', id).forUpdate().first()
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Home Explore card not found')
    await trx.from('home_explore_cards').where('id', id).delete()
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'home_explore_card.deleted',
      entity_type: 'home_explore_card',
      entity_id: String(id),
      created_at: new Date(),
    })
  })
}

export async function saveFeaturedOrder(id: number, value: number | null, actorId: number) {
  await db.transaction(async (trx) => {
    const place = await trx.from('places').where('id', id).forUpdate().first()
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found')
    await trx
      .from('places')
      .where('id', id)
      .update({ featured_order: value, updated_at: new Date() })
    await trx.table('audit_logs').insert({
      actor_id: actorId,
      action: 'place.featured_order.updated',
      entity_type: 'place',
      entity_id: String(id),
      created_at: new Date(),
    })
  })
}
