import { useState, type ReactNode } from 'react'
import { Button, Form, message } from 'antd'
import type { FormDataConvertible } from '@inertiajs/core'
import { useAuthorization } from '../lib/authorization'
import { postCmsForm } from '../lib/cms_form'
import RequiredMark from './required_mark'

export type SharedProps = {
  adminName: string
  csrfToken: string
  success?: string | null
  error?: string | null
}

const tabs = [
  { href: '/admin/rentals/vehicles', label: 'Vehicles', key: 'vehicles' },
  { href: '/admin/rentals/providers', label: 'Providers', key: 'providers' },
  { href: '/admin/rentals/locations', label: 'Locations', key: 'locations' },
  { href: '/admin/rentals/settings', label: 'Settings', key: 'settings' },
]

/** Sub-navigation across the rental catalogue screens. */
export function RentalTabs({ current, actions }: { current: string; actions?: ReactNode }) {
  return (
    <div className="tw:mb-5 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
      <nav className="tw:flex tw:flex-wrap tw:gap-2" aria-label="Rental catalogue">
        {tabs.map((tab) => (
          <a
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === current ? 'page' : undefined}
            className={`tw:rounded-full tw:border tw:px-4 tw:py-1.5 tw:text-[13px] tw:font-semibold ${
              tab.key === current
                ? 'tw:border-brand-navy-deep tw:bg-brand-navy-deep tw:text-white'
                : 'tw:border-brand-line tw:bg-white tw:text-brand-navy-deep'
            }`}
          >
            {tab.label}
          </a>
        ))}
      </nav>
      {actions}
    </div>
  )
}

/** Card used by read-only detail pages. */
export function Panel({
  title,
  children,
  actions,
}: {
  title?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="panel tw:mb-6 tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-6 tw:shadow-[0_4px_14px_rgba(0,23,46,0.06)]">
      {(title || actions) && (
        <div className="tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

/** A titled block inside a form card, same look as the other CMS forms. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cms-form-section">
      <h2>{title}</h2>
      <div className="form-grid two tw:mt-4 tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
        {children}
      </div>
    </section>
  )
}

/** Label + Ant Design form item, laid out like the other CMS forms. */
export function FormField({
  label,
  name,
  required,
  message: requiredMessage,
  hint,
  className,
  valuePropName,
  rules = [],
  children,
}: {
  label?: string
  name: string
  required?: boolean
  message?: string
  hint?: string
  className?: string
  valuePropName?: string
  rules?: Array<Record<string, unknown>>
  children: ReactNode
}) {
  return (
    <label className={className}>
      {label && (
        <span>
          {label} {required && <RequiredMark />}
        </span>
      )}
      <Form.Item
        name={name}
        valuePropName={valuePropName}
        rules={[
          ...(required
            ? [{ required: true, message: requiredMessage ?? `Enter ${label ?? name}.` }]
            : []),
          ...rules,
        ]}
      >
        {children}
      </Form.Item>
      {hint && <span className="tw:-mt-3 tw:block tw:text-[12px] tw:text-brand-muted">{hint}</span>}
    </label>
  )
}

/**
 * The card + action bar shared by the rental forms. Forms with files post the native form
 * (multipart); the others post the Ant Design values as JSON.
 */
export function RentalFormShell({
  id,
  action,
  csrfToken,
  initialValues,
  multipart = false,
  cancelHref,
  submitLabel,
  extraActions,
  disabled = false,
  children,
}: {
  id: string
  action: string
  csrfToken: string
  initialValues: Record<string, unknown>
  multipart?: boolean
  cancelHref: string
  submitLabel: string
  extraActions?: ReactNode
  disabled?: boolean
  children: ReactNode
}) {
  const [form] = Form.useForm()
  const [processing, setProcessing] = useState(false)
  return (
    <Form
      id={id}
      component="form"
      form={form}
      layout="vertical"
      initialValues={initialValues}
      disabled={disabled}
      noValidate
      action={action}
      method="POST"
      encType={multipart ? 'multipart/form-data' : undefined}
      onFinish={(values) => {
        const element = document.getElementById(id) as HTMLFormElement | null
        const data =
          multipart && element
            ? new FormData(element)
            : (JSON.parse(JSON.stringify(values)) as Record<string, FormDataConvertible>)
        postCmsForm({
          action,
          csrfToken,
          form,
          setProcessing,
          data,
          onError: (errors) => {
            const first = Object.values(errors)[0]
            if (first) void message.error({ content: String(first), key: `${id}-error` })
            const firstField = Object.keys(errors)[0]
            if (firstField) form.scrollToField(firstField, { focus: true })
          },
        })
      }}
      onFinishFailed={({ errorFields }) => {
        const first = errorFields[0]
        if (!first) return
        void message.error({
          content: first.errors[0] ?? 'Fix the highlighted fields.',
          key: `${id}-error`,
        })
        form.scrollToField(first.name, { focus: true })
      }}
    >
      <input type="hidden" name="_csrf" value={csrfToken} />
      <div className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-6 tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)]">
        {children}
      </div>
      <div className="cms-form-actions">
        {extraActions}
        <Button href={cancelHref}>Cancel</Button>
        {!disabled && (
          <Button type="primary" htmlType="submit" loading={processing}>
            {submitLabel}
          </Button>
        )}
      </div>
    </Form>
  )
}

const statusLabels: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Hold expired',
  refund_required: 'Refund required',
  draft: 'Draft',
  published: 'Published',
  initiated: 'Started',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
}
const statusTone: Record<string, string> = {
  confirmed: 'published',
  completed: 'published',
  published: 'published',
  paid: 'published',
  pending_payment: 'draft',
  initiated: 'draft',
  draft: 'draft',
  refund_required: 'archived',
  failed: 'archived',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status ${statusTone[status] ?? 'archived'}`}>
      {statusLabels[status] ?? status}
    </span>
  )
}

export const bookingStatusOptions = [
  'pending_payment',
  'confirmed',
  'completed',
  'cancelled',
  'expired',
  'refund_required',
].map((value) => ({ value, label: statusLabels[value] }))

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kuwait',
  }).format(new Date(value))
}

/** Small POST form for one-click actions; keep any button inside an Ant Design `Button`. */
export function ActionForm({
  action,
  csrfToken,
  children,
  confirm,
  className,
}: {
  action: string
  csrfToken: string
  children: ReactNode
  confirm?: string
  className?: string
}) {
  return (
    <form
      method="post"
      action={action}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
    >
      <input type="hidden" name="_csrf" value={csrfToken} />
      {children}
    </form>
  )
}

export function useCan() {
  return useAuthorization().can
}
