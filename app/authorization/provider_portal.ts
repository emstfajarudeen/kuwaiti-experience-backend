import db from '@adonisjs/lucid/services/db'
import type { PermissionKey } from './permission_catalog.js'
import type { AuthorizationContext } from './types.js'

/**
 * Rental provider portal logins use the same CMS pages as staff, limited to their own
 * provider. Access is deny-by-default: a provider may only open the routes listed here,
 * and every one of them checks that the record belongs to the provider.
 */
const allowed = new Set([
  'GET /admin',
  'GET /admin/account',
  'POST /admin/account/password',
  'POST /admin/logout',
  'GET /admin/images/:key',
  // Bookings: view and mark completed.
  'GET /admin/rentals/bookings',
  'GET /admin/rentals/bookings/:id',
  'POST /admin/rentals/bookings/:id/complete',
  // Vehicles.
  'GET /admin/rentals/vehicles',
  'GET /admin/rentals/vehicles/new',
  'POST /admin/rentals/vehicles',
  'GET /admin/rentals/vehicles/:id/edit',
  'POST /admin/rentals/vehicles/:id/save',
  'POST /admin/rentals/vehicles/:id/status',
  'POST /admin/rentals/vehicles/:id/delete',
  // Branches, working hours and closed dates.
  'GET /admin/rentals/locations',
  'GET /admin/rentals/working-hours',
  'GET /admin/rentals/locations/new',
  'POST /admin/rentals/locations',
  'GET /admin/rentals/locations/:id/edit',
  'POST /admin/rentals/locations/:id/save',
  'GET /admin/rentals/locations/:id/hours',
  'POST /admin/rentals/locations/:id/hours',
  'POST /admin/rentals/locations/:id/status',
  'POST /admin/rentals/locations/:id/delete',
  'GET /admin/rentals/address-search',
  'GET /admin/rentals/address-reverse',
])

export function providerMayUse(method: string, pattern: string) {
  return allowed.has(`${method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase()} ${pattern}`)
}

/** What a provider login can do; the pages use these to show or hide actions. */
const providerPermissions: PermissionKey[] = [
  'rentals.view',
  'rentals.create',
  'rentals.update',
  'rentals.delete',
  'rentals.publish',
  'rental_bookings.view',
]

export function providerAuthorization(): AuthorizationContext {
  return {
    roleIds: [],
    roleSlugs: ['rental_provider'],
    isSuperAdmin: false,
    isFullAccessAdmin: false,
    permissions: new Set(providerPermissions),
  }
}

/** True when a stored image is the provider's logo or a photo of one of its vehicles. */
export async function providerOwnsImage(providerId: number, key: string) {
  const [logo, cover, gallery] = await Promise.all([
    db.from('rental_providers').where('id', providerId).where('logo_image_key', key).first(),
    db
      .from('rental_vehicles')
      .where('provider_id', providerId)
      .where('cover_image_key', key)
      .first(),
    db
      .from('rental_vehicle_images as i')
      .join('rental_vehicles as v', 'v.id', 'i.vehicle_id')
      .where('v.provider_id', providerId)
      .where('i.storage_key', key)
      .first(),
  ])
  return Boolean(logo || cover || gallery)
}
