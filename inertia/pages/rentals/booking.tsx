import { Button, Input, Rate, Switch } from 'antd'
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
  review,
  providerEmails,
}: Props) {
  const can = useCan()
  const base = `/admin/rentals/bookings/${booking.id}`
  const paid = payments.some((payment) => payment.status === 'paid')
  const canUpdate = can('rental_bookings.update')
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
      <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/bookings">
        ← Back to rental bookings
      </a>
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-center tw:gap-3">
        <h1>{booking.reference}</h1>
        <StatusBadge status={booking.status} />
      </div>

      {booking.status === 'refund_required' && (
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
          <Detail
            label="Provider"
            value={`${booking.provider_name}${booking.provider_phone ? ` · ${booking.provider_phone}` : ''}`}
          />
          <Detail label="Days" value={booking.days} />
          <Detail
            label="Pickup"
            value={`${formatDateTime(booking.pickup_at)} · ${booking.pickup_location}`}
          />
          <Detail
            label="Return"
            value={`${formatDateTime(booking.return_at)} · ${booking.return_location}`}
          />
          <Detail
            label="Hold expires"
            value={booking.hold_expires_at ? formatDateTime(booking.hold_expires_at) : null}
          />
          <Detail label="Booking fee (paid in app)" value={`KWD ${booking.booking_fee}`} />
          <Detail label="Rental amount (paid to provider)" value={`KWD ${booking.rental_amount}`} />
          <Detail label="Customer notes" value={booking.notes} />
        </dl>
      </Panel>

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

      <Panel
        title="Payments"
        actions={
          canUpdate && payments.length > 0 ? (
            <ActionForm action={`${base}/verify-payment`} csrfToken={csrfToken}>
              <Button htmlType="submit">Refresh from MyFatoorah</Button>
            </ActionForm>
          ) : null
        }
      >
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

      <Panel
        title="Provider emails"
        actions={
          canUpdate && booking.confirmed_at ? (
            <ActionForm action={`${base}/provider-email`} csrfToken={csrfToken}>
              <Button htmlType="submit">
                {booking.status === 'cancelled' ? 'Send cancellation email' : 'Send booking email'}
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
                  <td>{email.kind === 'confirmed' ? 'Booking confirmed' : 'Booking cancelled'}</td>
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

      {canUpdate && (
        <Panel title="Actions">
          <div className="tw:flex tw:flex-col tw:gap-5">
            {booking.status === 'confirmed' && new Date(booking.pickup_at) <= new Date() && (
              <div>
                <Button type="primary" onClick={() => setPending('complete')}>
                  Mark as completed
                </Button>
              </div>
            )}
            {['pending_payment', 'confirmed', 'expired'].includes(booking.status) && (
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
