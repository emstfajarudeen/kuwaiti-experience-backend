import { useState } from 'react'
import { Button, Checkbox, DatePicker, Form, Input, InputNumber, Switch } from 'antd'
import type { Dayjs } from 'dayjs'
import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import FormSelect from '../../components/form_select'
import ImageUpload from '../../components/image_upload'
import { postCmsForm } from '../../lib/cms_form'
import {
  ActionForm,
  FormField,
  FormSection,
  formatDateTime,
  Panel,
  RentalFormShell,
  useCan,
  type SharedProps,
} from '../../components/rental_ui'

type Vehicle = {
  id: number
  provider_id: number
  name_en: string
  name_ar: string | null
  make: string
  model: string
  year: number | null
  vehicle_type: string
  transmission: string
  fuel_type: string
  seats: number
  doors: number | null
  bags: number | null
  mileage_limit_km: number | null
  daily_rate: string
  deposit_amount: string
  with_driver_available: boolean
  driver_daily_rate: string | null
  min_driver_age: number
  quantity: number
  insurance_en: string | null
  insurance_ar: string | null
  terms_en: string | null
  terms_ar: string | null
  cover_url: string | null
  status: string
  location_ids: number[]
  images: { id: number; url: string | null }[]
  blocks: { id: number; starts_at: string; ends_at: string; reason: string | null }[]
}

type Option = { id: number; name: string; active: boolean }
type Props = SharedProps & {
  vehicle: Vehicle | null
  form: Record<string, unknown> | null
  options: { providers: Option[]; locations: Option[] }
}

const label = (value: string) => (value === 'suv' ? 'SUV' : value[0].toUpperCase() + value.slice(1))
const choices = (values: string[]) => values.map((value) => ({ value, label: label(value) }))
const vehicleTypes = choices(['sedan', 'suv', 'hatchback', 'luxury', 'sports', 'van', 'pickup'])
const transmissions = choices(['automatic', 'manual'])
const fuelTypes = choices(['petrol', 'diesel', 'hybrid', 'electric'])
const moneyRule = { pattern: /^\d{1,7}(\.\d{1,3})?$/, message: 'Use an amount like 12.500.' }

/** Block all units for a period. Picked times are Kuwait time (UTC+3). */
function BlockForm({ vehicleId, csrfToken }: { vehicleId: number; csrfToken: string }) {
  const [form] = Form.useForm<{ range: [Dayjs, Dayjs]; reason?: string }>()
  const [processing, setProcessing] = useState(false)
  const stamp = (value: Dayjs) => `${value.format('YYYY-MM-DDTHH:mm')}:00+03:00`
  return (
    <Form
      form={form}
      layout="vertical"
      className="tw:flex tw:flex-wrap tw:items-end tw:gap-4"
      onFinish={(values) =>
        postCmsForm({
          action: `/admin/rentals/vehicles/${vehicleId}/blocks`,
          csrfToken,
          form,
          setProcessing,
          data: {
            startsAt: stamp(values.range[0]),
            endsAt: stamp(values.range[1]),
            reason: values.reason ?? '',
          },
          onSuccess: () => form.resetFields(),
        })
      }
    >
      <Form.Item
        name="range"
        label="Period"
        rules={[{ required: true, message: 'Choose the start and end.' }]}
      >
        <DatePicker.RangePicker
          showTime={{ format: 'HH:mm' }}
          format="DD/MM/YYYY HH:mm"
          allowClear={false}
          className="tw:min-w-[360px]"
        />
      </Form.Item>
      <Form.Item name="reason" label="Reason">
        <Input maxLength={200} placeholder="Maintenance" className="tw:min-w-[220px]" />
      </Form.Item>
      <Form.Item>
        <Button htmlType="submit" loading={processing}>
          Add period
        </Button>
      </Form.Item>
    </Form>
  )
}

export default function RentalVehicleEdit({
  adminName,
  csrfToken,
  success,
  error,
  vehicle,
  form,
  options,
}: Props) {
  const can = useCan()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [switching, setSwitching] = useState(false)
  const value = (key: string, fallback: unknown) =>
    form?.[key] !== undefined ? form[key] : (fallback ?? '')
  const selectedLocations = new Set<number>(
    Array.isArray(form?.locationIds)
      ? (form.locationIds as number[])
      : (vehicle?.location_ids ?? [])
  )
  const canEdit = vehicle ? can('rentals.update') : can('rentals.create')
  const changeStatus = (active: boolean) =>
    router.post(
      `/admin/rentals/vehicles/${vehicle!.id}/status`,
      {
        status: active ? 'published' : 'draft',
        returnTo: `/admin/rentals/vehicles/${vehicle!.id}/edit`,
        _csrf: csrfToken,
      },
      {
        preserveScroll: true,
        onStart: () => setSwitching(true),
        onFinish: () => setSwitching(false),
      }
    )

  return (
    <AdminLayout
      title={vehicle ? 'Edit vehicle' : 'New vehicle'}
      active="rentals"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/vehicles">
        ← Back to fleet
      </a>
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-center tw:gap-4">
        <h1>{vehicle ? vehicle.name_en : 'New vehicle'}</h1>
        {vehicle && (
          <Switch
            aria-label="Vehicle active"
            checked={vehicle.status === 'published'}
            loading={switching}
            disabled={!can('rentals.publish') || switching}
            onChange={changeStatus}
          />
        )}
      </div>

      {(options.providers.length === 0 || options.locations.length === 0) && (
        <div className="tw:mb-6 tw:rounded-cms-sm tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-4 tw:text-[14px]">
          Add at least one <a href="/admin/rentals/providers/new">provider</a> and one{' '}
          <a href="/admin/rentals/locations/new">pickup location</a> before adding vehicles.
        </div>
      )}

      <RentalFormShell
        id="rental-vehicle-form"
        multipart
        action={vehicle ? `/admin/rentals/vehicles/${vehicle.id}/save` : '/admin/rentals/vehicles'}
        csrfToken={csrfToken}
        cancelHref="/admin/rentals/vehicles"
        submitLabel={vehicle ? 'Save vehicle' : 'Create vehicle'}
        disabled={!canEdit}
        extraActions={
          vehicle && can('rentals.delete') ? (
            <Button danger className="cms-form-actions-start" onClick={() => setConfirmDelete(true)}>
              Delete vehicle
            </Button>
          ) : null
        }
        initialValues={{
          providerId: String(value('providerId', vehicle?.provider_id)),
          nameEn: value('nameEn', vehicle?.name_en),
          nameAr: value('nameAr', vehicle?.name_ar),
          make: value('make', vehicle?.make),
          model: value('model', vehicle?.model),
          year: value('year', vehicle?.year) === '' ? null : Number(value('year', vehicle?.year)),
          vehicleType: String(value('vehicleType', vehicle?.vehicle_type ?? 'sedan')),
          transmission: String(value('transmission', vehicle?.transmission ?? 'automatic')),
          fuelType: String(value('fuelType', vehicle?.fuel_type ?? 'petrol')),
          seats: Number(value('seats', vehicle?.seats ?? 5)),
          doors: value('doors', vehicle?.doors) === '' ? null : Number(value('doors', vehicle?.doors)),
          bags: value('bags', vehicle?.bags) === '' ? null : Number(value('bags', vehicle?.bags)),
          mileageLimitKm:
            value('mileageLimitKm', vehicle?.mileage_limit_km) === ''
              ? null
              : Number(value('mileageLimitKm', vehicle?.mileage_limit_km)),
          minDriverAge: Number(value('minDriverAge', vehicle?.min_driver_age ?? 21)),
          quantity: Number(value('quantity', vehicle?.quantity ?? 1)),
          dailyRate: String(value('dailyRate', vehicle?.daily_rate)),
          depositAmount: String(value('depositAmount', vehicle?.deposit_amount ?? '0')),
          withDriverAvailable:
            form?.withDriverAvailable !== undefined
              ? Boolean(form.withDriverAvailable)
              : (vehicle?.with_driver_available ?? false),
          driverDailyRate: String(value('driverDailyRate', vehicle?.driver_daily_rate)),
          insuranceEn: value('insuranceEn', vehicle?.insurance_en),
          insuranceAr: value('insuranceAr', vehicle?.insurance_ar),
          termsEn: value('termsEn', vehicle?.terms_en),
          termsAr: value('termsAr', vehicle?.terms_ar),
        }}
      >
        <FormSection title="Vehicle">
          <FormField label="Provider" name="providerId" required message="Choose a provider.">
            <FormSelect
              name="providerId"
              required
              value=""
              placeholder="Choose a provider"
              options={options.providers.map((provider) => ({
                value: String(provider.id),
                label: provider.active ? provider.name : `${provider.name} (inactive)`,
              }))}
              onChange={() => undefined}
            />
          </FormField>
          <FormField
            label="Units available"
            name="quantity"
            required
            hint="Identical cars the provider can rent out at the same time."
          >
            <InputNumber name="quantity" min={1} max={500} precision={0} className="tw:w-full" />
          </FormField>
          <FormField label="Display name (English)" name="nameEn" required message="Enter the English name.">
            <Input name="nameEn" maxLength={160} />
          </FormField>
          <FormField label="Display name (Arabic)" name="nameAr">
            <Input name="nameAr" dir="rtl" lang="ar" maxLength={160} />
          </FormField>
          <FormField label="Make" name="make" required message="Enter the make.">
            <Input name="make" maxLength={80} />
          </FormField>
          <FormField label="Model" name="model" required message="Enter the model.">
            <Input name="model" maxLength={80} />
          </FormField>
          <FormField label="Year" name="year">
            <InputNumber name="year" min={1980} max={2100} precision={0} className="tw:w-full" />
          </FormField>
          <FormField label="Vehicle type" name="vehicleType" required>
            <FormSelect name="vehicleType" required value="" options={vehicleTypes} onChange={() => undefined} />
          </FormField>
          <FormField label="Gearbox" name="transmission" required>
            <FormSelect name="transmission" required value="" options={transmissions} onChange={() => undefined} />
          </FormField>
          <FormField label="Fuel" name="fuelType" required>
            <FormSelect name="fuelType" required value="" options={fuelTypes} onChange={() => undefined} />
          </FormField>
          <FormField label="Seats" name="seats" required message="Enter the number of seats.">
            <InputNumber name="seats" min={1} max={60} precision={0} className="tw:w-full" />
          </FormField>
          <FormField label="Doors" name="doors">
            <InputNumber name="doors" min={1} max={10} precision={0} className="tw:w-full" />
          </FormField>
          <FormField label="Bags" name="bags">
            <InputNumber name="bags" min={0} max={20} precision={0} className="tw:w-full" />
          </FormField>
          <FormField
            label="Daily mileage limit (km)"
            name="mileageLimitKm"
            hint="Leave empty for unlimited mileage."
          >
            <InputNumber name="mileageLimitKm" min={1} precision={0} className="tw:w-full" />
          </FormField>
          <FormField label="Minimum driver age" name="minDriverAge" required>
            <InputNumber name="minDriverAge" min={18} max={99} precision={0} className="tw:w-full" />
          </FormField>
        </FormSection>

        <FormSection title="Pricing (KWD)">
          <FormField
            label="Daily rate"
            name="dailyRate"
            required
            message="Enter the daily rate."
            hint="Paid by the customer to the provider at pickup."
            rules={[moneyRule]}
          >
            <Input name="dailyRate" inputMode="decimal" />
          </FormField>
          <FormField
            label="Security deposit"
            name="depositAmount"
            required
            message="Enter the deposit (0 if none)."
            hint="Held by the provider."
            rules={[moneyRule]}
          >
            <Input name="depositAmount" inputMode="decimal" />
          </FormField>
          <FormField name="withDriverAvailable" valuePropName="checked">
            <Checkbox name="withDriverAvailable">Offered with a driver</Checkbox>
          </FormField>
          <FormField
            label="Driver daily rate"
            name="driverDailyRate"
            hint="Required when offered with a driver."
            rules={[{ pattern: /^$|^\d{1,7}(\.\d{1,3})?$/, message: 'Use an amount like 8.000.' }]}
          >
            <Input name="driverDailyRate" inputMode="decimal" />
          </FormField>
        </FormSection>

        <section className="cms-form-section">
          <h2>Pickup and return locations</h2>
          <div className="tw:mt-4 tw:flex tw:flex-wrap tw:gap-x-6 tw:gap-y-3">
            {options.locations.map((location) => (
              <Checkbox
                key={location.id}
                name="locationIds"
                value={location.id}
                defaultChecked={selectedLocations.has(location.id)}
              >
                {location.active ? location.name : `${location.name} (inactive)`}
              </Checkbox>
            ))}
          </div>
        </section>

        <FormSection title="Insurance and terms">
          <FormField label="Insurance (English)" name="insuranceEn">
            <Input.TextArea name="insuranceEn" rows={4} maxLength={5000} />
          </FormField>
          <FormField label="Insurance (Arabic)" name="insuranceAr">
            <Input.TextArea name="insuranceAr" dir="rtl" lang="ar" rows={4} maxLength={5000} />
          </FormField>
          <FormField label="Rental terms (English)" name="termsEn">
            <Input.TextArea name="termsEn" rows={6} maxLength={10000} />
          </FormField>
          <FormField label="Rental terms (Arabic)" name="termsAr">
            <Input.TextArea name="termsAr" dir="rtl" lang="ar" rows={6} maxLength={10000} />
          </FormField>
        </FormSection>

        <section className="cms-form-section">
          <h2>Photos</h2>
          <div className="tw:mt-4 tw:grid tw:grid-cols-2 tw:gap-6 tw:max-[900px]:grid-cols-1">
            <div className="image-block">
              <span className="image-block-label">Cover photo</span>
              <ImageUpload
                name="cover"
                currentImageUrl={vehicle?.cover_url}
                currentImageAlt="Vehicle cover"
                removeName="removeCover"
              />
            </div>
            <div className="image-block">
              <span className="image-block-label">Add gallery photos (up to 5 per save)</span>
              <ImageUpload name="gallery" multiple maxFiles={5} />
            </div>
          </div>
          {vehicle && vehicle.images.length > 0 && (
            <div className="tw:mt-5">
              <span className="image-block-label">Gallery</span>
              <div className="tw:mt-2 tw:flex tw:flex-wrap tw:gap-4">
                {vehicle.images.map((image) => (
                  <div key={image.id} className="tw:flex tw:flex-col tw:items-start tw:gap-2">
                    {image.url && (
                      <img
                        src={image.url}
                        alt=""
                        className="tw:h-24 tw:w-32 tw:rounded-cms-sm tw:object-cover"
                      />
                    )}
                    <Checkbox name="removeImageIds" value={image.id}>
                      Remove on save
                    </Checkbox>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </RentalFormShell>

      {vehicle && (
        <Panel title="Unavailable periods">
          <p className="tw:mb-4 tw:text-[13px] tw:text-brand-muted">
            Block all units for maintenance or bookings taken outside the app. Times are Kuwait
            time.
          </p>
          {vehicle.blocks.length > 0 && (
            <ul className="tw:mb-5 tw:flex tw:flex-col tw:gap-3">
              {vehicle.blocks.map((block) => (
                <li
                  key={block.id}
                  className="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:text-[14px]"
                >
                  <span>
                    {formatDateTime(block.starts_at)} → {formatDateTime(block.ends_at)}
                    {block.reason ? ` · ${block.reason}` : ''}
                  </span>
                  {can('rentals.update') && (
                    <ActionForm
                      action={`/admin/rentals/vehicles/${vehicle.id}/blocks/${block.id}/delete`}
                      csrfToken={csrfToken}
                    >
                      <Button htmlType="submit" size="small" danger>
                        Remove
                      </Button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          {can('rentals.update') && <BlockForm vehicleId={vehicle.id} csrfToken={csrfToken} />}
        </Panel>
      )}

      {vehicle && (
        <ConfirmModal
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete vehicle"
          message={`Delete ${vehicle.name_en}? Vehicles that have bookings cannot be deleted; deactivate them instead.`}
          action={`/admin/rentals/vehicles/${vehicle.id}/delete`}
          csrfToken={csrfToken}
          confirmLabel="Delete"
          danger
        />
      )}
    </AdminLayout>
  )
}
