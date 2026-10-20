import type { HttpContext } from '@adonisjs/core/http'
import { contactStatusValidator } from '../../validators/customer.js'
import {
  contactId,
  listContacts,
  showContact,
  updateContact,
} from '../../services/contact_request_service.js'

export default class ContactsController {
  async index({ request, view, admin }: HttpContext) {
    const result = await listContacts(Number(request.input('page', 1)), request.input('status'))
    return view.render('admin/contacts/index', { ...result, admin })
  }
  async show({ params, view, admin }: HttpContext) {
    const result = await showContact(contactId(params.id))
    return view.render('admin/contacts/show', { contact: result.data, admin })
  }
  async update({ params, request, response, session, admin }: HttpContext) {
    const input = await request.validateUsing(contactStatusValidator)
    const id = contactId(params.id)
    await updateContact(id, input.status, admin.id)
    session.flash('success', 'Contact request updated')
    return response.redirect(`/admin/contact-requests/${id}`)
  }
}
