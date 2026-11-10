import { Input } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import {
  FormField,
  FormSection,
  RentalFormShell,
  SwitchField,
  type SharedProps,
} from '../../components/rental_ui'

type Provider = {
  id: number
  name_en: string
  name_ar: string | null
  phone: string | null
  email: string | null
  address: string | null
  active: boolean
  logo_url: string | null
}

type Props = SharedProps & { provider: Provider | null; form: Record<string, unknown> | null }

export default function RentalProviderEdit({
  adminName,
  csrfToken,
  success,
  error,
  provider,
  form,
}: Props) {
  const value = (key: string, fallback: unknown) =>
    form?.[key] !== undefined ? form[key] : (fallback ?? '')
  return (
    <AdminLayout
      title={provider ? 'Edit provider' : 'New provider'}
      active="rental-providers"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/providers">
        ← Back to providers
      </a>
      <div className="page-head tw:mb-6">
        <h1>{provider ? provider.name_en : 'New provider'}</h1>
      </div>
      <RentalFormShell
        id="rental-provider-form"
        multipart
        action={
          provider ? `/admin/rentals/providers/${provider.id}/save` : '/admin/rentals/providers'
        }
        csrfToken={csrfToken}
        cancelHref="/admin/rentals/providers"
        submitLabel="Save provider"
        initialValues={{
          nameEn: value('nameEn', provider?.name_en),
          nameAr: value('nameAr', provider?.name_ar),
          phone: value('phone', provider?.phone),
          email: value('email', provider?.email),
          address: value('address', provider?.address),
          active: form?.active !== undefined ? Boolean(form.active) : (provider?.active ?? true),
        }}
      >
        <FormSection title="Provider details">
          <FormField
            label="Name (English)"
            name="nameEn"
            required
            message="Enter the English name."
          >
            <Input name="nameEn" maxLength={160} />
          </FormField>
          <FormField label="Name (Arabic)" name="nameAr">
            <Input name="nameAr" dir="rtl" lang="ar" maxLength={160} />
          </FormField>
          <FormField
            label="Phone"
            name="phone"
            hint="Shown to customers on confirmed bookings. Use international format, e.g. +96512345678."
            rules={[
              {
                pattern: /^$|^\+[1-9]\d{7,14}$/,
                message: 'Use international format, e.g. +96512345678.',
              },
            ]}
          >
            <Input name="phone" maxLength={16} />
          </FormField>
          <FormField
            label="Email"
            name="email"
            hint="For staff reference; not shown in the app."
            rules={[{ type: 'email', message: 'Enter a valid email address.' }]}
          >
            <Input name="email" maxLength={254} />
          </FormField>
          <FormField label="Address" name="address">
            <Input name="address" maxLength={500} />
          </FormField>
          <SwitchField
            label="Status"
            name="active"
            hint="Vehicles of inactive providers are hidden from the app."
          />
        </FormSection>
        <section className="cms-form-section">
          <h2>Logo</h2>
          <div className="image-block tw:mt-4">
            <ImageUpload
              name="logo"
              currentImageUrl={provider?.logo_url}
              currentImageAlt="Provider logo"
              removeName="removeLogo"
            />
          </div>
        </section>
      </RentalFormShell>
    </AdminLayout>
  )
}
