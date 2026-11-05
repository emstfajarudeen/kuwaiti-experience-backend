import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import {
  Field,
  FieldError,
  inputClass,
  Panel,
  useFieldErrors,
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
  const errorFor = useFieldErrors()
  const value = (key: string, fallback: unknown) => {
    const chosen = form?.[key] !== undefined ? form[key] : fallback
    return chosen === null || chosen === undefined ? '' : String(chosen)
  }
  const active = form?.active !== undefined ? Boolean(form.active) : (provider?.active ?? true)
  return (
    <AdminLayout
      title={provider ? 'Edit provider' : 'New provider'}
      active="rentals"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/providers">
        ← Back to providers
      </a>
      <form
        method="post"
        encType="multipart/form-data"
        action={
          provider ? `/admin/rentals/providers/${provider.id}/save` : '/admin/rentals/providers'
        }
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <Panel title="Provider details">
          <div className="tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
            <Field label="Name (English)" name="nameEn" required error={errorFor('nameEn')}>
              <input
                id="nameEn"
                name="nameEn"
                className={inputClass}
                maxLength={160}
                defaultValue={value('nameEn', provider?.name_en)}
                required
              />
            </Field>
            <Field label="Name (Arabic)" name="nameAr" error={errorFor('nameAr')}>
              <input
                id="nameAr"
                name="nameAr"
                dir="rtl"
                lang="ar"
                className={inputClass}
                maxLength={160}
                defaultValue={value('nameAr', provider?.name_ar)}
              />
            </Field>
            <Field
              label="Phone"
              name="phone"
              error={errorFor('phone')}
              hint="Shown to customers on confirmed bookings. International format, e.g. +96512345678."
            >
              <input
                id="phone"
                name="phone"
                className={inputClass}
                maxLength={16}
                defaultValue={value('phone', provider?.phone)}
              />
            </Field>
            <Field
              label="Email"
              name="email"
              error={errorFor('email')}
              hint="For staff reference; not shown in the app."
            >
              <input
                id="email"
                name="email"
                type="email"
                className={inputClass}
                maxLength={254}
                defaultValue={value('email', provider?.email)}
              />
            </Field>
            <Field label="Address" name="address" error={errorFor('address')}>
              <input
                id="address"
                name="address"
                className={inputClass}
                maxLength={500}
                defaultValue={value('address', provider?.address)}
              />
            </Field>
            <label className="tw:flex tw:items-center tw:gap-2 tw:self-end tw:text-[14px]">
              <input type="checkbox" name="active" value="1" defaultChecked={active} />
              Active (inactive providers' vehicles are hidden from the app)
            </label>
          </div>
        </Panel>
        <Panel title="Logo">
          <ImageUpload
            name="logo"
            currentImageUrl={provider?.logo_url}
            currentImageAlt="Provider logo"
            removeName="removeLogo"
          />
          <FieldError message={errorFor('logo')} />
        </Panel>
        <div className="cms-form-actions">
          <a className="ant-btn ant-btn-default" href="/admin/rentals/providers">
            Cancel
          </a>
          <button type="submit" className="ant-btn ant-btn-primary">
            Save provider
          </button>
        </div>
      </form>
    </AdminLayout>
  )
}
