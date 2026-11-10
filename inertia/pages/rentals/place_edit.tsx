import { Form, Input, InputNumber } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import PlaceLocationMap from '../../components/place_location_map'
import {
  FormField,
  FormSection,
  RentalFormShell,
  SwitchField,
  type SharedProps,
} from '../../components/rental_ui'

type Place = {
  id: number
  name_en: string
  name_ar: string | null
  subtitle_en: string | null
  subtitle_ar: string | null
  latitude: number | null
  longitude: number | null
  active: boolean
  sort_order: number
}

type Props = SharedProps & { place: Place | null; form: Record<string, unknown> | null }

const coordinate = (value: unknown) =>
  value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : Number(value)

/** Pin on the map; sets the coordinates used to sort places by distance in the app. */
function PinField() {
  const form = Form.useFormInstance()
  const latitude = coordinate(Form.useWatch('latitude', form))
  const longitude = coordinate(Form.useWatch('longitude', form))
  return (
    <div className="tw:col-span-full">
      <span className="tw:text-[13px] tw:font-semibold">Map pin</span>
      <PlaceLocationMap
        latitude={latitude}
        longitude={longitude}
        onSelectLocation={(lat, lng) =>
          form.setFieldsValue({ latitude: String(lat), longitude: String(lng) })
        }
      />
      <p className="tw:mt-2 tw:text-[12px] tw:text-brand-muted">Click the map to place the pin.</p>
      {['latitude', 'longitude'].map((name) => (
        <Form.Item key={name} name={name} hidden>
          <Input />
        </Form.Item>
      ))}
    </div>
  )
}

export default function RentalPlaceEdit({
  adminName,
  csrfToken,
  success,
  error,
  place,
  form,
}: Props) {
  const value = (key: string, fallback: unknown) =>
    form?.[key] !== undefined ? form[key] : (fallback ?? '')
  return (
    <AdminLayout
      title={place ? 'Edit pickup place' : 'New pickup place'}
      active="rental-places"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/places">
        ← Back to pickup places
      </a>
      <div className="page-head tw:mb-6">
        <h1>{place ? place.name_en : 'New pickup place'}</h1>
      </div>
      <RentalFormShell
        id="rental-place-form"
        action={place ? `/admin/rentals/places/${place.id}/save` : '/admin/rentals/places'}
        csrfToken={csrfToken}
        cancelHref="/admin/rentals/places"
        submitLabel="Save place"
        initialValues={{
          nameEn: value('nameEn', place?.name_en),
          nameAr: value('nameAr', place?.name_ar),
          subtitleEn: value('subtitleEn', place?.subtitle_en),
          subtitleAr: value('subtitleAr', place?.subtitle_ar),
          latitude: String(value('latitude', place?.latitude)),
          longitude: String(value('longitude', place?.longitude)),
          sortOrder: Number(value('sortOrder', place?.sort_order ?? 0)),
          active: form?.active !== undefined ? Boolean(form.active) : (place?.active ?? true),
        }}
      >
        <FormSection title="Pickup place">
          <FormField
            label="Name (English)"
            name="nameEn"
            required
            message="Enter the English name."
            hint="Shown in the app list, e.g. Kuwait International Airport."
          >
            <Input maxLength={160} />
          </FormField>
          <FormField label="Name (Arabic)" name="nameAr">
            <Input dir="rtl" lang="ar" maxLength={160} />
          </FormField>
          <FormField
            label="Second line (English)"
            name="subtitleEn"
            hint="Area or entrance, e.g. Kuwait City · Main entrance."
          >
            <Input maxLength={200} />
          </FormField>
          <FormField label="Second line (Arabic)" name="subtitleAr">
            <Input dir="rtl" lang="ar" maxLength={200} />
          </FormField>
          <PinField />
          <FormField label="Display order" name="sortOrder">
            <InputNumber min={0} max={9999} precision={0} className="tw:w-full" />
          </FormField>
          <SwitchField
            label="Status"
            name="active"
            hint="Inactive places are hidden from the app."
          />
        </FormSection>
      </RentalFormShell>
    </AdminLayout>
  )
}
