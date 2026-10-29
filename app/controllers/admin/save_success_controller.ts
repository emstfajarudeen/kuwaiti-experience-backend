import type { HttpContext } from '@adonisjs/core/http'

const destinations = {
  'places': { path: '/admin/places', label: 'places', active: 'places' },
  'categories': { path: '/admin/categories', label: 'categories', active: 'categories' },
  'category-types': {
    path: '/admin/category-types',
    label: 'category types',
    active: 'category-types',
  },
} as const

export default class AdminSaveSuccessController {
  async show({ params, response, session }: HttpContext) {
    const destination = destinations[params.resource as keyof typeof destinations]
    if (!destination) return response.redirect('/admin')

    // Preserve old saved URLs without consuming their success message on this redirect.
    const success = session.flashMessages.get('success')
    if (typeof success === 'string') session.flash('success', success)
    return response.redirect(destination.path)
  }
}
