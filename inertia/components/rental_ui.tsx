import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import { useAuthorization } from '../lib/authorization'

export type SharedProps = {
  adminName: string
  csrfToken: string
  success?: string | null
  error?: string | null
}

const tabs = [
  { href: '/admin/rentals/vehicles', label: 'Vehicles', key: 'vehicles' },
  { href: '/admin/rentals/providers', label: 'Providers', key: 'providers' },
  { href: '/admin/rentals/locations', label: 'Locations', key: 'locations' },
  { href: '/admin/rentals/settings', label: 'Settings', key: 'settings' },
]

/** Sub-navigation across the rental catalogue screens. */
export function RentalTabs({ current }: { current: string }) {
  return (
    <nav className="tw:mb-5 tw:flex tw:flex-wrap tw:gap-2" aria-label="Rental catalogue">
      {tabs.map((tab) => (
        <a
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? 'page' : undefined}
          className={`tw:rounded-full tw:border tw:px-4 tw:py-1.5 tw:text-[13px] tw:font-semibold ${
            tab.key === current
              ? 'tw:border-brand-navy-deep tw:bg-brand-navy-deep tw:text-white'
              : 'tw:border-brand-line tw:bg-white tw:text-brand-navy-deep'
          }`}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  )
}

export function Panel({
  title,
  children,
  actions,
}: {
  title?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="panel tw:mb-6 tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-6 tw:shadow-[0_4px_14px_rgba(0,23,46,0.06)]">
      {(title || actions) && (
        <div className="tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function useFieldErrors() {
  const errors = (usePage().props as unknown as { errors?: Record<string, string | string[]> })
    .errors
  return (name: string) => {
    const value = errors?.[name]
    return Array.isArray(value) ? value[0] : value
  }
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="field-error" role="alert">
      {message}
    </p>
  )
}

/** Plain labelled input for native multipart forms. */
export function Field({
  label,
  name,
  error,
  required,
  children,
  hint,
}: {
  label: string
  name: string
  error?: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="tw:flex tw:flex-col tw:gap-1" htmlFor={name}>
      <span className="tw:text-[13px] tw:font-semibold">
        {label}
        {required && <span className="tw:text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="tw:text-[12px] tw:text-brand-muted">{hint}</span>}
      <FieldError message={error} />
    </label>
  )
}

export const inputClass =
  'tw:w-full tw:rounded-cms-sm tw:border tw:border-brand-line tw:bg-white tw:px-3 tw:py-2 tw:text-[14px]'

const statusLabels: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Hold expired',
  refund_required: 'Refund required',
  draft: 'Draft',
  published: 'Published',
  initiated: 'Started',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
}
const statusTone: Record<string, string> = {
  confirmed: 'published',
  completed: 'published',
  published: 'published',
  paid: 'published',
  pending_payment: 'draft',
  initiated: 'draft',
  draft: 'draft',
  refund_required: 'archived',
  failed: 'archived',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status ${statusTone[status] ?? 'archived'}`}>
      {statusLabels[status] ?? status}
    </span>
  )
}

export const bookingStatusOptions = [
  'pending_payment',
  'confirmed',
  'completed',
  'cancelled',
  'expired',
  'refund_required',
].map((value) => ({ value, label: statusLabels[value] }))

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kuwait',
  }).format(new Date(value))
}

/** Hidden CSRF field + form posting for small action forms. */
export function ActionForm({
  action,
  csrfToken,
  children,
  confirm,
  className,
}: {
  action: string
  csrfToken: string
  children: ReactNode
  confirm?: string
  className?: string
}) {
  return (
    <form
      method="post"
      action={action}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
    >
      <input type="hidden" name="_csrf" value={csrfToken} />
      {children}
    </form>
  )
}

export function useCan() {
  return useAuthorization().can
}
