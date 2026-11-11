import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import { formatDateTime, type SharedProps } from '../../components/rental_ui'

type BookingSummary = {
  id: number
  reference: string
  customer_name: string
  customer_phone: string
  vehicle_name: string
  branch_name: string
  with_driver: boolean
  pickup_at: string
  return_at: string
  days: number
  rental_amount: string
}

type Props = SharedProps & {
  providerName: string
  stats: {
    pickupsToday: number
    upcomingWeek: number
    onRent: number
    toComplete: number
    completedThisMonth: number
    vehicles: number
    liveVehicles: number
    branches: number
    activeBranches: number
  }
  upcoming: BookingSummary[]
  toComplete: BookingSummary[]
}

const cardBase =
  'stat-card tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:p-5 tw:shadow-sm tw:transition-all hover:tw:-translate-y-0.5 hover:tw:shadow-md'

function StatCard({
  href,
  label,
  value,
  note,
  tone = 'ink',
  accent = false,
}: {
  href: string
  label: string
  value: number | string
  note: string
  tone?: 'ink' | 'success' | 'navy' | 'danger'
  accent?: boolean
}) {
  const color = {
    ink: 'tw:text-brand-ink',
    success: 'tw:text-brand-success-text',
    navy: 'tw:text-brand-navy',
    danger: 'tw:text-brand-danger-text',
  }[tone]
  return (
    <a
      href={href}
      className={`${cardBase} ${
        accent
          ? 'accent tw:border-brand-gold-border tw:bg-[linear-gradient(180deg,#fff_0%,var(--gold-subtle)_100%)]'
          : 'tw:border-brand-line tw:bg-white'
      }`}
    >
      <span className="stat-label tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
        {label}
      </span>
      <strong className={`stat-value tw:my-2 tw:text-3xl tw:font-bold tw:leading-none ${color}`}>
        {value}
      </strong>
      <span
        className={`tw:text-[11px] tw:font-medium ${accent ? 'tw:text-brand-gold-deep' : 'tw:text-brand-muted'}`}
      >
        {note}
      </span>
    </a>
  )
}

function DashboardPanel({
  title,
  link,
  children,
}: {
  title: string
  link?: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <div className="tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm">
      <div className="tw:mb-4 tw:flex tw:items-center tw:justify-between tw:gap-3">
        <h2 className="tw:m-0 tw:text-base tw:font-bold tw:text-brand-ink">{title}</h2>
        {link && (
          <a
            href={link.href}
            className="tw:text-xs tw:font-semibold tw:text-brand-navy hover:tw:underline"
          >
            {link.label}
          </a>
        )}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:py-8 tw:text-center tw:text-brand-muted">
      <span className="tw:mb-2 tw:text-2xl" aria-hidden="true">
        {icon}
      </span>
      <p className="tw:m-0 tw:text-xs">{text}</p>
    </div>
  )
}

const kuwaitDay = (value: string) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Kuwait' }).format(
    new Date(value)
  )

function BookingRow({ booking, action }: { booking: BookingSummary; action?: React.ReactNode }) {
  const isToday = kuwaitDay(booking.pickup_at) === kuwaitDay(new Date().toISOString())
  return (
    <li className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-t tw:border-brand-line-subtle tw:py-3 tw:first:border-t-0 tw:first:pt-0">
      <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
        <a href={`/admin/rentals/bookings/${booking.id}`} className="tw:font-semibold">
          {booking.vehicle_name}
          {booking.with_driver ? ' · with driver' : ''}
        </a>
        <span className="tw:text-[12px] tw:text-brand-muted">
          {booking.customer_name || 'Customer'} · {booking.customer_phone} · {booking.reference}
        </span>
        <span className="tw:text-[12px] tw:text-brand-muted">
          {booking.branch_name} · {booking.days} {booking.days === 1 ? 'day' : 'days'} · KWD{' '}
          {booking.rental_amount} at pickup
        </span>
      </div>
      <div className="tw:flex tw:items-center tw:gap-3">
        <div className="tw:flex tw:flex-col tw:items-end tw:text-[13px]">
          {isToday && <span className="status published tw:mb-1">Today</span>}
          <span className="tw:font-semibold">{formatDateTime(booking.pickup_at)}</span>
          <span className="tw:text-[12px] tw:text-brand-muted">
            Return {formatDateTime(booking.return_at)}
          </span>
        </div>
        {action}
      </div>
    </li>
  )
}

export default function ProviderDashboard({
  adminName,
  csrfToken,
  success,
  error,
  providerName,
  stats,
  upcoming,
  toComplete,
}: Props) {
  const [completing, setCompleting] = useState<BookingSummary | null>(null)
  const setupSteps = [
    {
      done: stats.branches > 0,
      label: 'Add your branches',
      hint: 'Where customers pick up and return your cars.',
      href: '/admin/rentals/locations/new',
    },
    {
      done: stats.branches > 0,
      label: 'Set working hours',
      hint: 'Cars are only offered while the branch is open.',
      href: '/admin/rentals/working-hours',
    },
    {
      done: stats.vehicles > 0,
      label: 'Add your vehicles',
      hint: 'Photos, price per day, mileage and rental terms.',
      href: '/admin/rentals/vehicles/new',
    },
    {
      done: stats.liveVehicles > 0,
      label: 'Turn vehicles on',
      hint: 'Active vehicles appear in the app straight away.',
      href: '/admin/rentals/vehicles',
    },
  ]
  const setupLeft = setupSteps.filter((step) => !step.done).length
  return (
    <AdminLayout
      title="Dashboard"
      active="dashboard"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
        <div>
          <h1 className="tw:text-2xl tw:font-bold tw:tracking-tight tw:text-brand-ink">
            {providerName}
          </h1>
          <p className="tw:m-0 tw:mt-1 tw:text-[13px] tw:text-brand-muted">
            Your bookings and fleet at a glance. Changes you make go live in the app right away.
          </p>
        </div>
        <div className="tw:flex tw:flex-wrap tw:gap-2">
          <a className="button secondary" href="/admin/rentals/locations/new">
            + Add branch
          </a>
          <a className="button primary" href="/admin/rentals/vehicles/new">
            + Add vehicle
          </a>
        </div>
      </div>

      {setupLeft > 0 && (
        <div className="tw:mb-6 tw:rounded-cms-lg tw:border tw:border-brand-gold-border tw:bg-[linear-gradient(180deg,#fff_0%,var(--gold-subtle)_100%)] tw:p-5 tw:shadow-sm">
          <div className="tw:mb-3 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
            <h2 className="tw:m-0 tw:text-base tw:font-bold tw:text-brand-ink">
              Get ready to take bookings
            </h2>
            <span className="tw:text-xs tw:font-semibold tw:text-brand-gold-deep">
              {setupSteps.length - setupLeft} of {setupSteps.length} done
            </span>
          </div>
          <ol className="tw:m-0 tw:grid tw:list-none tw:grid-cols-4 tw:gap-3 tw:p-0 tw:max-[1024px]:grid-cols-2 tw:max-[600px]:grid-cols-1">
            {setupSteps.map((step, index) => (
              <li key={step.label}>
                <a
                  href={step.href}
                  className={`tw:flex tw:h-full tw:gap-3 tw:rounded-cms-sm tw:border tw:bg-white tw:p-3 tw:transition-colors hover:tw:border-brand-gold ${step.done ? 'tw:border-brand-line tw:opacity-70' : 'tw:border-brand-line'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`tw:grid tw:size-6 tw:min-w-6 tw:place-items-center tw:rounded-full tw:text-[12px] tw:font-bold ${step.done ? 'tw:bg-brand-success-text tw:text-white' : 'tw:bg-brand-navy tw:text-white'}`}
                  >
                    {step.done ? '✓' : index + 1}
                  </span>
                  <span className="tw:flex tw:flex-col">
                    <span className="tw:text-[13px] tw:font-semibold tw:text-brand-ink">
                      {step.label}
                    </span>
                    <span className="tw:text-[12px] tw:text-brand-muted">{step.hint}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="overview-stats tw:mb-6 tw:grid tw:grid-cols-4 tw:gap-4 tw:max-[1100px]:grid-cols-2 tw:max-[600px]:grid-cols-1">
        <StatCard
          accent
          href="/admin/rentals/bookings?status=confirmed"
          label="Pickups today"
          value={stats.pickupsToday}
          note={`${stats.upcomingWeek} in the next 7 days`}
        />
        <StatCard
          href="/admin/rentals/bookings?status=confirmed"
          label="On rent now"
          value={stats.onRent}
          note="Picked up, not yet returned"
          tone="navy"
        />
        <StatCard
          href="/admin/rentals/bookings?status=confirmed"
          label="To complete"
          value={stats.toComplete}
          note="Return time has passed"
          tone={stats.toComplete > 0 ? 'danger' : 'ink'}
        />
        <StatCard
          href="/admin/rentals/bookings?status=completed"
          label="Completed this month"
          value={stats.completedThisMonth}
          note="Finished rentals"
          tone="success"
        />
      </div>

      <div className="tw:mb-6 tw:grid tw:grid-cols-3 tw:gap-6 tw:max-[1024px]:grid-cols-1">
        <div className="tw:col-span-2 tw:flex tw:flex-col tw:gap-6 tw:max-[1024px]:col-span-1">
          <DashboardPanel
            title="Upcoming pickups"
            link={{ href: '/admin/rentals/bookings?status=confirmed', label: 'All bookings →' }}
          >
            {upcoming.length > 0 ? (
              <ul className="tw:m-0 tw:list-none tw:p-0">
                {upcoming.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} />
                ))}
              </ul>
            ) : (
              <EmptyState icon="🚗" text="No upcoming pickups. New bookings appear here." />
            )}
          </DashboardPanel>

          {toComplete.length > 0 && (
            <DashboardPanel title="Returned? Mark as completed">
              <p className="tw:-mt-2 tw:mb-3 tw:text-[12px] tw:text-brand-muted">
                These rentals have passed their return time. Completing them lets the customer leave
                a review.
              </p>
              <ul className="tw:m-0 tw:list-none tw:p-0">
                {toComplete.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    action={
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => setCompleting(booking)}
                      >
                        Complete
                      </button>
                    }
                  />
                ))}
              </ul>
            </DashboardPanel>
          )}
        </div>

        <DashboardPanel title="My fleet">
          <div className="tw:flex tw:flex-col tw:gap-5">
            <div>
              <div className="tw:mb-1.5 tw:flex tw:justify-between tw:text-xs">
                <span className="tw:font-medium tw:text-brand-ink">Vehicles live in the app</span>
                <span className="tw:font-bold tw:text-brand-success-text">
                  {stats.liveVehicles} of {stats.vehicles}
                </span>
              </div>
              <div className="tw:h-2.5 tw:w-full tw:overflow-hidden tw:rounded-full tw:border tw:border-brand-line tw:bg-brand-surface-subtle">
                <div
                  style={{
                    width: `${stats.vehicles ? Math.round((stats.liveVehicles / stats.vehicles) * 100) : 0}%`,
                  }}
                  className="tw:h-full tw:rounded-full tw:bg-brand-success-text tw:transition-all tw:duration-500"
                />
              </div>
            </div>
            <div>
              <div className="tw:mb-1.5 tw:flex tw:justify-between tw:text-xs">
                <span className="tw:font-medium tw:text-brand-ink">Active branches</span>
                <span className="tw:font-bold tw:text-brand-navy">
                  {stats.activeBranches} of {stats.branches}
                </span>
              </div>
              <div className="tw:h-2.5 tw:w-full tw:overflow-hidden tw:rounded-full tw:border tw:border-brand-line tw:bg-brand-surface-subtle">
                <div
                  style={{
                    width: `${stats.branches ? Math.round((stats.activeBranches / stats.branches) * 100) : 0}%`,
                  }}
                  className="tw:h-full tw:rounded-full tw:bg-brand-navy-soft tw:transition-all tw:duration-500"
                />
              </div>
            </div>
            <nav
              aria-label="Fleet shortcuts"
              className="tw:grid tw:grid-cols-1 tw:gap-2 tw:border-t tw:border-brand-line-subtle tw:pt-4"
            >
              {[
                { href: '/admin/rentals/vehicles', label: 'Manage vehicles', icon: '⛟' },
                { href: '/admin/rentals/locations', label: 'Manage branches', icon: '⌂' },
                { href: '/admin/rentals/working-hours', label: 'Working hours', icon: '◷' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="tw:flex tw:items-center tw:gap-3 tw:rounded-cms-sm tw:border tw:border-brand-line tw:px-3 tw:py-2.5 tw:text-[13px] tw:font-semibold tw:text-brand-ink tw:transition-colors hover:tw:border-brand-gold hover:tw:bg-brand-surface-subtle"
                >
                  <span aria-hidden="true" className="tw:w-[18px] tw:text-center">
                    {item.icon}
                  </span>
                  {item.label}
                  <span aria-hidden="true" className="tw:ml-auto tw:text-brand-muted">
                    →
                  </span>
                </a>
              ))}
            </nav>
          </div>
        </DashboardPanel>
      </div>

      <ConfirmModal
        open={Boolean(completing)}
        onClose={() => setCompleting(null)}
        title="Mark as completed"
        message={
          completing
            ? `${completing.reference}: mark this rental as completed? The customer can then review it.`
            : ''
        }
        action={completing ? `/admin/rentals/bookings/${completing.id}/complete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Mark as completed"
        fields={{ returnTo: '/admin' }}
      />
    </AdminLayout>
  )
}
