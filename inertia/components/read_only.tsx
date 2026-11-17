import type { ReactNode } from 'react'
import { useAuthorization } from '../lib/authorization'

/**
 * Staff with only the view permission open an existing record's edit page read-only: the fields
 * are locked and nothing can be saved. The server still requires the update permission to save.
 */
export function useReadOnly(updatePermission: string, existing: boolean) {
  const { can } = useAuthorization()
  return existing && !can(updatePermission)
}

export function ReadOnlyNotice({ thing }: { thing: string }) {
  return (
    <div
      role="note"
      className="tw:mb-6 tw:rounded-cms-sm tw:border tw:border-brand-line tw:bg-white tw:px-4 tw:py-3 tw:text-[14px] tw:text-brand-muted"
    >
      You can view this {thing}, but not change it. Ask a Super Admin if you need edit access.
    </div>
  )
}

/** Disables every native field and button inside, without changing the layout. */
export function ReadOnlyFieldset({
  readOnly,
  children,
}: {
  readOnly: boolean
  children: ReactNode
}) {
  return (
    <fieldset disabled={readOnly} className="tw:contents">
      {children}
    </fieldset>
  )
}

/** The first column of a CMS list: a pencil for editors, an eye for view-only staff. */
export function RowEditLink({
  href,
  label,
  canEdit,
}: {
  href: string
  label: string
  canEdit: boolean
}) {
  return (
    <a
      href={href}
      className="action-pencil-btn"
      aria-label={`${canEdit ? 'Edit' : 'View'} ${label}`}
      title={canEdit ? 'Edit' : 'View'}
    >
      {canEdit ? (
        '✎'
      ) : (
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </a>
  )
}
