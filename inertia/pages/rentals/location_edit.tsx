import { Form, Input, InputNumber, Switch } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import OpenMapAddressSearch from '../../components/open_map_address_search'
import {
  FormField,
  FormSection,
  RentalFormShell,
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

function toCoordinate(value: unknown) {
  return value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : Number(value)
}

/** Address search + map pin, same as the Places form; coordinates come from the map. */
function LocationMapField() {
  const form = Form.useFormInstance()
  const latitude = toCoordinate(Form.useWatch('latitude', form))
  const longitude = toCoordinate(Form.useWatch('longitude', form))
  return (
    <>
      <label className="tw:col-span-full">
        <span>Address</span>
        <Form.Item
          name="address"
          rules={[{ max: 500, message: 'Address must be 500 characters or fewer.' }]}
        >
          <OpenMapAddressSearch
            name="address"
            latitude={latitude}
            longitude={longitude}
            searchUrl="/admin/rentals/address-search"
            reverseUrl="/admin/rentals/address-reverse"
            onAddressEdited={() => form.setFieldsValue({ latitude: '', longitude: '' })}
            onPlaceSelected={(_, lat, lon) =>
              form.setFieldsValue({ latitude: String(lat), longitude: String(lon) })
            }
          />
        </Form.Item>
      </label>
      {['latitude', 'longitude'].map((name) => (
        <Form.Item key={name} name={name} hidden>
          <Input name={name} />
        </Form.Item>
      ))}
    </>
  )
}

export default function RentalLocationEdit({
  adminName,
  csrfToken,
  success,
  error,
  location,
  form,
}: Props) {
  const value = (key: string, fallback: unknown) =>
    form?.[key] !== undefined ? form[key] : (fallback ?? '')
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
      <div className="page-head tw:mb-6">
        <h1>{location ? location.name_en : 'New location'}</h1>
      </div>
      <RentalFormShell
        id="rental-location-form"
        action={
          location ? `/admin/rentals/locations/${location.id}/save` : '/admin/rentals/locations'
        }
        csrfToken={csrfToken}
        cancelHref="/admin/rentals/locations"
        submitLabel="Save location"
        initialValues={{
          nameEn: value('nameEn', location?.name_en),
          nameAr: value('nameAr', location?.name_ar),
          address: value('address', location?.address),
          sortOrder: Number(value('sortOrder', location?.sort_order ?? 0)),
          latitude: String(value('latitude', location?.latitude)),
          longitude: String(value('longitude', location?.longitude)),
          active: form?.active !== undefined ? Boolean(form.active) : (location?.active ?? true),
        }}
      >
        <FormSection title="Location">
          <FormField
            label="Name (English)"
            name="nameEn"
            required
            message="Enter the English name."
          >
            <Input maxLength={160} />
          </FormField>
          <FormField label="Name (Arabic)" name="nameAr">
            <Input dir="rtl" lang="ar" maxLength={160} />
          </FormField>
          <LocationMapField />
          <FormField label="Display order" name="sortOrder">
            <InputNumber min={0} max={9999} precision={0} className="tw:w-full" />
          </FormField>
          <FormField
            label="Status"
            name="active"
            valuePropName="checked"
            hint="Active locations are shown as pickup and return options."
          >
            <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
            {/* Switches are not native inputs, so mirror the value for the multipart post. */}
            <Form.Item shouldUpdate noStyle>
              {({ getFieldValue }) => (
                <input
                  type="hidden"
                  name="active"
                  value={getFieldValue('active') ? 'true' : 'false'}
                />
              )}
            </Form.Item>
          </FormField>
        </FormSection>
      </RentalFormShell>
    </AdminLayout>
  )
}
