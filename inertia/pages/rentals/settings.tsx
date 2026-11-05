import AdminLayout from '../../layouts/admin_layout'
import {
  Field,
  inputClass,
  Panel,
  RentalTabs,
  useCan,
  useFieldErrors,
  type SharedProps,
} from '../../components/rental_ui'

type Props = SharedProps & {
  settings: {
    booking_fee: string
    hold_minutes: number
    min_lead_minutes: number
    max_rental_days: number
    cancellation_cutoff_hours: number
  }
  paymentsConfigured: boolean
}

export default function RentalSettings({
  adminName,
  csrfToken,
  success,
  error,
  settings,
  paymentsConfigured,
}: Props) {
  const can = useCan()
  const errorFor = useFieldErrors()
  return (
    <AdminLayout
      title="Rental settings"
      active="rentals"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-4">
        <h1>Rental settings</h1>
      </div>
      <RentalTabs current="settings" />
      {!paymentsConfigured && (
        <div className="tw:mb-6 tw:rounded-cms-sm tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-4 tw:text-[14px]">
          MyFatoorah is not configured on this server (MYFATOORAH_API_KEY). Customers can reserve
          vehicles but cannot pay the booking fee.
        </div>
      )}
      <form method="post" action="/admin/rentals/settings">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <fieldset disabled={!can('rentals.update')} className="tw:m-0 tw:border-0 tw:p-0">
          <Panel title="Booking rules">
            <div className="tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
              <Field
                label="Booking fee (KWD)"
                name="bookingFee"
                required
                error={errorFor('bookingFee')}
                hint="Charged in the app; the rental itself is paid to the provider."
              >
                <input
                  id="bookingFee"
                  name="bookingFee"
                  inputMode="decimal"
                  pattern="\d{1,7}(\.\d{1,3})?"
                  className={inputClass}
                  defaultValue={settings.booking_fee}
                  required
                />
              </Field>
              <Field
                label="Payment hold (minutes)"
                name="holdMinutes"
                required
                error={errorFor('holdMinutes')}
                hint="How long an unpaid booking reserves the car."
              >
                <input
                  id="holdMinutes"
                  name="holdMinutes"
                  type="number"
                  min={5}
                  max={120}
                  className={inputClass}
                  defaultValue={settings.hold_minutes}
                  required
                />
              </Field>
              <Field
                label="Minimum notice before pickup (minutes)"
                name="minLeadMinutes"
                required
                error={errorFor('minLeadMinutes')}
              >
                <input
                  id="minLeadMinutes"
                  name="minLeadMinutes"
                  type="number"
                  min={0}
                  max={10080}
                  className={inputClass}
                  defaultValue={settings.min_lead_minutes}
                  required
                />
              </Field>
              <Field
                label="Maximum rental length (days)"
                name="maxRentalDays"
                required
                error={errorFor('maxRentalDays')}
              >
                <input
                  id="maxRentalDays"
                  name="maxRentalDays"
                  type="number"
                  min={1}
                  max={365}
                  className={inputClass}
                  defaultValue={settings.max_rental_days}
                  required
                />
              </Field>
              <Field
                label="Customer cancellation cut-off (hours before pickup)"
                name="cancellationCutoffHours"
                required
                error={errorFor('cancellationCutoffHours')}
                hint="The booking fee is not refunded automatically when customers cancel."
              >
                <input
                  id="cancellationCutoffHours"
                  name="cancellationCutoffHours"
                  type="number"
                  min={0}
                  max={720}
                  className={inputClass}
                  defaultValue={settings.cancellation_cutoff_hours}
                  required
                />
              </Field>
            </div>
          </Panel>
          {can('rentals.update') && (
            <div className="cms-form-actions">
              <button type="submit" className="ant-btn ant-btn-primary">
                Save settings
              </button>
            </div>
          )}
        </fieldset>
      </form>
    </AdminLayout>
  )
}
