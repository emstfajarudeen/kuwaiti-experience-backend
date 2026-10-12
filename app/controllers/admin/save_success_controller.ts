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
  async show({ params, response, view, admin }: HttpContext) {
    const destination = destinations[params.resource as keyof typeof destinations]
    if (!destination) return response.redirect('/admin')

    return view.render('admin/save_success', { admin, destination })
  }
}
