import { useEffect } from 'react'
import AdminLayout from '../../layouts/admin_layout'

type Destination = {
  path: '/admin/places' | '/admin/categories' | '/admin/category-types'
  label: 'places' | 'categories' | 'category types'
  active: 'places' | 'categories' | 'category-types'
}

type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  destination: Destination
}

export default function SaveSuccess({ adminName, csrfToken, success, destination }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.assign(destination.path), 1800)
    return () => window.clearTimeout(timer)
  }, [destination.path])

  return (
    <AdminLayout
      title="Saved"
      active={destination.active}
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
    >
      <section
        className="save-success panel tw:mx-auto tw:my-[60px] tw:max-w-[540px] tw:px-6 tw:py-8 tw:text-center tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:[max-width:540px] tw:[margin:60px_auto] tw:[padding:var(--space-8)_var(--space-6)] tw:[text-align:center]"
        aria-labelledby="save-success-title"
      >
        <div
          className="save-success-spinner tw:mx-auto tw:mb-5 tw:size-11 tw:animate-[save-spin_0.8s_linear_infinite] tw:rounded-full tw:border-4 tw:border-brand-gold/20 tw:border-t-brand-gold tw:[width:44px] tw:[height:44px] tw:[margin:0_auto_var(--space-5)] tw:[border:4px_solid_rgba(197,_151,_62,_0.2)] tw:[border-top-color:var(--gold)] tw:[border-radius:var(--radius-full)] tw:[animation:save-spin_0.8s_linear_infinite]"
          aria-hidden="true"
        />
        <h1 id="save-success-title" className="tw:mb-[10px] tw:mt-0 tw:text-2xl">
          Your changes have been saved.
        </h1>
        <p role="status" className="tw:mb-6 tw:text-sm tw:text-brand-muted">
          Returning to {destination.label}...
        </p>
        <a className="button primary" href={destination.path}>
          Return to {destination.label}
        </a>
      </section>
    </AdminLayout>
  )
}
