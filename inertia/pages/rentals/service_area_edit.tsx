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

type Area = {
  id: number
  name_en: string
  name_ar: string | null
  latitude: number
  longitude: number
  active: boolean
  sort_order: number
}

type Props = SharedProps & { area: Area | null; form: Record<string, unknown> | null }

const coordinate = (value: unknown) =>
  value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : Number(value)

/** Pin in the middle of the area; each address belongs to the area with the nearest pin. */
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
      <p className="tw:mt-2 tw:text-[12px] tw:text-brand-muted">
        Click the middle of the area. An address belongs to the area whose pin is nearest.
      </p>
      {['latitude', 'longitude'].map((name) => (
        <Form.Item
          key={name}
          name={name}
          hidden
          rules={[{ required: true, message: 'Place the pin on the map.' }]}
        >
          <Input />
        </Form.Item>
      ))}
    </div>
  )
}

export default function RentalServiceAreaEdit({
  adminName,
  csrfToken,
  success,
  error,
  area,
  form,
}: Props) {
  const value = (key: string, fallback: unknown) =>
    form?.[key] !== undefined ? form[key] : (fallback ?? '')
  return (
    <AdminLayout
      title={area ? 'Edit service area' : 'New service area'}
      active="rental-service-areas"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/service-areas">
        ← Back to service areas
      </a>
      <div className="page-head tw:mb-6">
        <h1>{area ? area.name_en : 'New service area'}</h1>
      </div>
      <RentalFormShell
        id="rental-service-area-form"
        action={
          area ? `/admin/rentals/service-areas/${area.id}/save` : '/admin/rentals/service-areas'
        }
        csrfToken={csrfToken}
        cancelHref="/admin/rentals/service-areas"
        submitLabel="Save area"
        initialValues={{
          nameEn: value('nameEn', area?.name_en),
          nameAr: value('nameAr', area?.name_ar),
          latitude: String(value('latitude', area?.latitude)),
          longitude: String(value('longitude', area?.longitude)),
          sortOrder: Number(value('sortOrder', area?.sort_order ?? 0)),
          active: form?.active !== undefined ? Boolean(form.active) : (area?.active ?? true),
        }}
      >
        <FormSection title="Service area">
          <FormField
            label="Name (English)"
            name="nameEn"
            required
            message="Enter the English name."
            hint="The area name, e.g. Salmiya or Jahra."
          >
            <Input maxLength={160} />
          </FormField>
          <FormField label="Name (Arabic)" name="nameAr">
            <Input dir="rtl" lang="ar" maxLength={160} />
          </FormField>
          <PinField />
          <FormField label="Display order" name="sortOrder">
            <InputNumber min={0} max={9999} precision={0} className="tw:w-full" />
          </FormField>
          <SwitchField
            label="Status"
            name="active"
            hint="Inactive areas are ignored: addresses go to the nearest active area."
          />
        </FormSection>
      </RentalFormShell>
    </AdminLayout>
  )
}
