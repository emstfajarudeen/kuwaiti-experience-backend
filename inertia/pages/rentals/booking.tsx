import AdminLayout from '../../layouts/admin_layout'
import {
  ActionForm,
  formatDateTime,
  inputClass,
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
    pickup_location: string
    return_location: string
    pickup_at: string
    return_at: string
    with_driver: boolean
    days: number
    rental_amount: string
    deposit_amount: string
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
}: Props) {
  const can = useCan()
  const base = `/admin/rentals/bookings/${booking.id}`
  const paid = payments.some((payment) => payment.status === 'paid')
  const canUpdate = can('rental_bookings.update')
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
          <Detail label="Deposit (held by provider)" value={`KWD ${booking.deposit_amount}`} />
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
              <button type="submit" className="ant-btn ant-btn-default">
                Refresh from MyFatoorah
              </button>
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

      {canUpdate && (
        <Panel title="Actions">
          <div className="tw:flex tw:flex-col tw:gap-5">
            {booking.status === 'confirmed' && (
              <ActionForm
                action={`${base}/complete`}
                csrfToken={csrfToken}
                confirm="Mark this rental as completed?"
              >
                <button type="submit" className="ant-btn ant-btn-primary">
                  Mark as completed
                </button>
              </ActionForm>
            )}
            {['pending_payment', 'confirmed', 'expired'].includes(booking.status) && (
              <ActionForm
                action={`${base}/cancel`}
                csrfToken={csrfToken}
                confirm="Cancel this booking? The booking fee is not refunded automatically."
                className="tw:flex tw:flex-wrap tw:items-end tw:gap-3"
              >
                <input
                  className={`${inputClass} tw:max-w-md`}
                  name="reason"
                  maxLength={500}
                  placeholder="Reason (optional)"
                />
                <button type="submit" className="ant-btn ant-btn-default ant-btn-dangerous">
                  Cancel booking
                </button>
              </ActionForm>
            )}
            {paid && can('rental_bookings.refund') && (
              <ActionForm
                action={`${base}/refund`}
                csrfToken={csrfToken}
                confirm="Refund the booking fee through MyFatoorah? This also cancels the booking."
                className="tw:flex tw:flex-wrap tw:items-end tw:gap-3"
              >
                <input
                  className={`${inputClass} tw:max-w-md`}
                  name="reason"
                  maxLength={200}
                  placeholder="Refund comment (optional)"
                />
                <button type="submit" className="ant-btn ant-btn-default ant-btn-dangerous">
                  Refund booking fee
                </button>
              </ActionForm>
            )}
          </div>
        </Panel>
      )}
    </AdminLayout>
  )
}
