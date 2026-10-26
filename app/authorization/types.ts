import type { PermissionKey } from './permission_catalog.js'

export type AuthorizationContext = {
  roleIds: number[]
  roleSlugs: string[]
  isSuperAdmin: boolean
  isFullAccessAdmin: boolean
  permissions: ReadonlySet<PermissionKey>
}

export type RoutePolicy =
  | { kind: 'permissions'; all: readonly PermissionKey[] }
  | { kind: 'authenticated' }
  | { kind: 'admin_only'; all: readonly PermissionKey[] }
  | { kind: 'resource'; resource: 'private_image' | 'save_success' }
