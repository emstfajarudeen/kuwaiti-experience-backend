import { usePage } from '@inertiajs/react'

type SharedPageProps = {
  auth?: { permissions?: string[]; provider?: { id: number; name: string } | null } | null
}

export function useAuthorization() {
  const page = usePage()
  const permissions = new Set((page.props as unknown as SharedPageProps).auth?.permissions ?? [])
  return {
    can: (permission: string) => permissions.has(permission),
    canAll: (...required: string[]) => required.every((permission) => permissions.has(permission)),
  }
}

/** The rental provider of a provider portal login; null for staff. */
export function usePortal() {
  const page = usePage()
  return (page.props as unknown as SharedPageProps).auth?.provider ?? null
}
