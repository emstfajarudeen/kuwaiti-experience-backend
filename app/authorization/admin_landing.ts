import type { AuthorizationContext } from './types.js'
import { can } from '../services/authorization_service.js'

const destinations = [
  ['dashboard.view', '/admin'],
  ['places.view', '/admin/places'],
  ['categories.view', '/admin/categories'],
  ['category_types.view', '/admin/category-types'],
  ['countries.view', '/admin/countries'],
  ['pages.view', '/admin/pages'],
  ['place_features.view', '/admin/place-features'],
  ['movies.view', '/admin/movies'],
  ['showtimes.view', '/admin/showtimes'],
  ['contact_requests.view', '/admin/contact-requests'],
  ['home.view', '/admin/home'],
  ['transport.view', '/admin/transport'],
  ['settings.view', '/admin/settings'],
  ['customers.view', '/admin/customers'],
  ['staff.view', '/admin/users'],
  ['roles.view', '/admin/roles'],
] as const

export function adminLandingUrl(authorization: AuthorizationContext) {
  return (
    destinations.find(([permission]) => can(authorization, permission))?.[1] ?? '/admin/account'
  )
}
