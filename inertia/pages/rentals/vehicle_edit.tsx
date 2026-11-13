import { useEffect, useState } from 'react'
import { Button, Form, Input, InputNumber, Select, Switch } from 'antd'
import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import FormSelect from '../../components/form_select'
import ImageUpload from '../../components/image_upload'
import GallerySorter from '../../components/gallery_sorter'
import {
  FormField,
  FormSection,
  RentalFormShell,
  CreatableSelect,
  useCan,
  usePortal,
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
  extra_km_rate: string | null
  daily_rate: string
  with_driver_available: boolean
  driver_daily_rate: string | null
  quantity: number
  insurance_option_id: number | null
  rental_mode: 'self_drive' | 'with_driver' | 'both'
  terms: { label_en: string; label_ar: string | null }[]
  cover_url: string | null
  status: string
  location_ids: number[]
  images: { id: number; url: string | null; sort_order: number }[]
}

type Option = { id: number; name: string; active: boolean; provider_id?: number }
type Props = SharedProps & {
  vehicle: Vehicle | null
  form: Record<string, unknown> | null
  options: {
    providers: Option[]
    locations: Option[]
    vehicleTypes: { value: string; label: string }[]
    insuranceOptions: { value: string; label: string }[]
  }
}

/** Searchable multi-select for pickup and return locations; posts native locationIds inputs. */
function LocationsField({ locations: all }: { locations: Option[] }) {
  const form = Form.useFormInstance()
  const portal = usePortal()
  const providerId = Number(Form.useWatch('providerId', form))
  const locations = all.filter((location) => location.provider_id === providerId)
  const selected = (Form.useWatch('locationIds', form) as number[] | undefined) ?? []
  const allowed = new Set(locations.map((location) => location.id))
  useEffect(() => {
    // Branches belong to one provider: drop picks that no longer match. Wait until the
    // provider is known, or the saved picks are cleared while the form is still loading.
    if (!providerId) return
    const current = (form.getFieldValue('locationIds') as number[] | undefined) ?? []
    const kept = current.filter((id) => allowed.has(id))
    if (kept.length !== current.length) form.setFieldValue('locationIds', kept)
  }, [providerId])
  const options = locations.map((location) => ({
    value: location.id,
    label: location.active ? location.name : `${location.name} (inactive)`,
  }))
  return (
    <section className="cms-form-section">
      <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
        <h2>Pickup branches</h2>
        <span className="tw:flex tw:items-center tw:gap-3 tw:text-[13px]">
          <span className="tw:text-brand-muted">
            {selected.length} of {locations.length} selected
          </span>
          <Button
            size="small"
            disabled={selected.length === locations.length}
            onClick={() =>
              form.setFieldValue(
                'locationIds',
                locations.map((location) => location.id)
              )
            }
          >
            Select all
          </Button>
          <Button
            size="small"
            disabled={selected.length === 0}
            onClick={() => form.setFieldValue('locationIds', [])}
          >
            Clear
          </Button>
        </span>
      </div>
      <Form.Item
        name="locationIds"
        className="tw:mt-4"
        rules={[{ required: true, type: 'array', min: 1, message: 'Choose at least one branch.' }]}
      >
        <Select
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={providerId ? 'Search and choose branches' : 'Choose a provider first'}
          disabled={!providerId}
          notFoundContent={
            portal
              ? 'You have no branches yet. Add them under Branches.'
              : 'This provider has no branches yet. Add them on the provider page.'
          }
          options={options}
          maxTagCount="responsive"
          className="tw:w-full"
        />
      </Form.Item>
      {selected.map((id) => (
        <input key={id} type="hidden" name="locationIds" value={id} />
      ))}
    </section>
  )
}

/** Shown only when the vehicle is offered with a driver. */
function DriverRateField() {
  const form = Form.useFormInstance()
  const mode = Form.useWatch('rentalMode', form)
  if (!mode || mode === 'self_drive') return null
  return (
    <FormField
      label="Driver daily rate"
      name="driverDailyRate"
      required
      message="Enter the driver daily rate."
      hint="Added per day when the customer books with a driver."
      rules={[{ pattern: /^\d{1,7}(\.\d{1,3})?$/, message: 'Use an amount like 8.000.' }]}
    >
      <Input name="driverDailyRate" inputMode="decimal" />
    </FormField>
  )
}

type TermItem = { labelEn?: string; labelAr?: string | null }

/** Rental terms shown as chips in the app, in this order. Posted as JSON with the form. */
function RentalTermsField() {
  const form = Form.useFormInstance()
  const terms = (Form.useWatch('terms', form) as TermItem[] | undefined) ?? []
  return (
    <section className="cms-form-section">
      <h2>Rental terms</h2>
      <p className="tw:mt-2 tw:text-[13px] tw:text-brand-muted">
        Short items shown as chips in the app, for example “21+ age”, “KD 100 deposit” or “No
        smoking”. Use the arrows to set the order.
      </p>
      <input type="hidden" name="termsJson" value={JSON.stringify(terms)} />
      <Form.List name="terms">
        {(fields, { add, remove, move }) => (
          <div className="tw:mt-4 tw:flex tw:flex-col tw:gap-3">
            {fields.map((field, index) => (
              <div
                key={field.key}
                className="tw:grid tw:grid-cols-[1fr_1fr_auto] tw:items-start tw:gap-3 tw:max-[900px]:grid-cols-1"
              >
                <Form.Item
                  name={[field.name, 'labelEn']}
                  rules={[
                    { required: true, whitespace: true, message: 'Enter the English text.' },
                    { max: 200, message: 'Keep it under 200 characters.' },
                  ]}
                  className="tw:mb-0"
                >
                  <Input placeholder="English, e.g. 21+ age" maxLength={200} />
                </Form.Item>
                <Form.Item
                  name={[field.name, 'labelAr']}
                  rules={[{ max: 200, message: 'Keep it under 200 characters.' }]}
                  className="tw:mb-0"
                >
                  <Input placeholder="Arabic" dir="rtl" lang="ar" maxLength={200} />
                </Form.Item>
                <div className="tw:flex tw:gap-1">
                  <Button
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    ↑
                  </Button>
                  <Button
                    aria-label="Move down"
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    ↓
                  </Button>
                  <Button danger aria-label="Remove term" onClick={() => remove(field.name)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Button
                onClick={() => add({ labelEn: '', labelAr: '' })}
                disabled={fields.length >= 20}
              >
                + Add term
              </Button>
            </div>
          </div>
        )}
      </Form.List>
    </section>
  )
}

const label = (value: string) => (value === 'suv' ? 'SUV' : value[0].toUpperCase() + value.slice(1))
const choices = (values: string[]) => values.map((value) => ({ value, label: label(value) }))
const rentalModes = [
  { value: 'self_drive', label: 'Self-drive only' },
  { value: 'with_driver', label: 'With driver only' },
  { value: 'both', label: 'Self-drive or with driver' },
]
const transmissions = choices(['automatic', 'manual'])
const fuelTypes = choices(['petrol', 'diesel', 'hybrid', 'electric'])
const moneyRule = { pattern: /^\d{1,7}(\.\d{1,3})?$/, message: 'Use an amount like 12.500.' }

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
  const portal = usePortal()
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
      active="rental-vehicles"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/vehicles">
        ← Back to fleet
      </a>
      <div className="page-head tw:mb-6">
        <h1>{vehicle ? vehicle.name_en : 'New vehicle'}</h1>
      </div>

      {portal
        ? options.locations.length === 0 && (
            <div className="tw:mb-6 tw:rounded-cms-sm tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-4 tw:text-[14px]">
              Add a <a href="/admin/rentals/locations/new">branch</a> first, so customers know where
              to pick up this vehicle.
            </div>
          )
        : (options.providers.length === 0 || options.locations.length === 0) && (
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
            <Button
              danger
              className="cms-form-actions-start"
              onClick={() => setConfirmDelete(true)}
            >
              Delete vehicle
            </Button>
          ) : null
        }
        initialValues={{
          providerId: String(value('providerId', vehicle?.provider_id ?? portal?.id)),
          nameEn: value('nameEn', vehicle?.name_en),
          nameAr: value('nameAr', vehicle?.name_ar),
          make: value('make', vehicle?.make),
          model: value('model', vehicle?.model),
          year: value('year', vehicle?.year) === '' ? null : Number(value('year', vehicle?.year)),
          vehicleType: String(value('vehicleType', vehicle?.vehicle_type ?? 'sedan')),
          transmission: String(value('transmission', vehicle?.transmission ?? 'automatic')),
          fuelType: String(value('fuelType', vehicle?.fuel_type ?? 'petrol')),
          seats: Number(value('seats', vehicle?.seats ?? 5)),
          doors:
            value('doors', vehicle?.doors) === '' ? null : Number(value('doors', vehicle?.doors)),
          bags: value('bags', vehicle?.bags) === '' ? null : Number(value('bags', vehicle?.bags)),
          mileageLimitKm:
            value('mileageLimitKm', vehicle?.mileage_limit_km) === ''
              ? null
              : Number(value('mileageLimitKm', vehicle?.mileage_limit_km)),
          quantity: Number(value('quantity', vehicle?.quantity ?? 1)),
          dailyRate: String(value('dailyRate', vehicle?.daily_rate)),
          extraKmRate: String(value('extraKmRate', vehicle?.extra_km_rate)),
          rentalMode: String(value('rentalMode', vehicle?.rental_mode ?? 'self_drive')),
          insuranceOptionId: String(value('insuranceOptionId', vehicle?.insurance_option_id)),
          driverDailyRate: String(value('driverDailyRate', vehicle?.driver_daily_rate)),
          locationIds: [...selectedLocations],
          terms: Array.isArray(form?.terms)
            ? (form.terms as TermItem[])
            : (vehicle?.terms ?? []).map((term) => ({
                labelEn: term.label_en,
                labelAr: term.label_ar ?? '',
              })),
        }}
      >
        <FormSection
          title="Vehicle"
          actions={
            vehicle ? (
              <Switch
                aria-label="Vehicle active in the app"
                checkedChildren="Active"
                unCheckedChildren="Inactive"
                checked={vehicle.status === 'published'}
                loading={switching}
                disabled={!can('rentals.publish') || switching}
                onChange={changeStatus}
              />
            ) : null
          }
        >
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
                options={options.providers.map((provider) => ({
                  value: String(provider.id),
                  label: provider.active ? provider.name : `${provider.name} (inactive)`,
                }))}
                onChange={() => undefined}
              />
            </FormField>
          )}
          <FormField
            label="Units available"
            name="quantity"
            required
            hint={
              portal
                ? 'Identical cars you can rent out at the same time.'
                : 'Identical cars the provider can rent out at the same time.'
            }
          >
            <InputNumber name="quantity" min={1} max={500} precision={0} className="tw:w-full" />
          </FormField>
          <FormField
            label="Display name (English)"
            name="nameEn"
            required
            message="Enter the English name."
          >
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
          <FormField
            label="Vehicle type"
            name="vehicleType"
            required
            message="Choose a vehicle type."
          >
            <CreatableSelect
              name="vehicleType"
              noun="vehicle type"
              placeholder="Choose a vehicle type"
              options={options.vehicleTypes}
              createUrl={portal ? undefined : '/admin/rentals/vehicle-types'}
              csrfToken={csrfToken}
            />
          </FormField>
          <FormField label="Gearbox" name="transmission" required>
            <FormSelect
              name="transmission"
              required
              value=""
              options={transmissions}
              onChange={() => undefined}
            />
          </FormField>
          <FormField label="Fuel" name="fuelType" required>
            <FormSelect
              name="fuelType"
              required
              value=""
              options={fuelTypes}
              onChange={() => undefined}
            />
          </FormField>
          <FormField label="Seats" name="seats" required message="Enter the number of seats.">
            <InputNumber name="seats" min={1} max={60} precision={0} className="tw:w-full" />
          </FormField>
          <FormField label="Doors" name="doors">
            <InputNumber name="doors" min={1} max={10} precision={0} className="tw:w-full" />
          </FormField>
          <FormField
            label="Luggage (suitcases)"
            name="bags"
            hint="How many large suitcases fit in the boot."
          >
            <InputNumber name="bags" min={0} max={20} precision={0} className="tw:w-full" />
          </FormField>
          <FormField label="Insurance cover" name="insuranceOptionId">
            <CreatableSelect
              name="insuranceOptionId"
              noun="insurance option"
              placeholder="Choose the insurance cover"
              allowClear
              options={options.insuranceOptions}
              createUrl={portal ? undefined : '/admin/rentals/insurance-options'}
              csrfToken={csrfToken}
            />
          </FormField>
          <FormField
            label="Kilometres included per day"
            name="mileageLimitKm"
            hint="How many km the customer can drive per day for the daily rate. Leave empty for unlimited."
          >
            <InputNumber name="mileageLimitKm" min={1} precision={0} className="tw:w-full" />
          </FormField>
          <FormField
            label="Extra km rate (KWD)"
            name="extraKmRate"
            hint="Charged by the provider per km over the daily limit. Leave empty if not charged."
            rules={[{ pattern: /^$|^\d{1,7}(\.\d{1,3})?$/, message: 'Use an amount like 0.120.' }]}
          >
            <Input name="extraKmRate" inputMode="decimal" />
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
            label="Rental mode"
            name="rentalMode"
            required
            hint="Whether customers drive the car themselves, get a driver, or can choose."
          >
            <FormSelect
              name="rentalMode"
              required
              value=""
              options={rentalModes}
              onChange={() => undefined}
            />
          </FormField>
          <DriverRateField />
        </FormSection>

        <LocationsField locations={options.locations} />

        <RentalTermsField />

        <section className="cms-form-section">
          <h2>Photos</h2>
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
            <GallerySorter
              key={(vehicle?.images ?? []).map((image) => image.id).join('-') || 'new'}
              images={(vehicle?.images ?? []).map((image) => ({
                id: image.id,
                url: image.url,
                sort_order: image.sort_order,
                alt_en: null,
                alt_ar: null,
                caption_en: null,
                caption_ar: null,
              }))}
              maxFiles={5}
            />
          </div>
        </section>
      </RentalFormShell>

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
