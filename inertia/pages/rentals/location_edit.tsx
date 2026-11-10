import { Button, DatePicker, Form, Input, InputNumber, Select, Switch, TimePicker } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import AdminLayout from '../../layouts/admin_layout'
import OpenMapAddressSearch from '../../components/open_map_address_search'
import {
  FormField,
  FormSection,
  RentalFormShell,
  SwitchField,
  type SharedProps,
} from '../../components/rental_ui'

type Location = {
  id: number
  phone: string | null
  place_id: number | null
  hours_enabled: boolean
  name_en: string
  name_ar: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  active: boolean
  sort_order: number
}

type Shift = { opens: string; closes: string }
type Day = { mode: 'closed' | 'open24' | 'shifts'; shifts: Shift[] }
type Closure = { startsOn: string; endsOn: string; reason: string | null }

type Props = SharedProps & {
  provider: { id: number; name: string }
  places: { value: string; label: string }[]
  location: Location | null
  schedule: Day[] | null
  closures: Closure[]
  form: Record<string, unknown> | null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const defaultSchedule: Day[] = WEEKDAYS.map(() => ({
  mode: 'shifts',
  shifts: [{ opens: '09:00', closes: '21:00' }],
}))
const TIME = 'HH:mm'
const DATE = 'YYYY-MM-DD'

/** Working hours for each weekday: closed, open 24 hours, or up to two shifts. */
function BranchHoursField() {
  const form = Form.useFormInstance()
  const enabled = Form.useWatch('hoursEnabled', form)
  const schedule = (Form.useWatch('schedule', form) as Day[] | undefined) ?? []
  return (
    <section className="cms-form-section">
      <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
        <h2>Working hours</h2>
        <span className="tw:flex tw:items-center tw:gap-2 tw:text-[13px]">
          Set working hours
          <Form.Item name="hoursEnabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </span>
      </div>
      <p className="tw:mt-2 tw:text-[13px] tw:text-brand-muted">
        {enabled
          ? 'Pickups and returns are only accepted during these hours (Kuwait time).'
          : 'No fixed hours: pickups and returns are accepted at any time.'}
      </p>
      <div className={enabled ? 'tw:mt-4 tw:flex tw:flex-col tw:gap-3' : 'tw:hidden'}>
        {WEEKDAYS.map((dayName, index) => (
          <div
            key={dayName}
            className="tw:grid tw:grid-cols-[120px_200px_1fr] tw:items-start tw:gap-3 tw:max-[900px]:grid-cols-1"
          >
            <strong className="tw:pt-2 tw:text-[14px]">{dayName}</strong>
            <Form.Item name={['schedule', index, 'mode']} className="tw:mb-0">
              <Select
                options={[
                  { value: 'shifts', label: 'Open' },
                  { value: 'open24', label: 'Open 24 hours' },
                  { value: 'closed', label: 'Closed' },
                ]}
              />
            </Form.Item>
            {schedule[index]?.mode === 'shifts' ? (
              <Form.List name={['schedule', index, 'shifts']}>
                {(fields, { add, remove }) => (
                  <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                    {fields.map((field) => (
                      <span key={field.key} className="tw:flex tw:items-center tw:gap-1">
                        <Form.Item
                          name={field.name}
                          className="tw:mb-0"
                          rules={[
                            {
                              validator: (_, value: Shift | undefined) =>
                                enabled && (!value?.opens || !value?.closes)
                                  ? Promise.reject(new Error('Choose opening and closing times.'))
                                  : Promise.resolve(),
                            },
                          ]}
                          getValueProps={(value: Shift | undefined) => ({
                            value:
                              value?.opens && value?.closes
                                ? [dayjs(value.opens, TIME), dayjs(value.closes, TIME)]
                                : null,
                          })}
                          normalize={(range: [Dayjs, Dayjs] | null) =>
                            range
                              ? { opens: range[0].format(TIME), closes: range[1].format(TIME) }
                              : { opens: '', closes: '' }
                          }
                        >
                          <TimePicker.RangePicker format={TIME} minuteStep={15} order />
                        </Form.Item>
                        {fields.length > 1 && (
                          <Button
                            type="text"
                            danger
                            aria-label="Remove shift"
                            onClick={() => remove(field.name)}
                          >
                            ×
                          </Button>
                        )}
                      </span>
                    ))}
                    {fields.length < 2 && (
                      <Button onClick={() => add({ opens: '16:00', closes: '22:00' })}>
                        + Second shift
                      </Button>
                    )}
                  </div>
                )}
              </Form.List>
            ) : (
              <span className="tw:pt-2 tw:text-[13px] tw:text-brand-muted">
                {schedule[index]?.mode === 'open24' ? 'All day' : 'No pickups or returns'}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/** Dates when the branch is closed, e.g. public holidays. */
function ClosedDatesField() {
  return (
    <section className="cms-form-section">
      <h2>Closed dates</h2>
      <p className="tw:mt-2 tw:text-[13px] tw:text-brand-muted">
        No pickups or returns on these days, whatever the working hours. Past dates are removed
        automatically from the app.
      </p>
      <Form.List name="closures">
        {(fields, { add, remove }) => (
          <div className="tw:mt-4 tw:flex tw:flex-col tw:gap-3">
            {fields.map((field) => (
              <div
                key={field.key}
                className="tw:grid tw:grid-cols-[minmax(0,320px)_1fr_auto] tw:items-start tw:gap-3 tw:max-[900px]:grid-cols-1"
              >
                <Form.Item
                  name={[field.name, 'range']}
                  className="tw:mb-0"
                  rules={[{ required: true, message: 'Choose the closed dates.' }]}
                  getValueProps={(value: [string, string] | undefined) => ({
                    value: value?.[0] ? [dayjs(value[0], DATE), dayjs(value[1], DATE)] : null,
                  })}
                  normalize={(range: [Dayjs, Dayjs] | null) =>
                    range ? [range[0].format(DATE), range[1].format(DATE)] : undefined
                  }
                >
                  <DatePicker.RangePicker format="D MMM YYYY" className="tw:w-full" />
                </Form.Item>
                <Form.Item name={[field.name, 'reason']} className="tw:mb-0">
                  <Input placeholder="Reason (optional), e.g. National Day" maxLength={200} />
                </Form.Item>
                <Button danger onClick={() => remove(field.name)}>
                  Remove
                </Button>
              </div>
            ))}
            <div>
              <Button onClick={() => add({ range: undefined, reason: '' })}>
                + Add closed dates
              </Button>
            </div>
          </div>
        )}
      </Form.List>
    </section>
  )
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
  provider,
  places,
  location,
  schedule,
  closures,
  form,
}: Props) {
  const providerHref = `/admin/rentals/providers/${provider.id}/edit`
  const value = (key: string, fallback: unknown) =>
    form?.[key] !== undefined ? form[key] : (fallback ?? '')
  return (
    <AdminLayout
      title={location ? 'Edit branch' : 'New branch'}
      active="rental-providers"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href={providerHref}>
        ← Back to {provider.name}
      </a>
      <div className="page-head tw:mb-6">
        <h1>{location ? location.name_en : `New branch of ${provider.name}`}</h1>
      </div>
      <RentalFormShell
        id="rental-location-form"
        action={
          location ? `/admin/rentals/locations/${location.id}/save` : '/admin/rentals/locations'
        }
        csrfToken={csrfToken}
        cancelHref={providerHref}
        submitLabel="Save branch"
        initialValues={{
          providerId: provider.id,
          placeId:
            value('placeId', location?.place_id) === ''
              ? undefined
              : String(value('placeId', location?.place_id)),
          phone: value('phone', location?.phone),
          hoursEnabled:
            form?.hoursEnabled !== undefined
              ? Boolean(form.hoursEnabled)
              : (location?.hours_enabled ?? false),
          schedule: Array.isArray(form?.schedule)
            ? (form.schedule as Day[])
            : (schedule ?? defaultSchedule),
          closures: (Array.isArray(form?.closures) ? (form.closures as Closure[]) : closures).map(
            (closure) => ({
              range: [closure.startsOn, closure.endsOn],
              reason: closure.reason ?? '',
            })
          ),
          nameEn: value('nameEn', location?.name_en),
          nameAr: value('nameAr', location?.name_ar),
          address: value('address', location?.address),
          sortOrder: Number(value('sortOrder', location?.sort_order ?? 0)),
          latitude: String(value('latitude', location?.latitude)),
          longitude: String(value('longitude', location?.longitude)),
          active: form?.active !== undefined ? Boolean(form.active) : (location?.active ?? true),
        }}
      >
        <Form.Item name="providerId" hidden>
          <Input />
        </Form.Item>
        <FormSection title="Branch">
          <FormField
            label="Pickup place"
            name="placeId"
            required
            message="Choose the pickup place this branch serves."
            hint="Customers pick this place in the app. Manage the list under Rental fleet → Pickup places."
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
            hint="Active branches are shown as pickup and return options."
          />
        </FormSection>
        <BranchHoursField />
        <ClosedDatesField />
      </RentalFormShell>
    </AdminLayout>
  )
}
