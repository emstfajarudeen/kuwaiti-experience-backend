import { Button, DatePicker, Form, Input, Select, Switch, TimePicker } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import AdminLayout from '../../layouts/admin_layout'
import { RentalFormShell, type SharedProps } from '../../components/rental_ui'

type Shift = { opens: string; closes: string }
type Day = { mode: 'closed' | 'open24' | 'shifts'; shifts: Shift[] }
type Closure = { startsOn: string; endsOn: string; reason: string | null }
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
            className="tw:grid tw:grid-cols-[120px_200px_1fr] tw:items-center tw:gap-3 tw:max-[900px]:grid-cols-1"
          >
            <strong className="tw:text-[14px]">{dayName}</strong>
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
                          <TimePicker.RangePicker
                            className="rental-range-plain"
                            format={TIME}
                            minuteStep={15}
                            order
                          />
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
              <span className="tw:text-[13px] tw:text-brand-muted">
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
                className="tw:grid tw:grid-cols-[minmax(0,320px)_1fr_auto] tw:items-center tw:gap-3 tw:max-[900px]:grid-cols-1"
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
                  <DatePicker.RangePicker
                    format="D MMM YYYY"
                    className="tw:w-full rental-range-plain"
                  />
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
              <button
                type="button"
                className="button primary"
                onClick={() => add({ range: undefined, reason: '' })}
              >
                + Add closed dates
              </button>
            </div>
          </div>
        )}
      </Form.List>
    </section>
  )
}

type Props = SharedProps & {
  branch: {
    id: number
    name_en: string
    provider_name: string | null
    provider_id: number | null
    hours_enabled: boolean
  }
  schedule: Day[]
  closures: Closure[]
  form: Record<string, unknown> | null
}

export default function RentalBranchHours({
  adminName,
  csrfToken,
  success,
  error,
  branch,
  schedule,
  closures,
  form,
}: Props) {
  const backHref = branch.provider_id
    ? `/admin/rentals/working-hours?provider=${branch.provider_id}`
    : '/admin/rentals/working-hours'
  const hasHours = schedule.some((day) => day.mode !== 'closed')
  return (
    <AdminLayout
      title="Working hours"
      active="rental-hours"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href={backHref}>
        ← Back to working hours
      </a>
      <div className="page-head tw:mb-6">
        <h1>
          {branch.name_en}
          {branch.provider_name ? ` · ${branch.provider_name}` : ''}
        </h1>
      </div>
      <RentalFormShell
        id="rental-branch-hours-form"
        action={`/admin/rentals/locations/${branch.id}/hours`}
        csrfToken={csrfToken}
        cancelHref={backHref}
        submitLabel="Save working hours"
        initialValues={{
          hoursEnabled:
            form?.hoursEnabled !== undefined ? Boolean(form.hoursEnabled) : branch.hours_enabled,
          schedule: Array.isArray(form?.schedule)
            ? (form.schedule as Day[])
            : hasHours
              ? schedule
              : defaultSchedule,
          closures: (Array.isArray(form?.closures) ? (form.closures as Closure[]) : closures).map(
            (closure) => ({
              range: [closure.startsOn, closure.endsOn],
              reason: closure.reason ?? '',
            })
          ),
        }}
      >
        <BranchHoursField />
        <ClosedDatesField />
      </RentalFormShell>
    </AdminLayout>
  )
}
