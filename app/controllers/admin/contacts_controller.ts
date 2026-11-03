import type { HttpContext } from '@adonisjs/core/http'
import { contactStatusValidator } from '../../validators/customer.js'
import {
  contactId,
  listContacts,
  showContact,
  updateContact,
} from '../../services/contact_request_service.js'

export default class ContactsController {
  async index({ request, inertia, session, admin }: HttpContext) {
    const status = request.input('status') as string | undefined
    const q = String(request.input('q', '')).trim().slice(0, 120)
    const result = await listContacts(Number(request.input('page', 1)), status, q)
    return inertia.render(
      'contacts/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        status: status ?? null,
        q,
        contacts: result.data.map(
          ({ id, full_name, email, phone_number, inquiry_type, status: state, created_at }) => ({
            id,
            full_name,
            email,
            phone_number,
            inquiry_type,
            status: state,
            created_at,
          })
        ),
        meta: result.meta,
      },
      { bodyClass: 'cms-body' }
    )
  }
  async show({ params, request, inertia, session, admin }: HttpContext) {
    const result = await showContact(contactId(params.id))
    const {
      id,
      full_name: fullName,
      email,
      phone_number: phoneNumber,
      inquiry_type: inquiryType,
      message,
      status,
      created_at: createdAt,
    } = result.data
    return inertia.render(
      'contacts/show',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        contact: {
          id,
          full_name: fullName,
          email,
          phone_number: phoneNumber,
          inquiry_type: inquiryType,
          message,
          status,
          created_at: createdAt,
        },
      },
      { bodyClass: 'cms-body' }
    )
  }
  async update({ params, request, response, session, admin }: HttpContext) {
    const input = await request.validateUsing(contactStatusValidator)
    const id = contactId(params.id)
    await updateContact(id, input.status, admin.id)
    session.flash('success', 'Contact request updated')
    return response.redirect(`/admin/contact-requests/${id}`)
  }
}
