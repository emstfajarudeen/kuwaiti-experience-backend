import AdminLayout from '../../layouts/admin_layout'
import {
  Field,
  inputClass,
  Panel,
  useFieldErrors,
  type SharedProps,
} from '../../components/rental_ui'

type Location = {
  id: number
  name_en: string
  name_ar: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  active: boolean
  sort_order: number
}

type Props = SharedProps & { location: Location | null; form: Record<string, unknown> | null }

export default function RentalLocationEdit({
  adminName,
  csrfToken,
  success,
  error,
  location,
  form,
}: Props) {
  const errorFor = useFieldErrors()
  const value = (key: string, fallback: unknown) => {
    const chosen = form?.[key] !== undefined ? form[key] : fallback
    return chosen === null || chosen === undefined ? '' : String(chosen)
  }
  const active = form?.active !== undefined ? Boolean(form.active) : (location?.active ?? true)
  return (
    <AdminLayout
      title={location ? 'Edit location' : 'New location'}
      active="rentals"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/locations">
        ← Back to locations
      </a>
      <form
        method="post"
        action={
          location ? `/admin/rentals/locations/${location.id}/save` : '/admin/rentals/locations'
        }
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <Panel title="Location">
          <div className="tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
            <Field label="Name (English)" name="nameEn" required error={errorFor('nameEn')}>
              <input
                id="nameEn"
                name="nameEn"
                className={inputClass}
                maxLength={160}
                defaultValue={value('nameEn', location?.name_en)}
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
                defaultValue={value('nameAr', location?.name_ar)}
              />
            </Field>
            <Field label="Address" name="address" error={errorFor('address')}>
              <input
                id="address"
                name="address"
                className={inputClass}
                maxLength={500}
                defaultValue={value('address', location?.address)}
              />
            </Field>
            <Field label="Display order" name="sortOrder" error={errorFor('sortOrder')}>
              <input
                id="sortOrder"
                name="sortOrder"
                type="number"
                min={0}
                max={9999}
                className={inputClass}
                defaultValue={value('sortOrder', location?.sort_order ?? 0)}
              />
            </Field>
            <Field label="Latitude" name="latitude" error={errorFor('latitude')}>
              <input
                id="latitude"
                name="latitude"
                inputMode="decimal"
                className={inputClass}
                defaultValue={value('latitude', location?.latitude)}
              />
            </Field>
            <Field label="Longitude" name="longitude" error={errorFor('longitude')}>
              <input
                id="longitude"
                name="longitude"
                inputMode="decimal"
                className={inputClass}
                defaultValue={value('longitude', location?.longitude)}
              />
            </Field>
            <label className="tw:flex tw:items-center tw:gap-2 tw:text-[14px]">
              <input type="checkbox" name="active" value="1" defaultChecked={active} />
              Active
            </label>
          </div>
        </Panel>
        <div className="cms-form-actions">
          <a className="ant-btn ant-btn-default" href="/admin/rentals/locations">
            Cancel
          </a>
          <button type="submit" className="ant-btn ant-btn-primary">
            Save location
          </button>
        </div>
      </form>
    </AdminLayout>
  )
}
