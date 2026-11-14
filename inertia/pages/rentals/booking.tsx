import { Button, Input, Rate, Select, Switch } from 'antd'
import { router } from '@inertiajs/react'
import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import {
  ActionForm,
  formatDateTime,
  Panel,
  StatusBadge,
  useCan,
  usePortal,
  type SharedProps,
} from '../../components/rental_ui'

type Payment = {
  id: number
  invoice_id: string
  payment_id: string | null
  method: string | null
  amount: string
  status: string
  refund_reference: string | null
  paid_at: string | null
  refunded_at: string | null
  created_at: string
}

type Props = SharedProps & {
  booking: {
    id: number
    reference: string
    status: string
    customer: { id: number; name: string; phone: string; email: string | null }
    vehicle_name: string
    provider_name: string
    provider_phone: string | null
    provider_email: string | null
    pickup_location: string
    return_location: string
    pickup_at: string
    return_at: string
    with_driver: boolean
    driver_id: number | null
    days: number
    rental_amount: string
    booking_fee: string
    notes: string | null
    hold_expires_at: string | null
    cancelled_by: string | null
    cancel_reason: string | null
    created_at: string
    confirmed_at: string | null
    cancelled_at: string | null
    completed_at: string | null
  }
  payments: Payment[]
  driverChoices: DriverChoice[]
  review: {
    id: number
    rating: number
    comment: string | null
    status: 'published' | 'hidden'
    created_at: string
  } | null
  providerEmails: {
    id: number
    kind: 'confirmed' | 'cancelled'
    recipient: string | null
    status: 'sent' | 'failed' | 'skipped'
    error: string | null
    created_at: string
  }[]
}

type DriverChoice = {
  id: number
  name: string
  phone: string | null
  photo_url: string | null
  active: boolean
  busy: boolean
}

function DriverAvatar({ driver }: { driver: DriverChoice }) {
  return driver.photo_url ? (
    <img src={driver.photo_url} alt="" className="tw:size-12 tw:rounded-full tw:object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="tw:grid tw:size-12 tw:place-items-center tw:rounded-full tw:bg-brand-navy tw:text-[16px] tw:font-bold tw:text-white"
    >
      {driver.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Assign the provider's driver to a with-driver booking; the customer is notified. */
function DriverPanel({
  booking,
  choices,
  canAssign,
  csrfToken,
}: {
  booking: { id: number; status: string; driver_id: number | null }
  choices: DriverChoice[]
  canAssign: boolean
  csrfToken: string
}) {
  const current = choices.find((driver) => driver.id === booking.driver_id) ?? null
  const [picked, setPicked] = useState<number | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const editable = canAssign && booking.status === 'confirmed'
  const post = (driverId: number | null) =>
    router.post(
      `/admin/rentals/bookings/${booking.id}/driver`,
      { driverId: driverId ?? '', _csrf: csrfToken },
      {
        preserveScroll: true,
        onStart: () => setSaving(true),
        onFinish: () => {
          setSaving(false)
          setPicked(undefined)
        },
      }
    )
  return (
    <Panel title="Driver">
      {current ? (
        <div className="tw:mb-4 tw:flex tw:items-center tw:gap-4">
          <DriverAvatar driver={current} />
          <div className="tw:flex tw:flex-col">
            <strong className="tw:text-[15px]">{current.name}</strong>
            <span className="tw:text-[13px] tw:text-brand-muted">
              {current.phone ?? 'No phone saved'}
            </span>
          </div>
          <span className="status published tw:ml-auto">Assigned</span>
        </div>
      ) : (
        <div className="tw:mb-4 tw:rounded-cms-sm tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-3 tw:text-[13px]">
          {booking.status === 'confirmed'
            ? 'The customer booked a car with a driver. Assign a driver so they can see who will drive them.'
            : 'No driver was assigned.'}
        </div>
      )}
      {editable &&
        (choices.length === 0 ? (
          <p className="tw:m-0 tw:text-[13px] tw:text-brand-muted">
            No drivers yet. <a href="/admin/rentals/drivers/new">Add a driver</a> first.
          </p>
        ) : (
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
            <Select
              className="tw:min-w-[260px]"
              placeholder={current ? 'Change driver' : 'Choose a driver'}
              value={picked}
              onChange={setPicked}
              options={choices
                .filter((driver) => driver.id !== current?.id)
                .map((driver) => ({
                  value: driver.id,
                  disabled: driver.busy || !driver.active,
                  label: `${driver.name}${driver.busy ? ' · busy at this time' : !driver.active ? ' · off' : ''}`,
                }))}
            />
            <Button
              type="primary"
              disabled={picked === undefined}
              loading={saving}
              onClick={() => picked !== undefined && post(picked)}
            >
              {current ? 'Change driver' : 'Assign driver'}
            </Button>
            {current && (
              <Button danger disabled={saving} onClick={() => post(null)}>
                Remove
              </Button>
            )}
            <span className="tw:w-full tw:text-[12px] tw:text-brand-muted">
              The customer gets a notification in the app when a driver is assigned. Drivers busy
              with another booking at this time cannot be chosen.
            </span>
          </div>
        ))}
    </Panel>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="tw:flex tw:flex-col tw:gap-0.5">
      <dt className="tw:text-[12px] tw:font-semibold tw:uppercase tw:text-brand-muted">{label}</dt>
      <dd className="tw:m-0 tw:text-[14px]">{value || '—'}</dd>
    </div>
  )
}

export default function RentalBooking({
  adminName,
  csrfToken,
  success,
  error,
  booking,
  payments,
  driverChoices,
  review,
  providerEmails,
}: Props) {
  const can = useCan()
  const base = `/admin/rentals/bookings/${booking.id}`
  const paid = payments.some((payment) => payment.status === 'paid')
  const canUpdate = can('rental_bookings.update')
  // Provider portal: the rental and customer only; it can mark the rental as completed.
  const portal = usePortal()
  const canComplete = canUpdate || Boolean(portal)
  const completable = booking.status === 'confirmed' && new Date(booking.pickup_at) <= new Date()
  const cancellable =
    canUpdate && ['pending_payment', 'confirmed', 'expired'].includes(booking.status)
  // Hide the panel rather than show it empty (e.g. a provider before the rental starts).
  const hasActions = completable || cancellable || (paid && can('rental_bookings.refund'))
  const [reviewBusy, setReviewBusy] = useState(false)
  const [pending, setPending] = useState<'complete' | 'cancel' | 'refund' | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [refundComment, setRefundComment] = useState('')
  const confirmCopy = {
    complete: {
      title: 'Mark as completed',
      message: 'Mark this rental as completed? The customer can then review it.',
      label: 'Mark as completed',
    },
    cancel: {
      title: 'Cancel booking',
      message:
        'Cancel this booking? The booking fee is not refunded automatically. If it was confirmed, the provider is emailed.',
      label: 'Cancel booking',
    },
    refund: {
      title: 'Refund booking fee',
      message: 'Refund the booking fee through MyFatoorah? This also cancels the booking.',
      label: 'Refund',
    },
  } as const
  const toggleReview = (visible: boolean) =>
    review &&
    router.post(
      `/admin/rentals/reviews/${review.id}/status`,
      { status: visible ? 'published' : 'hidden', returnTo: base, _csrf: csrfToken },
      {
        preserveScroll: true,
        onStart: () => setReviewBusy(true),
        onFinish: () => setReviewBusy(false),
      }
    )
  return (
    <AdminLayout
      title={`Booking ${booking.reference}`}
      active="rental-bookings"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
        <a className="back-link tw:inline-flex" href="/admin/rentals/bookings">
          {portal ? '← Back to bookings' : '← Back to rental bookings'}
        </a>
        <StatusBadge status={booking.status} />
      </div>
      <div className="page-head tw:mb-6">
        <h1>{booking.reference}</h1>
      </div>

      {!portal && booking.status === 'refund_required' && (
        <div className="tw:mb-6 tw:rounded-cms-sm tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-4 tw:text-[14px]">
          The customer paid the booking fee, but the booking could not be confirmed (the hold had
          expired and the vehicle was taken, or the customer had cancelled). Refund the fee.
        </div>
      )}

      <Panel title="Rental">
        <dl className="tw:grid tw:grid-cols-3 tw:gap-4 tw:max-[900px]:grid-cols-1">
          <Detail
            label="Vehicle"
            value={`${booking.vehicle_name}${booking.with_driver ? ' (with driver)' : ''}`}
          />
          {!portal && (
            <Detail
              label="Provider"
              value={`${booking.provider_name}${booking.provider_phone ? ` · ${booking.provider_phone}` : ''}`}
            />
          )}
          <Detail label="Days" value={booking.days} />
          <Detail
            label="Pickup"
            value={`${formatDateTime(booking.pickup_at)} · ${booking.pickup_location}`}
          />
          <Detail
            label="Return"
            value={`${formatDateTime(booking.return_at)} · ${booking.return_location}`}
          />
          {!portal && (
            <Detail label="Booking fee (paid in app)" value={`KWD ${booking.booking_fee}`} />
          )}
          <Detail
            label={
              portal ? 'Rental amount (collect at pickup)' : 'Rental amount (paid to provider)'
            }
            value={`KWD ${booking.rental_amount}`}
          />
          <Detail label="Customer notes" value={booking.notes} />
        </dl>
      </Panel>

      {booking.with_driver && (
        <DriverPanel
          booking={booking}
          choices={driverChoices}
          canAssign={canComplete}
          csrfToken={csrfToken}
        />
      )}

      <Panel title="Customer">
        <dl className="tw:grid tw:grid-cols-3 tw:gap-4 tw:max-[900px]:grid-cols-1">
          <Detail label="Name" value={booking.customer.name} />
          <Detail label="Phone" value={booking.customer.phone} />
          <Detail label="Email" value={booking.customer.email} />
        </dl>
      </Panel>

      <Panel title="Timeline">
        <dl className="tw:grid tw:grid-cols-3 tw:gap-4 tw:max-[900px]:grid-cols-1">
          <Detail label="Created" value={formatDateTime(booking.created_at)} />
          <Detail
            label="Confirmed"
            value={booking.confirmed_at && formatDateTime(booking.confirmed_at)}
          />
          <Detail
            label="Completed"
            value={booking.completed_at && formatDateTime(booking.completed_at)}
          />
          <Detail
            label="Cancelled"
            value={
              booking.cancelled_at &&
              `${formatDateTime(booking.cancelled_at)} by ${booking.cancelled_by ?? 'unknown'}${
                booking.cancel_reason ? ` — ${booking.cancel_reason}` : ''
              }`
            }
          />
        </dl>
      </Panel>

      {!portal && (
        <Panel title="Payments">
          {payments.length === 0 ? (
            <p className="tw:text-brand-muted">No payment started.</p>
          ) : (
            <table className="tw:w-full tw:text-[13px]">
              <thead>
                <tr className="tw:text-left">
                  <th>Invoice</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Paid</th>
                  <th>Refund</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {payment.invoice_id}
                      {payment.payment_id ? ` / ${payment.payment_id}` : ''}
                    </td>
                    <td>{payment.method ?? '—'}</td>
                    <td>KWD {payment.amount}</td>
                    <td>
                      <StatusBadge status={payment.status} />
                    </td>
                    <td>{formatDateTime(payment.paid_at)}</td>
                    <td>
                      {payment.refunded_at
                        ? `${formatDateTime(payment.refunded_at)} (${payment.refund_reference ?? ''})`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {!portal && (
        <Panel
          title="Provider emails"
          actions={
            canUpdate && booking.confirmed_at ? (
              <ActionForm action={`${base}/provider-email`} csrfToken={csrfToken}>
                <Button htmlType="submit">
                  {booking.status === 'cancelled'
                    ? 'Send cancellation email'
                    : 'Send booking email'}
                </Button>
              </ActionForm>
            ) : null
          }
        >
          <p className="tw:mb-3 tw:text-[13px] tw:text-brand-muted">
            Sent to {booking.provider_email ?? 'the provider (no email address saved)'} when the
            booking is confirmed and when a confirmed booking is cancelled.
          </p>
          {providerEmails.length === 0 ? (
            <p className="tw:text-brand-muted">No emails sent yet.</p>
          ) : (
            <table className="tw:w-full tw:text-[13px]">
              <thead>
                <tr className="tw:text-left">
                  <th>Email</th>
                  <th>Recipient</th>
                  <th>Result</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {providerEmails.map((email) => (
                  <tr key={email.id}>
                    <td>
                      {email.kind === 'confirmed' ? 'Booking confirmed' : 'Booking cancelled'}
                    </td>
                    <td>{email.recipient ?? '—'}</td>
                    <td>
                      <span
                        className={`status ${email.status === 'sent' ? 'published' : email.status === 'failed' ? 'archived' : 'draft'}`}
                      >
                        {email.status === 'sent'
                          ? 'Sent'
                          : email.status === 'failed'
                            ? 'Failed'
                            : 'Not sent'}
                      </span>
                      {email.error && (
                        <span className="tw:mt-1 tw:block tw:text-[12px] tw:text-brand-muted">
                          {email.error}
                        </span>
                      )}
                    </td>
                    <td>{formatDateTime(email.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {can('rental_reviews.view') && (
        <Panel
          title="Customer review"
          actions={
            review && can('rental_reviews.update') ? (
              <span className="tw:flex tw:items-center tw:gap-2 tw:text-[13px]">
                Visible in app
                <Switch
                  aria-label={review.status === 'published' ? 'Hide review' : 'Show review'}
                  checked={review.status === 'published'}
                  loading={reviewBusy}
                  onChange={toggleReview}
                />
              </span>
            ) : null
          }
        >
          {review ? (
            <div className="tw:flex tw:flex-col tw:gap-2">
              <Rate disabled value={review.rating} />
              <p className="tw:m-0 tw:whitespace-pre-line">
                {review.comment ?? <em className="tw:text-brand-muted">No comment</em>}
              </p>
              <span className="tw:text-[12px] tw:text-brand-muted">
                {formatDateTime(review.created_at)}
              </span>
            </div>
          ) : (
            <p className="tw:text-brand-muted">The customer has not reviewed this rental.</p>
          )}
        </Panel>
      )}

      {canComplete && hasActions && (
        <Panel title="Actions">
          <div className="tw:flex tw:flex-col tw:gap-5">
            {booking.status === 'confirmed' && new Date(booking.pickup_at) <= new Date() && (
              <div>
                <Button type="primary" onClick={() => setPending('complete')}>
                  Mark as completed
                </Button>
              </div>
            )}
            {canUpdate && ['pending_payment', 'confirmed', 'expired'].includes(booking.status) && (
              <div className="tw:flex tw:flex-wrap tw:items-end tw:gap-3">
                <Input
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  maxLength={500}
                  placeholder="Reason (optional)"
                  className="tw:max-w-md"
                />
                <Button danger onClick={() => setPending('cancel')}>
                  Cancel booking
                </Button>
              </div>
            )}
            {paid && can('rental_bookings.refund') && (
              <div className="tw:flex tw:flex-wrap tw:items-end tw:gap-3">
                <Input
                  value={refundComment}
                  onChange={(event) => setRefundComment(event.target.value)}
                  maxLength={200}
                  placeholder="Refund comment (optional)"
                  className="tw:max-w-md"
                />
                <Button danger onClick={() => setPending('refund')}>
                  Refund booking fee
                </Button>
              </div>
            )}
          </div>
        </Panel>
      )}
      <ConfirmModal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={pending ? confirmCopy[pending].title : ''}
        message={pending ? confirmCopy[pending].message : ''}
        action={pending ? `${base}/${pending}` : ''}
        csrfToken={csrfToken}
        confirmLabel={pending ? confirmCopy[pending].label : ''}
        danger={pending !== 'complete'}
        fields={
          pending === 'cancel'
            ? { reason: cancelReason }
            : pending === 'refund'
              ? { reason: refundComment }
              : {}
        }
      />
    </AdminLayout>
  )
}
