import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { optionalCustomer } from '../../middleware/customer_auth_middleware.js'
import * as read from '../../services/explore_read_service.js'
import * as write from '../../services/explore_write_service.js'
import { localizePublicData, publicLanguage } from '../../services/public_localization.js'

export default class ExploreController {
  async hub(ctx: HttpContext) {
    await optionalCustomer(ctx)
    const result = await read.exploreHub()
    return {
      ...result,
      data: localizePublicData(result.data, publicLanguage(ctx.request.header('accept-language'))),
    }
  }
  async categories(ctx: HttpContext) {
    await optionalCustomer(ctx)
    const locale = publicLanguage(ctx.request.header('accept-language'))
    const result = await read.categories(ctx.request.input('type'))
    return { ...result, data: localizePublicData(result.data, locale) }
  }
  async features(ctx: HttpContext) {
    await optionalCustomer(ctx)
    const result = await read.features(ctx.request.input('type'))
    return {
      ...result,
      data: localizePublicData(result.data, publicLanguage(ctx.request.header('accept-language'))),
    }
  }
  async places(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    const locale = publicLanguage(ctx.request.header('accept-language'))
    const result = await read.places(ctx.request.qs(), identity?.customer.id)
    return { ...result, data: localizePublicData(result.data, locale) }
  }
  async place(ctx: HttpContext) {
    const identity = await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    const result = await read.showPlace(ctx.params.slug, identity?.customer.id)
    return {
      ...result,
      data: localizePublicData(result.data, publicLanguage(ctx.request.header('accept-language'))),
    }
  }
  async showtimes(ctx: HttpContext) {
    await optionalCustomer(ctx)
    ctx.response.header('Cache-Control', 'no-store')
    const result = await read.showtimes(ctx.request.qs(), ctx.params.slug)
    return {
      ...result,
      included: localizePublicData(
        result.included,
        publicLanguage(ctx.request.header('accept-language'))
      ),
    }
  }
  async saved({ request, customerIdentity }: HttpContext) {
    const locale = publicLanguage(request.header('accept-language'))
    const [result, hub] = await Promise.all([
      read.places(request.qs(), customerIdentity.customer.id, false, true),
      read.exploreHub(),
    ])
    const images = new Map(
      [...result.meta.images, ...hub.meta.images].map((image) => [image.storage_key, image])
    )
    return {
      ...result,
      data: {
        category_types: localizePublicData(hub.data.category_types, locale),
        places: localizePublicData(result.data, locale),
      },
      meta: {
        ...result.meta,
        images: [...images.values()],
      },
    }
  }
  async save({ params, customerIdentity }: HttpContext) {
    return write.savePlaceBookmark(customerIdentity.customer.id, read.positiveId(params.id))
  }
  async unsave({ params, customerIdentity, response }: HttpContext) {
    await db
      .from('customer_saved_places')
      .where({ customer_id: customerIdentity.customer.id, place_id: read.positiveId(params.id) })
      .delete()
    return response.noContent()
  }
}
