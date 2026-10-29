import { permissionCatalog, type PermissionKey } from './permission_catalog.js'

const modules = [
  'places',
  'categories',
  'category_types',
  'countries',
  'pages',
  'place_features',
  'movies',
  'showtimes',
  'home',
  'transport',
] as const

const editor = [
  'dashboard.view',
  ...modules.flatMap((module) =>
    permissionCatalog
      .filter((permission) => permission.module === module)
      .filter((permission) => ['view', 'create', 'update'].includes(permission.action))
      .map(({ key }) => key)
  ),
] as PermissionKey[]

const viewer = ['dashboard.view', ...modules.map((module) => `${module}.view` as PermissionKey)]

export const defaultRoles = [
  {
    slug: 'administrator',
    name: 'Administrator',
    description: 'Manage CMS content and configuration.',
    system: true,
    permissions: permissionCatalog.map(({ key }) => key) as PermissionKey[],
  },
  {
    slug: 'editor',
    name: 'Editor',
    description: 'Create and edit content without publishing or account administration.',
    permissions: editor,
  },
  {
    slug: 'viewer',
    name: 'Viewer',
    description: 'Read CMS content.',
    permissions: viewer,
  },
] as const
