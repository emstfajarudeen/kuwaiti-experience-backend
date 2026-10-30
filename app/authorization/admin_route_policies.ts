import type { RoutePolicy } from './types.js'
import { permissionKeys, type PermissionKey } from './permission_catalog.js'

const policies = new Map<string, RoutePolicy>()
const key = (method: string, pattern: string) => `${method.toUpperCase()} ${pattern}`

function add(
  methods: string | string[],
  patterns: string[],
  permissions: string[],
  adminOnly = false
) {
  for (const permission of permissions) {
    if (!permissionKeys.has(permission))
      throw new Error(`Unknown permission in admin route policy: ${permission}`)
  }
  for (const method of Array.isArray(methods) ? methods : [methods]) {
    for (const pattern of patterns) {
      const routeKey = key(method, pattern)
      if (policies.has(routeKey)) throw new Error(`Duplicate admin route policy: ${routeKey}`)
      const required = permissions.map((value) => `${value.split('.')[0]}.view`)
      const all = [...new Set([...required, ...permissions])]
      policies.set(
        routeKey,
        adminOnly
          ? { kind: 'admin_only', all: all as PermissionKey[] }
          : { kind: 'permissions', all: all as PermissionKey[] }
      )
    }
  }
}

function moduleRoutes(
  module: string,
  browser: string[],
  v1: string[],
  v2: string[],
  actions: Record<string, string[]>
) {
  const prefix = { browser: '/admin', v1: '/api/v1/admin', v2: '/api/v2/admin' }
  const paths = [
    ...browser.map((path) => prefix.browser + path),
    ...v1.map((path) => prefix.v1 + path),
    ...v2.map((path) => prefix.v2 + path),
  ]
  for (const [action, suffixes] of Object.entries(actions)) {
    const actionPaths = [
      ...new Set(paths.filter((path) => suffixes.some((suffix) => path.endsWith(suffix)))),
    ]
    if (actionPaths.length)
      add(
        action.split(' ')[0],
        actionPaths,
        action
          .split(' ')
          .slice(1)
          .map((value) => `${module}.${value}`)
      )
  }
}

add('GET', ['/admin', '/api/v1/admin/dashboard'], ['dashboard.view'])
add('GET', ['/admin/activity-logs'], ['audit_logs.view'])
add('GET', ['/admin/transport', '/admin/place-features', '/admin/place-features/:id/edit'], [])

add('GET', ['/api/v2/admin/place-features'], ['place_features.view'])
add('POST', ['/api/v2/admin/place-features'], ['place_features.create'])
add('PUT', ['/api/v2/admin/place-features/:id'], ['place_features.update'])
add('DELETE', ['/api/v2/admin/place-features/:id'], ['place_features.delete'])

// Content modules are deliberately enumerated. A new endpoint must be added here;
// unclassified routes fail closed in the middleware.
moduleRoutes(
  'places',
  [
    '/places',
    '/places/new',
    '/places/address-search',
    '/places/address-reverse',
    '/places/:id/edit',
    '/places/:id/preview',
    '/places/:id/explore',
    '/places/:id',
    '/places/:id/save',
    '/places/:id/publish',
    '/places/:id/archive',
    '/places/:id/delete',
    '/places',
    '/places/:id/explore',
    '/places/:id/explore',
    '/places/:id',
    '/places/:id/cover',
    '/places/:id/cover',
    '/places/:id/gallery',
    '/places/:id/gallery/:imageId',
    '/places/:id/gallery/:imageId',
  ],
  [
    '/places',
    '/places/:id',
    '/places/:id/preview',
    '/places/:id',
    '/places/:id/publish',
    '/places/:id/archive',
    '/places/:id',
    '/places/:id/cover',
    '/places/:id/cover',
    '/places/:id/gallery',
    '/places/:id/gallery/:imageId',
    '/places/:id/gallery/:imageId',
  ],
  ['/places', '/places/:id', '/places/:id/explore'],
  {
    'GET view': [
      '/places',
      '/places/address-search',
      '/places/address-reverse',
      '/places/:id',
      '/places/:id/preview',
      '/places/:id/explore',
    ],
    'GET create': ['/places/new'],
    'GET update': ['/places/:id/edit'],
    'POST create': ['/places'],
    'POST update': [
      '/places/:id/save',
      '/places/:id/explore',
      '/places/:id/cover',
      '/places/:id/gallery',
    ],
    'POST publish': ['/places/:id/publish'],
    'POST archive': ['/places/:id/archive'],
    'POST delete': ['/places/:id/delete'],
    'PATCH update': ['/places/:id/explore', '/places/:id/gallery/:imageId'],
    'GET delete': [],
    'PUT update': ['/places/:id', '/places/:id/cover', '/places/:id/gallery/:imageId'],
    'DELETE update': ['/places/:id/cover', '/places/:id/gallery/:imageId'],
    'DELETE delete': ['/places/:id'],
  }
)

moduleRoutes(
  'categories',
  [
    '/categories',
    '/categories/new',
    '/categories/:id/edit',
    '/categories',
    '/categories/:id/save',
    '/categories/:id/delete',
  ],
  ['/categories', '/categories/:id', '/categories', '/categories/:id', '/categories/:id'],
  [],
  {
    'GET view': ['/categories'],
    'GET create': ['/categories/new'],
    'GET update': ['/categories/:id/edit'],
    'POST create': ['/categories'],
    'POST update': ['/categories/:id/save'],
    'POST delete': ['/categories/:id/delete'],
    'GET delete': [],
    'PUT update': ['/categories/:id'],
    'DELETE delete': ['/categories/:id'],
  }
)

moduleRoutes(
  'category_types',
  [
    '/category-types',
    '/category-types/new',
    '/category-types/:code/edit',
    '/category-types',
    '/category-types/:code/save',
    '/category-types/:code/delete',
  ],
  [
    '/category-types',
    '/category-types/:code',
    '/category-types/:code',
    '/category-types/:code/image',
    '/category-types/:code/image',
  ],
  [],
  {
    'GET view': ['/category-types'],
    'GET create': ['/category-types/new'],
    'GET update': ['/category-types/:code/edit'],
    'POST create': ['/category-types'],
    'POST update': ['/category-types/:code/save'],
    'POST delete': ['/category-types/:code/delete'],
    'GET delete': [],
    'PUT update': ['/category-types/:code', '/category-types/:code/image'],
    'DELETE delete': ['/category-types/:code'],
    'DELETE update': ['/category-types/:code/image'],
  }
)

moduleRoutes(
  'countries',
  [
    '/countries',
    '/countries/new',
    '/countries/:code/edit',
    '/countries/:code/save',
    '/countries/:code/status',
    '/countries/:code/delete',
  ],
  [],
  [],
  {
    'GET view': ['/countries'],
    'GET create': ['/countries/new'],
    'GET update': ['/countries/:code/edit'],
    'POST create': ['/countries'],
    'POST update': ['/countries/:code/save', '/countries/:code/status'],
    'POST delete': ['/countries/:code/delete'],
  }
)

moduleRoutes(
  'pages',
  [
    '/pages',
    '/pages/new',
    '/pages/:id/edit',
    '/pages',
    '/pages/:id/save',
    '/pages/:id/publish',
    '/pages/:id/archive',
    '/pages/:id/delete',
  ],
  [
    '/pages',
    '/pages/:id',
    '/pages',
    '/pages/:id',
    '/pages/:id/publish',
    '/pages/:id/archive',
    '/pages/:id',
  ],
  ['/pages/:slug'],
  {
    'GET view': ['/pages', '/pages/:id', '/pages/:slug'],
    'GET create': ['/pages/new'],
    'GET update': ['/pages/:id/edit'],
    'POST create': ['/pages'],
    'POST update': ['/pages/:id/save'],
    'POST publish': ['/pages/:id/publish'],
    'POST archive': ['/pages/:id/archive'],
    'POST delete': ['/pages/:id/delete'],
    'GET delete': [],
    'PUT update': ['/pages/:id'],
    'DELETE delete': ['/pages/:id'],
  }
)

moduleRoutes(
  'movies',
  [
    '/movies',
    '/movies/new',
    '/movies/:id/edit',
    '/movies',
    '/movies/:id/save',
    '/movies/:id/delete',
  ],
  [],
  [
    '/movies',
    '/movies/:id',
    '/movies',
    '/movies/:id',
    '/movies/:id/poster',
    '/movies/:id/poster',
    '/movies/:id',
  ],
  {
    'GET view': ['/movies', '/movies/:id'],
    'GET create': ['/movies/new'],
    'GET update': ['/movies/:id/edit'],
    'POST create': ['/movies'],
    'POST update': ['/movies/:id/save'],
    'POST delete': ['/movies/:id/delete'],
    'GET delete': [],
    'PUT update': ['/movies/:id', '/movies/:id/poster'],
    'DELETE update': ['/movies/:id/poster'],
    'DELETE delete': ['/movies/:id'],
  }
)

moduleRoutes(
  'showtimes',
  [
    '/showtimes',
    '/showtimes',
    '/showtimes/:id/edit',
    '/showtimes/:id/save',
    '/showtimes/:id/delete',
  ],
  [],
  ['/showtimes', '/showtimes', '/showtimes/:id', '/showtimes/:id', '/showtimes/:id'],
  {
    'GET view': ['/showtimes'],
    'GET update': ['/showtimes/:id/edit'],
    'POST create': ['/showtimes'],
    'POST update': ['/showtimes/:id/save'],
    'POST delete': ['/showtimes/:id/delete'],
    'GET delete': [],
    'PUT update': ['/showtimes/:id'],
    'DELETE delete': ['/showtimes/:id'],
  }
)

moduleRoutes(
  'contact_requests',
  ['/contact-requests', '/contact-requests/:id', '/contact-requests/:id/status'],
  [],
  ['/contact-requests', '/contact-requests/:id', '/contact-requests/:id'],
  {
    'GET view': ['/contact-requests', '/contact-requests/:id'],
    'POST update': ['/contact-requests/:id/status'],
    'PATCH update': ['/contact-requests/:id'],
  }
)

moduleRoutes(
  'home',
  ['/home', '/home'],
  ['/home', '/home', '/home/hero-image', '/home/hero-image'],
  [
    '/home',
    '/home',
    '/home/hero-image',
    '/home/hero-image',
    '/home-explore-cards',
    '/home-explore-cards/:id',
    '/home-explore-cards',
    '/home-explore-cards/:id',
    '/home-explore-cards/:id',
  ],
  {
    'GET view': ['/home', '/home-explore-cards', '/home-explore-cards/:id'],
    'POST update': ['/home', '/home-explore-cards'],
    'GET delete': [],
    'PATCH update': ['/home'],
    'PUT update': ['/home/hero-image', '/home-explore-cards/:id'],
    'DELETE update': ['/home/hero-image', '/home-explore-cards/:id'],
  }
)

moduleRoutes(
  'transport',
  [],
  [
    '/transport/locations',
    '/transport/locations',
    '/transport/locations/:id',
    '/transport/locations/:id',
  ],
  [],
  {
    'GET view': ['/transport/locations'],
    'POST create': ['/transport/locations'],
    'GET delete': [],
    'PUT update': ['/transport/locations/:id'],
    'DELETE delete': ['/transport/locations/:id'],
  }
)

moduleRoutes(
  'settings',
  ['/settings', '/settings', '/app-config', '/app-config'],
  ['/settings', '/settings', '/settings/logo', '/settings/logo'],
  ['/site'],
  {
    'GET view': ['/settings', '/site', '/app-config'],
    'POST update': ['/settings', '/app-config'],
    'PATCH update': ['/settings'],
    'PUT update': ['/settings/logo'],
    'DELETE update': ['/settings/logo'],
  }
)

add(
  'PATCH',
  ['/api/v2/admin/places/:id/featured'],
  ['places.view', 'places.update', 'home.view', 'home.update']
)

add('GET', ['/admin/customers'], ['customers.view'])
add('GET', ['/admin/users'], ['staff.view'])
add('GET', ['/admin/users/new', '/admin/users/:id/edit'], ['staff.view', 'staff.manage'], true)
add(
  'POST',
  [
    '/admin/users',
    '/admin/users/:id/save',
    '/admin/users/:id/delete',
    '/admin/users/:id/send-reset',
  ],
  ['staff.view', 'staff.manage', 'roles.assign'],
  true
)
add('GET', ['/admin/roles'], ['roles.view'])
add('GET', ['/admin/roles/:id'], ['roles.view'])
add('GET', ['/admin/roles/new', '/admin/roles/:id/edit'], ['roles.view', 'roles.manage'], true)
add('POST', ['/admin/roles'], ['roles.view', 'roles.manage', 'roles.assign'], true)
add(
  'POST',
  ['/admin/roles/:id/save', '/admin/roles/:id/delete'],
  ['roles.view', 'roles.manage', 'roles.assign'],
  true
)
for (const method of ['GET', 'POST', 'PATCH']) {
  for (const pattern of [
    ...(method === 'GET' ? ['/admin/account', '/api/v1/admin/auth/me'] : []),
    ...(method === 'POST'
      ? ['/admin/account/password', '/admin/logout', '/api/v1/admin/auth/logout']
      : []),
    ...(method === 'PATCH' ? ['/api/v1/admin/auth/password'] : []),
  ]) {
    policies.set(key(method, pattern), { kind: 'authenticated' })
  }
}
policies.set(key('GET', '/admin/images/:key'), { kind: 'resource', resource: 'private_image' })
policies.set(key('GET', '/api/v1/admin/images/:key'), {
  kind: 'resource',
  resource: 'private_image',
})
policies.set(key('GET', '/admin/:resource/saved'), { kind: 'resource', resource: 'save_success' })

export function resolveAdminRoutePolicy(method: string, pattern: string) {
  return policies.get(key(method, pattern))
}

export function registeredAdminPolicyKeys() {
  return new Set(policies.keys())
}
