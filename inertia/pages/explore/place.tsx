import { useState } from 'react'
import { Button, Checkbox, Form, Input } from 'antd'
import type { FormDataConvertible } from '@inertiajs/core'
import AdminLayout from '../../layouts/admin_layout'
import { postCmsForm } from '../../lib/cms_form'

type Interval = {
  interval_index: number
  opens_at: string
  closes_at: string
  closes_next_day: boolean
}
type Day = {
  weekday: number
  name: string
  state: 'unknown' | 'closed' | 'open'
  intervals: Interval[]
}
type Place = {
  id: number
  slug: string
  type: string
  phone_e164: string | null
  check_in_time: string | null
  check_out_time: string | null
  screen_count: number | null
}
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  place: Place
  days: Day[]
}

export default function ExplorePlace({
  adminName,
  csrfToken,
  success,
  error,
  form,
  place,
  days: initialDays,
}: Props) {
  const [days, setDays] = useState(initialDays)
  const [formInstance] = Form.useForm()
  const [processing, setProcessing] = useState(false)
  const setState = (weekday: number, state: Day['state']) =>
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              state,
              intervals:
                state === 'open' && day.intervals.length === 0
                  ? [
                      {
                        interval_index: 0,
                        opens_at: '09:00',
                        closes_at: '22:00',
                        closes_next_day: false,
                      },
                    ]
                  : day.intervals,
            }
          : day
      )
    )
  const addInterval = (weekday: number) =>
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              intervals: [
                ...day.intervals,
                {
                  interval_index: day.intervals.length,
                  opens_at: '17:00',
                  closes_at: '23:00',
                  closes_next_day: false,
                },
              ],
            }
          : day
      )
    )
  const removeInterval = (weekday: number, index: number) =>
    setDays((current) =>
      current.map((day) => {
        if (day.weekday !== weekday) return day
        const intervals = day.intervals
          .filter((_, position) => position !== index)
          .map((interval, position) => ({ ...interval, interval_index: position }))
        return { ...day, intervals, state: intervals.length ? day.state : 'unknown' }
      })
    )
  const updateInterval = (
    weekday: number,
    index: number,
    field: keyof Interval,
    value: string | boolean
  ) =>
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              intervals: day.intervals.map((interval, position) =>
                position === index ? { ...interval, [field]: value } : interval
              ),
            }
          : day
      )
    )
  let globalIndex = 0
  return (
    <AdminLayout
      title="Explore details"
      active="places"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a
        className="back-link tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:600] tw:[margin-bottom:var(--space-3)] tw:[transition:color_0.15s_ease]"
        href={`/admin/places/${place.id}/edit`}
      >
        ← Back to place editor
      </a>
      <div className="page-head form-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Explore details: {place.slug}</h1>
        <div className="form-page-actions"><a className="button secondary" href={`/admin/places/${place.id}/edit`}>Back to place</a><Button className="button primary" htmlType="submit" form="explore-form" loading={processing}>Save Explore details</Button></div>
      </div>
      <Form id="explore-form" component="form" form={formInstance} layout="vertical" onFinish={() => {
        const element = document.getElementById('explore-form') as HTMLFormElement | null
        if (!element) return
        const data = new FormData(element)
        const hours: Record<number, Record<string, string>> = {}
        for (const [key, value] of data.entries()) {
          const match = key.match(/^place_hours\[(\d+)\]\[([^\]]+)\]$/)
          if (match && typeof value === 'string') (hours[Number(match[1])] ??= {})[match[2]] = value
        }
        const payload: Record<string, FormDataConvertible> = {}
        for (const [key, value] of data.entries()) {
          if (key === '_csrf' || key.startsWith('place_hours[')) continue
          if (typeof value === 'string') payload[key] = value
        }
        payload.place_hours = Object.keys(hours).sort((a, b) => Number(a) - Number(b)).map((key) => hours[Number(key)])
        postCmsForm({ action: `/admin/places/${place.id}/explore`, csrfToken, form: formInstance, setProcessing, data: payload })
      }} action={`/admin/places/${place.id}/explore`} method="POST">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
          <h2>Visitor information</h2>
          <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
            <label>
              Venue phone
              <Input
                name="phone_e164"
                defaultValue={form?.phone_e164 ?? place.phone_e164 ?? ''}
                placeholder="+96590987788"
                maxLength={16}
              />
            </label>
            {place.type === 'hotel_resort' && (
              <>
                <label>
                  Check-in time
                  <Input
                    name="check_in_time"
                    type="time"
                    defaultValue={(form?.check_in_time ?? place.check_in_time ?? '').slice(0, 5)}
                  />
                </label>
                <label>
                  Check-out time
                  <Input
                    name="check_out_time"
                    type="time"
                    defaultValue={(form?.check_out_time ?? place.check_out_time ?? '').slice(0, 5)}
                  />
                </label>
              </>
            )}
            {place.type === 'theater' && (
              <>
                <label>
                  Number of screens
                  <Input
                    name="screen_count"
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={form?.screen_count ?? place.screen_count ?? ''}
                  />
                </label>
              </>
            )}
          </div>
        </section>
        <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
          <h2>Weekly opening hours</h2>
          <div className="weekly-hours-container tw:[display:flex] tw:[flex-direction:column] tw:[gap:var(--space-4)] tw:[margin-top:var(--space-4)]">
            {days.map((day) => (
              <div
                key={day.weekday}
                className={`day-hours-card ${day.state === 'open' ? 'open-day' : day.state === 'closed' ? 'closed-day' : 'unknown-day'} tw:[background:var(--surface)] tw:[border:1px_solid_var(--line)] tw:[border-radius:var(--radius)] tw:[padding:var(--space-4)_var(--space-5)] tw:[box-shadow:var(--shadow-sm)] tw:[transition:border-color_0.15s_ease]`}
                data-weekday={day.weekday}
                data-state={day.state}
              >
                <div className="day-hours-header tw:[display:flex] tw:[justify-content:space-between] tw:[align-items:center] tw:[flex-wrap:wrap] tw:[gap:var(--space-3)] tw:[margin-bottom:var(--space-3)]">
                  <span className="day-title tw:[font-size:15px] tw:[font-weight:700] tw:[color:var(--ink)] tw:[display:flex] tw:[align-items:center] tw:[gap:var(--space-2)]">
                    <span>{day.name}</span>
                    <span
                      className={`status ${day.state === 'open' ? 'published' : day.state === 'closed' ? 'archived' : 'draft'} tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:4px_10px] tw:[border-radius:var(--radius-full)] tw:[font-size:12px] tw:[font-weight:700] tw:[text-transform:capitalize] tw:[letter-spacing:0.02em] tw:[border:1px_solid_transparent] tw:[line-height:1.2] tw:[font-size:11px] tw:[padding:2px_8px]`}
                    >
                      {day.state}
                    </span>
                  </span>
                  <div
                    className="day-state-radios tw:[display:flex] tw:[align-items:center] tw:[gap:4px] tw:[background:var(--ivory)] tw:[padding:3px] tw:[border-radius:var(--radius-sm)] tw:[border:1px_solid_var(--line)]"
                    role="group"
                    aria-label={`Schedule status for ${day.name}`}
                  >
                    {(['unknown', 'closed', 'open'] as const).map((state) => (
                      <button
                        key={state}
                        type="button"
                        className={`day-state-btn ${day.state === state ? 'active' : ''} tw:[padding:5px_12px] tw:[font-size:12px] tw:[font-weight:600] tw:[border-radius:4px] tw:[border:none] tw:[background:transparent] tw:[color:var(--ink-secondary)] tw:[cursor:pointer] tw:[transition:all_0.15s_ease]`}
                        aria-pressed={day.state === state}
                        onClick={() => setState(day.weekday, state)}
                      >
                        {state[0].toUpperCase() + state.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {day.state === 'unknown' && (
                  <div className="day-unknown-body">
                    No schedule specified. Marked as unknown on public guide.
                  </div>
                )}
                {day.state === 'closed' &&
                  (() => {
                    const index = globalIndex++
                    return (
                      <div className="day-closed-body">
                        <span>Explicitly closed all day</span>
                        <input
                          type="hidden"
                          name={`place_hours[${index}][weekday]`}
                          value={day.weekday}
                        />
                        <input
                          type="hidden"
                          name={`place_hours[${index}][interval_index]`}
                          value="0"
                        />
                        <input type="hidden" name={`place_hours[${index}][closed]`} value="on" />
                      </div>
                    )
                  })()}
                {day.state === 'open' && (
                  <div className="day-open-body">
                    <div className="intervals-list tw:[display:flex] tw:[flex-direction:column] tw:[gap:var(--space-3)] tw:[margin-top:var(--space-3)]">
                      {day.intervals.map((interval, intervalIndex) => {
                        const index = globalIndex++
                        return (
                          <div
                            className="interval-row tw:[display:flex] tw:[align-items:center] tw:[flex-wrap:wrap] tw:[gap:var(--space-3)] tw:[padding:var(--space-3)] tw:[background:var(--surface-subtle)] tw:[border:1px_solid_var(--line)] tw:[border-radius:var(--radius-sm)]"
                            key={`${day.weekday}-${intervalIndex}`}
                          >
                            <input
                              type="hidden"
                              name={`place_hours[${index}][weekday]`}
                              value={day.weekday}
                            />
                            <input
                              type="hidden"
                              name={`place_hours[${index}][interval_index]`}
                              value={intervalIndex}
                            />
                            <div className="interval-time-group tw:[display:flex] tw:[align-items:center] tw:[gap:var(--space-2)]">
                              <label>
                                Opens at
                                <Input
                                  type="time"
                                  name={`place_hours[${index}][opens_at]`}
                                  value={interval.opens_at}
                                  onChange={(event) =>
                                    updateInterval(
                                      day.weekday,
                                      intervalIndex,
                                      'opens_at',
                                      event.currentTarget.value
                                    )
                                  }
                                  required
                                />
                              </label>
                              <span>–</span>
                              <label>
                                Closes at
                                <Input
                                  type="time"
                                  name={`place_hours[${index}][closes_at]`}
                                  value={interval.closes_at}
                                  onChange={(event) =>
                                    updateInterval(
                                      day.weekday,
                                      intervalIndex,
                                      'closes_at',
                                      event.currentTarget.value
                                    )
                                  }
                                  required
                                />
                              </label>
                            </div>
                            <Checkbox
                                name={`place_hours[${index}][closes_next_day]`}
                                checked={interval.closes_next_day}
                                onChange={(event) =>
                                  updateInterval(
                                    day.weekday,
                                    intervalIndex,
                                    'closes_next_day',
                                    event.target.checked
                                  )
                                }
                              >Closes next day (overnight)</Checkbox>
                            <button
                              type="button"
                              className="text-button danger remove-interval-btn tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:8px_12px] tw:[background:transparent] tw:[border:none] tw:[color:var(--navy)] tw:[font-size:14px] tw:[font-weight:600] tw:[cursor:pointer] tw:[border-radius:var(--radius-sm)] tw:[transition:all_0.15s_ease]"
                              onClick={() => removeInterval(day.weekday, intervalIndex)}
                            >
                              Remove interval
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      className="text-button add-interval-btn tw:[align-self:flex-start] tw:[margin-top:var(--space-2)] tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:8px_12px] tw:[background:transparent] tw:[border:none] tw:[color:var(--navy)] tw:[font-size:14px] tw:[font-weight:600] tw:[cursor:pointer] tw:[border-radius:var(--radius-sm)] tw:[transition:all_0.15s_ease]"
                      onClick={() => addInterval(day.weekday)}
                    >
                      + Add split interval for {day.name}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </Form>
    </AdminLayout>
  )
}
