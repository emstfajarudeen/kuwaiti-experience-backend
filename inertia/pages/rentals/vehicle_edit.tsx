import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import {
  ActionForm,
  Field,
  FieldError,
  formatDateTime,
  inputClass,
  Panel,
  StatusBadge,
  useCan,
  useFieldErrors,
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

const vehicleTypes = ['sedan', 'suv', 'hatchback', 'luxury', 'sports', 'van', 'pickup']
const transmissions = ['automatic', 'manual']
const fuelTypes = ['petrol', 'diesel', 'hybrid', 'electric']
const title = (value: string) => (value === 'suv' ? 'SUV' : value[0].toUpperCase() + value.slice(1))

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
  const errorFor = useFieldErrors()
  const value = (key: string, fallback: unknown) => {
    const flashed = form?.[key]
    const chosen = flashed !== undefined ? flashed : fallback
    return chosen === null || chosen === undefined ? '' : String(chosen)
  }
  const checked = (key: string, fallback: boolean) =>
    form?.[key] !== undefined ? Boolean(form[key]) : fallback
  const selectedLocations = new Set<number>(
    Array.isArray(form?.locationIds)
      ? (form!.locationIds as number[])
      : (vehicle?.location_ids ?? [])
  )
  const action = vehicle ? `/admin/rentals/vehicles/${vehicle.id}/save` : '/admin/rentals/vehicles'
  const canEdit = vehicle ? can('rentals.update') : can('rentals.create')

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
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-center tw:gap-3">
        <h1>{vehicle ? vehicle.name_en : 'New vehicle'}</h1>
        {vehicle && <StatusBadge status={vehicle.status} />}
        {vehicle && can('rentals.publish') && (
          <ActionForm action={`/admin/rentals/vehicles/${vehicle.id}/status`} csrfToken={csrfToken}>
            <input
              type="hidden"
              name="returnTo"
              value={`/admin/rentals/vehicles/${vehicle.id}/edit`}
            />
            <input
              type="hidden"
              name="status"
              value={vehicle.status === 'published' ? 'draft' : 'published'}
            />
            <button type="submit" className="ant-btn ant-btn-default">
              {vehicle.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
          </ActionForm>
        )}
      </div>

      {(options.providers.length === 0 || options.locations.length === 0) && (
        <div className="tw:mb-6 tw:rounded-cms-sm tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-4 tw:text-[14px]">
          Add at least one <a href="/admin/rentals/providers/new">provider</a> and one{' '}
          <a href="/admin/rentals/locations/new">pickup location</a> before adding vehicles.
        </div>
      )}

      <form method="post" action={action} encType="multipart/form-data">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <fieldset disabled={!canEdit} className="tw:m-0 tw:border-0 tw:p-0">
          <Panel title="Vehicle">
            <div className="tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
              <Field label="Provider" name="providerId" required error={errorFor('providerId')}>
                <select
                  id="providerId"
                  name="providerId"
                  className={inputClass}
                  defaultValue={value('providerId', vehicle?.provider_id)}
                  required
                >
                  <option value="">Choose a provider</option>
                  {options.providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                      {provider.active ? '' : ' (inactive)'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Units available"
                name="quantity"
                required
                error={errorFor('quantity')}
                hint="Identical cars the provider can rent out at the same time."
              >
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min={1}
                  max={500}
                  className={inputClass}
                  defaultValue={value('quantity', vehicle?.quantity ?? 1)}
                  required
                />
              </Field>
              <Field
                label="Display name (English)"
                name="nameEn"
                required
                error={errorFor('nameEn')}
              >
                <input
                  id="nameEn"
                  name="nameEn"
                  className={inputClass}
                  maxLength={160}
                  defaultValue={value('nameEn', vehicle?.name_en)}
                  required
                />
              </Field>
              <Field label="Display name (Arabic)" name="nameAr" error={errorFor('nameAr')}>
                <input
                  id="nameAr"
                  name="nameAr"
                  dir="rtl"
                  lang="ar"
                  className={inputClass}
                  maxLength={160}
                  defaultValue={value('nameAr', vehicle?.name_ar)}
                />
              </Field>
              <Field label="Make" name="make" required error={errorFor('make')}>
                <input
                  id="make"
                  name="make"
                  className={inputClass}
                  maxLength={80}
                  defaultValue={value('make', vehicle?.make)}
                  required
                />
              </Field>
              <Field label="Model" name="model" required error={errorFor('model')}>
                <input
                  id="model"
                  name="model"
                  className={inputClass}
                  maxLength={80}
                  defaultValue={value('model', vehicle?.model)}
                  required
                />
              </Field>
              <Field label="Year" name="year" error={errorFor('year')}>
                <input
                  id="year"
                  name="year"
                  type="number"
                  min={1980}
                  max={2100}
                  className={inputClass}
                  defaultValue={value('year', vehicle?.year)}
                />
              </Field>
              <Field
                label="Vehicle type"
                name="vehicleType"
                required
                error={errorFor('vehicleType')}
              >
                <select
                  id="vehicleType"
                  name="vehicleType"
                  className={inputClass}
                  defaultValue={value('vehicleType', vehicle?.vehicle_type ?? 'sedan')}
                >
                  {vehicleTypes.map((item) => (
                    <option key={item} value={item}>
                      {title(item)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Gearbox" name="transmission" required error={errorFor('transmission')}>
                <select
                  id="transmission"
                  name="transmission"
                  className={inputClass}
                  defaultValue={value('transmission', vehicle?.transmission ?? 'automatic')}
                >
                  {transmissions.map((item) => (
                    <option key={item} value={item}>
                      {title(item)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fuel" name="fuelType" required error={errorFor('fuelType')}>
                <select
                  id="fuelType"
                  name="fuelType"
                  className={inputClass}
                  defaultValue={value('fuelType', vehicle?.fuel_type ?? 'petrol')}
                >
                  {fuelTypes.map((item) => (
                    <option key={item} value={item}>
                      {title(item)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Seats" name="seats" required error={errorFor('seats')}>
                <input
                  id="seats"
                  name="seats"
                  type="number"
                  min={1}
                  max={60}
                  className={inputClass}
                  defaultValue={value('seats', vehicle?.seats ?? 5)}
                  required
                />
              </Field>
              <Field label="Doors" name="doors" error={errorFor('doors')}>
                <input
                  id="doors"
                  name="doors"
                  type="number"
                  min={1}
                  max={10}
                  className={inputClass}
                  defaultValue={value('doors', vehicle?.doors)}
                />
              </Field>
              <Field label="Bags" name="bags" error={errorFor('bags')}>
                <input
                  id="bags"
                  name="bags"
                  type="number"
                  min={0}
                  max={20}
                  className={inputClass}
                  defaultValue={value('bags', vehicle?.bags)}
                />
              </Field>
              <Field
                label="Daily mileage limit (km)"
                name="mileageLimitKm"
                error={errorFor('mileageLimitKm')}
                hint="Leave empty for unlimited mileage."
              >
                <input
                  id="mileageLimitKm"
                  name="mileageLimitKm"
                  type="number"
                  min={1}
                  className={inputClass}
                  defaultValue={value('mileageLimitKm', vehicle?.mileage_limit_km)}
                />
              </Field>
              <Field
                label="Minimum driver age"
                name="minDriverAge"
                required
                error={errorFor('minDriverAge')}
              >
                <input
                  id="minDriverAge"
                  name="minDriverAge"
                  type="number"
                  min={18}
                  max={99}
                  className={inputClass}
                  defaultValue={value('minDriverAge', vehicle?.min_driver_age ?? 21)}
                  required
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Pricing (KWD)">
            <div className="tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
              <Field
                label="Daily rate"
                name="dailyRate"
                required
                error={errorFor('dailyRate')}
                hint="Paid by the customer to the provider at pickup."
              >
                <input
                  id="dailyRate"
                  name="dailyRate"
                  inputMode="decimal"
                  pattern="\d{1,7}(\.\d{1,3})?"
                  className={inputClass}
                  defaultValue={value('dailyRate', vehicle?.daily_rate)}
                  required
                />
              </Field>
              <Field
                label="Security deposit"
                name="depositAmount"
                required
                error={errorFor('depositAmount')}
                hint="Held by the provider."
              >
                <input
                  id="depositAmount"
                  name="depositAmount"
                  inputMode="decimal"
                  pattern="\d{1,7}(\.\d{1,3})?"
                  className={inputClass}
                  defaultValue={value('depositAmount', vehicle?.deposit_amount ?? '0')}
                  required
                />
              </Field>
              <label className="tw:flex tw:items-center tw:gap-2 tw:text-[14px]">
                <input
                  type="checkbox"
                  name="withDriverAvailable"
                  value="1"
                  defaultChecked={checked(
                    'withDriverAvailable',
                    vehicle?.with_driver_available ?? false
                  )}
                />
                Offered with a driver
              </label>
              <Field
                label="Driver daily rate"
                name="driverDailyRate"
                error={errorFor('driverDailyRate')}
                hint="Required when offered with a driver."
              >
                <input
                  id="driverDailyRate"
                  name="driverDailyRate"
                  inputMode="decimal"
                  pattern="\d{1,7}(\.\d{1,3})?"
                  className={inputClass}
                  defaultValue={value('driverDailyRate', vehicle?.driver_daily_rate)}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Pickup and return locations">
            <div className="tw:flex tw:flex-wrap tw:gap-4">
              {options.locations.map((location) => (
                <label
                  key={location.id}
                  className="tw:flex tw:items-center tw:gap-2 tw:text-[14px]"
                >
                  <input
                    type="checkbox"
                    name="locationIds"
                    value={location.id}
                    defaultChecked={selectedLocations.has(location.id)}
                  />
                  {location.name}
                  {location.active ? '' : ' (inactive)'}
                </label>
              ))}
            </div>
            <FieldError message={errorFor('locationIds')} />
          </Panel>

          <Panel title="Insurance and terms">
            <div className="tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
              <Field label="Insurance (English)" name="insuranceEn" error={errorFor('insuranceEn')}>
                <textarea
                  id="insuranceEn"
                  name="insuranceEn"
                  rows={4}
                  className={inputClass}
                  maxLength={5000}
                  defaultValue={value('insuranceEn', vehicle?.insurance_en)}
                />
              </Field>
              <Field label="Insurance (Arabic)" name="insuranceAr" error={errorFor('insuranceAr')}>
                <textarea
                  id="insuranceAr"
                  name="insuranceAr"
                  dir="rtl"
                  lang="ar"
                  rows={4}
                  className={inputClass}
                  maxLength={5000}
                  defaultValue={value('insuranceAr', vehicle?.insurance_ar)}
                />
              </Field>
              <Field label="Rental terms (English)" name="termsEn" error={errorFor('termsEn')}>
                <textarea
                  id="termsEn"
                  name="termsEn"
                  rows={6}
                  className={inputClass}
                  maxLength={10000}
                  defaultValue={value('termsEn', vehicle?.terms_en)}
                />
              </Field>
              <Field label="Rental terms (Arabic)" name="termsAr" error={errorFor('termsAr')}>
                <textarea
                  id="termsAr"
                  name="termsAr"
                  dir="rtl"
                  lang="ar"
                  rows={6}
                  className={inputClass}
                  maxLength={10000}
                  defaultValue={value('termsAr', vehicle?.terms_ar)}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Photos">
            <div className="tw:grid tw:grid-cols-2 tw:gap-6 tw:max-[900px]:grid-cols-1">
              <div>
                <span className="image-block-label">Cover photo</span>
                <ImageUpload
                  name="cover"
                  currentImageUrl={vehicle?.cover_url}
                  currentImageAlt="Vehicle cover"
                  removeName="removeCover"
                />
                <FieldError message={errorFor('cover')} />
              </div>
              <div>
                <span className="image-block-label">Add gallery photos (up to 5 per save)</span>
                <ImageUpload name="gallery" multiple maxFiles={5} />
                <FieldError message={errorFor('gallery')} />
              </div>
            </div>
            {vehicle && vehicle.images.length > 0 && (
              <div className="tw:mt-4 tw:flex tw:flex-wrap tw:gap-4">
                {vehicle.images.map((image) => (
                  <label
                    key={image.id}
                    className="tw:flex tw:flex-col tw:items-center tw:gap-1 tw:text-[12px]"
                  >
                    {image.url && (
                      <img
                        src={image.url}
                        alt=""
                        className="tw:h-20 tw:w-28 tw:rounded tw:object-cover"
                      />
                    )}
                    <span>
                      <input type="checkbox" name="removeImageIds" value={image.id} /> Remove
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Panel>

          {canEdit && (
            <div className="cms-form-actions tw:mb-6">
              <a className="ant-btn ant-btn-default" href="/admin/rentals/vehicles">
                Cancel
              </a>
              <button type="submit" className="ant-btn ant-btn-primary">
                {vehicle ? 'Save vehicle' : 'Create vehicle'}
              </button>
            </div>
          )}
        </fieldset>
      </form>

      {vehicle && (
        <Panel title="Unavailable periods">
          <p className="tw:mb-3 tw:text-[13px] tw:text-brand-muted">
            Block all units for maintenance or bookings taken outside the app. Times are in Kuwait
            time.
          </p>
          {vehicle.blocks.length > 0 && (
            <ul className="tw:mb-4 tw:flex tw:flex-col tw:gap-2">
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
                      <button type="submit" className="ant-btn ant-btn-default ant-btn-sm">
                        Remove
                      </button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          {can('rentals.update') && (
            <ActionForm
              action={`/admin/rentals/vehicles/${vehicle.id}/blocks`}
              csrfToken={csrfToken}
              className="tw:flex tw:flex-wrap tw:items-end tw:gap-3"
            >
              <Field label="From" name="startsAtLocal" error={errorFor('startsAt')}>
                <input
                  id="startsAtLocal"
                  type="datetime-local"
                  className={inputClass}
                  required
                  onChange={(event) => {
                    const hidden = event.currentTarget.form?.elements.namedItem(
                      'startsAt'
                    ) as HTMLInputElement
                    hidden.value = event.currentTarget.value
                      ? `${event.currentTarget.value}:00+03:00`
                      : ''
                  }}
                />
              </Field>
              <input type="hidden" name="startsAt" />
              <Field label="To" name="endsAtLocal" error={errorFor('endsAt')}>
                <input
                  id="endsAtLocal"
                  type="datetime-local"
                  className={inputClass}
                  required
                  onChange={(event) => {
                    const hidden = event.currentTarget.form?.elements.namedItem(
                      'endsAt'
                    ) as HTMLInputElement
                    hidden.value = event.currentTarget.value
                      ? `${event.currentTarget.value}:00+03:00`
                      : ''
                  }}
                />
              </Field>
              <input type="hidden" name="endsAt" />
              <Field label="Reason" name="reason">
                <input id="reason" name="reason" className={inputClass} maxLength={200} />
              </Field>
              <button type="submit" className="ant-btn ant-btn-default">
                Add period
              </button>
            </ActionForm>
          )}
        </Panel>
      )}

      {vehicle && can('rentals.delete') && (
        <ActionForm
          action={`/admin/rentals/vehicles/${vehicle.id}/delete`}
          csrfToken={csrfToken}
          confirm="Delete this vehicle? Vehicles with bookings cannot be deleted."
        >
          <button type="submit" className="ant-btn ant-btn-default ant-btn-dangerous">
            Delete vehicle
          </button>
        </ActionForm>
      )}
    </AdminLayout>
  )
}
