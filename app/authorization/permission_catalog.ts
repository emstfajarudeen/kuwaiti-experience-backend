const permissionDefinitions = [
  { key: 'dashboard.view', module: 'dashboard', action: 'view', label: 'View dashboard' },
  ...(['view', 'create', 'update', 'delete', 'publish', 'archive'] as const).map((action) => ({
    key: `places.${action}` as const,
    module: 'places',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} places`,
  })),
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
  ...(['publish', 'archive'] as const).map((action) => ({
    key: `pages.${action}` as const,
    module: 'pages',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} pages`,
  })),
  ...(['view', 'create', 'update', 'delete', 'publish', 'archive'] as const).map((action) => ({
    key: `movies.${action}` as const,
    module: 'movies',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} movies`,
  })),
  ...(['view', 'create', 'update', 'delete', 'publish', 'cancel'] as const).map((action) => ({
    key: `showtimes.${action}` as const,
    module: 'showtimes',
    action,
    label: `${action[0].toUpperCase()}${action.slice(1)} showtimes`,
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
  {
    key: 'customers.view',
    module: 'customers',
    action: 'view',
    label: 'View registered app users',
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
