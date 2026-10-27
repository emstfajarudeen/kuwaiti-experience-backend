import type { HttpContext } from '@adonisjs/core/http'
import {
  createAddressValidator,
  updateAddressValidator,
} from '../../validators/customer_address.js'
import * as addresses from '../../services/customer_address_service.js'

export default class CustomerAddressesController {
  async index({ request, customerIdentity }: HttpContext) {
    return addresses.listAddresses(customerIdentity.customer.id, request.qs())
  }

  async show({ params, customerIdentity }: HttpContext) {
    return addresses.showAddress(customerIdentity.customer.id, params.id)
  }

  async store({ request, response, customerIdentity }: HttpContext) {
    const input = await request.validateUsing(createAddressValidator)
    return response.created(await addresses.createAddress(customerIdentity.customer.id, input))
  }

  async update({ request, params, customerIdentity }: HttpContext) {
    const input = await request.validateUsing(updateAddressValidator)
    return addresses.updateAddress(customerIdentity.customer.id, params.id, input)
  }

  async destroy({ params, response, customerIdentity }: HttpContext) {
    await addresses.deleteAddress(customerIdentity.customer.id, params.id)
    return response.noContent()
  }
}
