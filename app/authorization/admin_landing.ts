import type { AuthorizationContext } from './types.js'
import { can } from '../services/authorization_service.js'

const destinations = [
  ['dashboard.view', '/admin'],
  ['places.view', '/admin/places'],
  ['categories.view', '/admin/categories'],
  ['category_types.view', '/admin/category-types'],
  ['countries.view', '/admin/countries'],
  ['pages.view', '/admin/pages'],
  ['contact_requests.view', '/admin/contact-requests'],
  ['home.view', '/admin/home'],
  ['settings.view', '/admin/settings'],
  ['customers.view', '/admin/customers'],
  ['notifications.view', '/admin/notifications'],
  ['staff.view', '/admin/users'],
  ['roles.view', '/admin/roles'],
] as const

export function adminLandingUrl(authorization: AuthorizationContext) {
  return (
    destinations.find(([permission]) => can(authorization, permission))?.[1] ?? '/admin/account'
  )
}
