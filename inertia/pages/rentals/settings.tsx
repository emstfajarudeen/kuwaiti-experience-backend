import { Input, InputNumber } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import {
  FormField,
  FormSection,
  RentalFormShell,
  RentalTabs,
  useCan,
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
      <RentalFormShell
        id="rental-settings-form"
        action="/admin/rentals/settings"
        csrfToken={csrfToken}
        cancelHref="/admin/rentals/vehicles"
        submitLabel="Save settings"
        disabled={!can('rentals.update')}
        initialValues={{
          bookingFee: settings.booking_fee,
          holdMinutes: settings.hold_minutes,
          minLeadMinutes: settings.min_lead_minutes,
          maxRentalDays: settings.max_rental_days,
          cancellationCutoffHours: settings.cancellation_cutoff_hours,
        }}
      >
        <FormSection title="Booking rules">
          <FormField
            label="Booking fee (KWD)"
            name="bookingFee"
            required
            message="Enter the booking fee."
            hint="Charged in the app; the rental itself is paid to the provider."
            rules={[{ pattern: /^\d{1,7}(\.\d{1,3})?$/, message: 'Use an amount like 3.000.' }]}
          >
            <Input inputMode="decimal" />
          </FormField>
          <FormField
            label="Payment hold (minutes)"
            name="holdMinutes"
            required
            hint="How long an unpaid booking reserves the car."
          >
            <InputNumber min={5} max={120} precision={0} className="tw:w-full" />
          </FormField>
          <FormField label="Minimum notice before pickup (minutes)" name="minLeadMinutes" required>
            <InputNumber min={0} max={10080} precision={0} className="tw:w-full" />
          </FormField>
          <FormField label="Maximum rental length (days)" name="maxRentalDays" required>
            <InputNumber min={1} max={365} precision={0} className="tw:w-full" />
          </FormField>
          <FormField
            label="Customer cancellation cut-off (hours before pickup)"
            name="cancellationCutoffHours"
            required
            hint="The booking fee is not refunded automatically when customers cancel."
          >
            <InputNumber min={0} max={720} precision={0} className="tw:w-full" />
          </FormField>
        </FormSection>
      </RentalFormShell>
    </AdminLayout>
  )
}
