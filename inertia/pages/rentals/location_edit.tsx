import { Form, Input, InputNumber, Select } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import OpenMapAddressSearch from '../../components/open_map_address_search'
import {
  FormField,
  FormSection,
  RentalFormShell,
  SwitchField,
  usePortal,
  type SharedProps,
} from '../../components/rental_ui'

type Location = {
  id: number
  phone: string | null
  place_id: number | null
  name_en: string
  name_ar: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  active: boolean
  sort_order: number
}

type Props = SharedProps & {
  providerId: number | null
  providers: { value: string; label: string }[]
  places: { value: string; label: string }[]
  location: Location | null
  form: Record<string, unknown> | null
}

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
  providerId,
  providers,
  places,
  location,
  form,
}: Props) {
  const portal = usePortal()
  const providerName = portal
    ? undefined
    : providers.find((option) => option.value === String(providerId))?.label
  const listHref =
    providerId && !portal
      ? `/admin/rentals/locations?provider=${providerId}`
      : '/admin/rentals/locations'
  const value = (key: string, fallback: unknown) =>
    form?.[key] !== undefined ? form[key] : (fallback ?? '')
  return (
    <AdminLayout
      title={location ? 'Edit branch' : 'New branch'}
      active="rental-branches"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href={listHref}>
        ← Back to branches
      </a>
      <div className="page-head tw:mb-6">
        <h1>
          {location
            ? location.name_en
            : providerName
              ? `New branch of ${providerName}`
              : 'New branch'}
        </h1>
      </div>
      <RentalFormShell
        id="rental-location-form"
        action={
          location ? `/admin/rentals/locations/${location.id}/save` : '/admin/rentals/locations'
        }
        csrfToken={csrfToken}
        cancelHref={listHref}
        submitLabel="Save branch"
        initialValues={{
          providerId:
            value('providerId', providerId) === ''
              ? undefined
              : String(value('providerId', providerId)),
          placeId:
            value('placeId', location?.place_id) === ''
              ? undefined
              : String(value('placeId', location?.place_id)),
          phone: value('phone', location?.phone),
          nameEn: value('nameEn', location?.name_en),
          nameAr: value('nameAr', location?.name_ar),
          address: value('address', location?.address),
          sortOrder: Number(value('sortOrder', location?.sort_order ?? 0)),
          latitude: String(value('latitude', location?.latitude)),
          longitude: String(value('longitude', location?.longitude)),
          active: form?.active !== undefined ? Boolean(form.active) : (location?.active ?? true),
        }}
      >
        <FormSection title="Branch">
          {portal || providerId ? (
            <Form.Item name="providerId" hidden>
              <Input />
            </Form.Item>
          ) : (
            <FormField label="Provider" name="providerId" required message="Choose a provider.">
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Choose a provider"
                options={providers}
                disabled={Boolean(location)}
              />
            </FormField>
          )}
          <FormField
            label="Pickup place"
            name="placeId"
            required
            message="Choose the pickup place this branch serves."
            hint={
              portal
                ? 'Customers pick this place in the app. If your place is missing, ask the Kuwaiti Experience team to add it.'
                : 'Customers pick this place in the app. Manage the list under Rental fleet → Pickup places.'
            }
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Choose a pickup place"
              options={places}
            />
          </FormField>
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
          <FormField
            label="Phone"
            name="phone"
            hint="International format, e.g. +96512345678."
            rules={[
              {
                pattern: /^$|^\+[1-9]\d{7,14}$/,
                message: 'Use international format, e.g. +96512345678.',
              },
            ]}
          >
            <Input maxLength={16} />
          </FormField>
          <FormField label="Display order" name="sortOrder">
            <InputNumber min={0} max={9999} precision={0} className="tw:w-full" />
          </FormField>
          <SwitchField
            label="Status"
            name="active"
            hint="Inactive branches are hidden from the app."
          />
        </FormSection>
        {location && (
          <p className="tw:mt-4 tw:text-[13px] tw:text-brand-muted">
            Working hours and closed dates:{' '}
            <a href={`/admin/rentals/locations/${location.id}/hours`}>edit working hours</a>
          </p>
        )}
      </RentalFormShell>
    </AdminLayout>
  )
}
