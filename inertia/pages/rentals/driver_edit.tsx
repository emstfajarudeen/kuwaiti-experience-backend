import { Form, Input } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import FormSelect from '../../components/form_select'
import {
  FormField,
  FormSection,
  RentalFormShell,
  SwitchField,
  usePortal,
  type SharedProps,
} from '../../components/rental_ui'

type Driver = {
  id: number
  name: string
  phone: string | null
  photo_url: string | null
  active: boolean
}

type Props = SharedProps & {
  providerId: number | null
  providers: { value: string; label: string }[]
  driver: Driver | null
  form: Record<string, unknown> | null
}

export default function RentalDriverEdit({
  adminName,
  csrfToken,
  success,
  error,
  providerId,
  providers,
  driver,
  form,
}: Props) {
  const portal = usePortal()
  const listHref =
    providerId && !portal
      ? `/admin/rentals/drivers?provider=${providerId}`
      : '/admin/rentals/drivers'
  const value = (key: string, fallback: unknown) =>
    form?.[key] !== undefined ? form[key] : (fallback ?? '')
  return (
    <AdminLayout
      title={driver ? 'Edit driver' : 'New driver'}
      active="rental-drivers"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href={listHref}>
        ← Back to drivers
      </a>
      <div className="page-head tw:mb-6">
        <h1>{driver ? driver.name : 'New driver'}</h1>
      </div>
      <RentalFormShell
        id="rental-driver-form"
        multipart
        action={driver ? `/admin/rentals/drivers/${driver.id}/save` : '/admin/rentals/drivers'}
        csrfToken={csrfToken}
        cancelHref={listHref}
        submitLabel={driver ? 'Save driver' : 'Add driver'}
        initialValues={{
          providerId:
            value('providerId', providerId) === ''
              ? undefined
              : String(value('providerId', providerId)),
          name: value('name', driver?.name),
          phone: value('phone', driver?.phone),
          active: form?.active !== undefined ? Boolean(form.active) : (driver?.active ?? true),
        }}
      >
        <FormSection title="Driver">
          {portal ? (
            <Form.Item name="providerId" hidden>
              <Input name="providerId" />
            </Form.Item>
          ) : (
            <FormField label="Provider" name="providerId" required message="Choose a provider.">
              <FormSelect
                name="providerId"
                required
                value=""
                placeholder="Choose a provider"
                options={providers}
                onChange={() => undefined}
              />
            </FormField>
          )}
          <FormField label="Name" name="name" required message="Enter the driver's name.">
            <Input name="name" maxLength={120} />
          </FormField>
          <FormField
            label="Phone"
            name="phone"
            hint="Optional. Shown to the customer so they can call the driver. International format, e.g. +96512345678."
            rules={[
              {
                pattern: /^$|^\+[1-9]\d{7,14}$/,
                message: 'Use international format, e.g. +96512345678.',
              },
            ]}
          >
            <Input name="phone" maxLength={16} />
          </FormField>
          <SwitchField
            label="Status"
            name="active"
            on="On"
            off="Off"
            hint="Drivers who are off cannot be assigned to new bookings."
          />
        </FormSection>
        <section className="cms-form-section">
          <h2>Photo</h2>
          <p className="tw:mt-1 tw:text-[13px] tw:text-brand-muted">
            A clear face photo helps the customer recognise their driver at pickup.
          </p>
          <div className="image-block tw:mt-4">
            <ImageUpload
              name="photo"
              currentImageUrl={driver?.photo_url}
              currentImageAlt="Driver photo"
              removeName="removePhoto"
            />
          </div>
        </section>
      </RentalFormShell>
    </AdminLayout>
  )
}
