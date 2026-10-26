import { usePage } from '@inertiajs/react'

type SharedPageProps = { auth?: { permissions?: string[] } | null }

export function useAuthorization() {
  const page = usePage()
  const permissions = new Set((page.props as unknown as SharedPageProps).auth?.permissions ?? [])
  return {
    can: (permission: string) => permissions.has(permission),
    canAll: (...required: string[]) => required.every((permission) => permissions.has(permission)),
  }
}
