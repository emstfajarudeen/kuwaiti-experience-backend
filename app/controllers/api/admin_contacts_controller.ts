import type { HttpContext } from '@adonisjs/core/http'
import { contactStatusValidator } from '../../validators/customer.js'
import {
  contactId,
  listContacts,
  showContact,
  updateContact,
} from '../../services/contact_request_service.js'

export default class AdminContactsController {
  async index({ request }: HttpContext) {
    return listContacts(Number(request.input('page', 1)), request.input('status'))
  }
  async show({ params }: HttpContext) {
    return showContact(contactId(params.id))
  }
  async update({ params, request, admin }: HttpContext) {
    const input = await request.validateUsing(contactStatusValidator)
    return updateContact(contactId(params.id), input.status, admin.id)
  }
}
