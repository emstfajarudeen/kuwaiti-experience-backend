const permissionDefinitions = [
  { key: 'dashboard.view', module: 'dashboard', action: 'view', label: 'View dashboard' },
  ...(['view', 'create', 'update', 'delete'] as const).map((action) => ({
    key: `places.${action}` as const,
    module: 'places',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} places`,
  })),
  // The places list turns a place on (publish) or off (archive, shown as "Inactive").
  { key: 'places.publish', module: 'places', action: 'publish', label: 'Turn places on (active)' },
  {
    key: 'places.archive',
    module: 'places',
    action: 'archive',
    label: 'Turn places off (inactive)',
  },
  ...(['view', 'create', 'update', 'delete'] as const).flatMap((action) =>
    (['categories', 'category_types', 'countries', 'pages', 'place_features'] as const).map(
      (module) => ({
        key: `${module}.${action}` as const,
        module,
        action,
        label: `${action[0].toUpperCase()}${action.slice(1)} ${module.replace('_', ' ')}`,
      })
    )
  ),
  // `hidden`: used by the admin API but with no CMS screen yet, so the roles page doesn't offer
  // them. Roles that already have them keep them.
  ...(['publish', 'archive'] as const).map((action) => ({
    key: `pages.${action}` as const,
    module: 'pages',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} pages`,
    hidden: true as const,
  })),
  ...(['view', 'create', 'update', 'delete', 'publish', 'archive'] as const).map((action) => ({
    key: `movies.${action}` as const,
    module: 'movies',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} movies`,
    hidden: true as const,
  })),
  ...(['view', 'create', 'update', 'delete', 'publish', 'cancel'] as const).map((action) => ({
    key: `showtimes.${action}` as const,
    module: 'showtimes',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} showtimes`,
    hidden: true as const,
  })),
  {
    key: 'contact_requests.view',
    module: 'contact_requests',
    action: 'view',
    label: 'View contact requests',
  },
  {
    key: 'contact_requests.update',
    module: 'contact_requests',
    action: 'update',
    label: 'Update contact requests',
  },
  { key: 'home.view', module: 'home', action: 'view', label: 'View homepage' },
  { key: 'home.update', module: 'home', action: 'update', label: 'Update homepage' },
  ...(['view', 'create', 'update', 'delete'] as const).map((action) => ({
    key: `transport.${action}` as const,
    module: 'transport',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} transport locations`,
  })),
  { key: 'settings.view', module: 'settings', action: 'view', label: 'View site settings' },
  { key: 'settings.update', module: 'settings', action: 'update', label: 'Update site settings' },
  ...(['view', 'create', 'update', 'delete', 'publish', 'moderate'] as const).map((action) => ({
    key: `videos.${action}` as const,
    module: 'videos',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} videos`,
  })),
  ...(['view', 'create', 'update', 'delete', 'publish'] as const).map((action) => ({
    key: `rentals.${action}` as const,
    module: 'rentals',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} rental catalogue`,
  })),
  ...(['view', 'update', 'refund'] as const).map((action) => ({
    key: `rental_bookings.${action}` as const,
    module: 'rental_bookings',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} rental bookings`,
  })),
  ...(['view', 'export'] as const).map((action) => ({
    key: `rental_reports.${action}` as const,
    module: 'rental_reports',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} rental reports`,
  })),
  ...(['view', 'update', 'delete'] as const).map((action) => ({
    key: `rental_reviews.${action}` as const,
    module: 'rental_reviews',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} rental reviews`,
  })),
  {
    key: 'customers.view',
    module: 'customers',
    action: 'view',
    label: 'View registered app users',
  },
  {
    key: 'customers.update',
    module: 'customers',
    action: 'update',
    label: 'Activate or deactivate app users',
  },
  {
    key: 'notifications.view',
    module: 'notifications',
    action: 'view',
    label: 'View notifications',
  },
  {
    key: 'notifications.send',
    module: 'notifications',
    action: 'send',
    label: 'Send notifications',
  },
  { key: 'staff.view', module: 'staff', action: 'view', label: 'View staff' },
  { key: 'staff.manage', module: 'staff', action: 'manage', label: 'Manage staff', reserved: true },
  { key: 'roles.view', module: 'roles', action: 'view', label: 'View roles' },
  { key: 'roles.manage', module: 'roles', action: 'manage', label: 'Manage roles', reserved: true },
  { key: 'roles.assign', module: 'roles', action: 'assign', label: 'Assign roles', reserved: true },
  { key: 'audit_logs.view', module: 'audit_logs', action: 'view', label: 'View activity log' },
] as const

export const permissionCatalog = Object.freeze(
  permissionDefinitions.map((permission) => ({
    ...permission,
    description: `Allows ${permission.label.toLowerCase()} in the CMS.`,
  }))
)

export type PermissionKey = (typeof permissionCatalog)[number]['key']
export type PermissionDefinition = (typeof permissionCatalog)[number]
export const permissionKeys = new Set<string>(permissionCatalog.map(({ key }) => key))
/** Permissions the roles page doesn't show (no CMS screen for them yet). */
export const hiddenPermissionKeys = new Set<string>(
  permissionCatalog.filter((permission) => 'hidden' in permission).map(({ key }) => key)
)
export const reservedPermissionKeys = new Set<string>(
  permissionCatalog.filter((permission) => 'reserved' in permission).map(({ key }) => key)
)

export function validatePermissionCatalog() {
  const keys = permissionCatalog.map(({ key }) => key)
  if (new Set(keys).size !== keys.length)
    throw new Error('Duplicate key in RBAC permission catalogue')
  for (const key of keys) {
    if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid permission key in catalogue: ${key}`)
    }
  }
}
