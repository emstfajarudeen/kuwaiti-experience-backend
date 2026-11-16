import { useEffect, useRef, useState } from 'react'
import { DatePicker, Input, Select } from 'antd'
import { router } from '@inertiajs/react'
import dayjs from 'dayjs'

const DAY = 'YYYY-MM-DD'

export type ToolbarSelect = {
  key: string
  value: string
  placeholder: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  /** Select with no "all" state (e.g. sort). Cannot be cleared. */
  required?: boolean
  /** Lets the person type to find an option (long lists such as providers). */
  searchable?: boolean
}

/** A from–to day range, as YYYY-MM-DD strings. Both ends are always set. */
export type ToolbarDateRange = {
  from: string
  to: string
  label: string
  onChange: (from: string, to: string) => void
}

type Props = {
  search?: {
    value: string
    placeholder: string
    onChange: (value: string) => void
    label: string
  }
  selects?: ToolbarSelect[]
  dateRange?: ToolbarDateRange
  /** Shows the Reset link when filters differ from their defaults. */
  active?: boolean
  onReset?: () => void
}

/**
 * The one filter bar every CMS table uses. It sits inside the table card, has no
 * submit button, and applies as the person types or picks a value.
 */
export default function TableToolbar({ search, selects = [], dateRange, active, onReset }: Props) {
  return (
    <div className="cms-table-toolbar">
      {dateRange && (
        <DatePicker.RangePicker
          aria-label={dateRange.label}
          allowClear={false}
          format="D MMM YYYY"
          value={[dayjs(dateRange.from, DAY), dayjs(dateRange.to, DAY)]}
          onChange={(range) => {
            if (range?.[0] && range[1])
              dateRange.onChange(range[0].format(DAY), range[1].format(DAY))
          }}
          className="cms-table-toolbar-range"
        />
      )}
      {search && (
        <Input.Search
          aria-label={search.label}
          placeholder={search.placeholder}
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
          allowClear
          maxLength={120}
          className="cms-table-toolbar-search"
        />
      )}
      {selects.map((select) => (
        <Select
          key={select.key}
          aria-label={select.placeholder}
          value={select.value || undefined}
          placeholder={select.placeholder}
          allowClear={!select.required}
          showSearch={select.searchable}
          optionFilterProp="label"
          onChange={(value) => select.onChange(value ?? '')}
          options={select.options}
          className="cms-table-toolbar-select"
        />
      ))}
      {active && onReset && (
        <button type="button" className="cms-table-toolbar-reset" onClick={onReset}>
          Reset filters
        </button>
      )}
    </div>
  )
}

/** Client-side filtering for lists that already ship every row to the page. */
export function useLocalFilters<T extends Record<string, string>>(initial: T, start: T = initial) {
  const [values, setValues] = useState<T>(start)
  return {
    values,
    set: (key: keyof T, value: string) => setValues((current) => ({ ...current, [key]: value })),
    reset: () => setValues(initial),
    active: (Object.keys(initial) as (keyof T)[]).some((key) => values[key] !== initial[key]),
  }
}

/**
 * Server-side filtering for paginated lists: typing is debounced, dropdowns apply at once,
 * and the page stays mounted (no full reload) while Inertia fetches the new rows.
 */
export function useServerFilters<T extends Record<string, string>>(
  path: string,
  current: T,
  defaults: T,
  delay = 350
) {
  const [values, setValues] = useState<T>(current)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const visit = (next: T) => {
    const params: Record<string, string> = {}
    for (const [key, value] of Object.entries(next)) {
      const trimmed = value.trim()
      if (trimmed) params[key] = trimmed
    }
    router.get(path, params, { preserveState: true, preserveScroll: true, replace: true })
  }

  const set = (key: keyof T, value: string, debounced = false) => {
    const next = { ...values, [key]: value }
    setValues(next)
    clearTimeout(timer.current)
    if (debounced) timer.current = setTimeout(() => visit(next), delay)
    else visit(next)
  }

  return {
    values,
    /** Changes several filters in one visit (e.g. both ends of a date range). */
    setMany: (patch: Partial<T>) => {
      const next = { ...values, ...patch }
      setValues(next)
      clearTimeout(timer.current)
      visit(next)
    },
    setSearch: (key: keyof T, value: string) => set(key, value, true),
    setSelect: (key: keyof T, value: string) => set(key, value),
    reset: () => {
      clearTimeout(timer.current)
      setValues(defaults)
      visit(defaults)
    },
    active: (Object.keys(defaults) as (keyof T)[]).some((key) => values[key] !== defaults[key]),
  }
}
