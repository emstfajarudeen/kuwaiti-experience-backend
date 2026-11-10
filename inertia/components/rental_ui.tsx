import { useState, type ReactNode } from 'react'
import { Button, Divider, Form, Input, Select, Switch, message } from 'antd'
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
export function FormSection({
  title,
  actions,
  children,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="cms-form-section">
      {actions ? (
        <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
          <h2>{title}</h2>
          {actions}
        </div>
      ) : (
        <h2>{title}</h2>
      )}
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

type Choice = { value: string; label: string }

/**
 * Dropdown that can add a new choice on the spot (English name, optional Arabic). The new
 * choice is saved through `createUrl` and selected. Posts its value as a native input.
 */
export function CreatableSelect({
  name,
  value,
  onChange,
  options,
  createUrl,
  csrfToken,
  placeholder,
  allowClear = false,
  noun,
}: {
  name: string
  value?: string
  onChange?: (value: string) => void
  options: Choice[]
  createUrl: string
  csrfToken: string
  placeholder?: string
  allowClear?: boolean
  /** What is being added, e.g. "vehicle type". */
  noun: string
}) {
  const [items, setItems] = useState(options)
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [saving, setSaving] = useState(false)
  const { status } = Form.Item.useStatus()
  const create = async () => {
    if (!nameEn.trim() || saving) return
    setSaving(true)
    try {
      const response = await fetch(createUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
        },
        body: JSON.stringify({ nameEn: nameEn.trim(), nameAr: nameAr.trim() || null }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        data?: Choice
        error?: { message?: string }
        errors?: Array<{ message?: string }>
      }
      if (!response.ok || !body.data)
        throw new Error(
          body.error?.message ?? body.errors?.[0]?.message ?? `Could not add the ${noun}.`
        )
      const created = body.data
      setItems((list) =>
        list.some((item) => item.value === created.value) ? list : [...list, created]
      )
      onChange?.(created.value)
      setNameEn('')
      setNameAr('')
      void message.success(`Added “${created.label}”.`)
    } catch (cause) {
      void message.error(cause instanceof Error ? cause.message : `Could not add the ${noun}.`)
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <Select
        value={value || undefined}
        onChange={(next) => onChange?.(next ?? '')}
        options={items}
        showSearch
        optionFilterProp="label"
        allowClear={allowClear}
        placeholder={placeholder}
        status={status === 'error' ? 'error' : undefined}
        className="tw:w-full"
        popupRender={(menu) => (
          <>
            {menu}
            <Divider className="tw:my-2" />
            <div
              className="tw:flex tw:flex-col tw:gap-2 tw:px-2 tw:pb-2"
              onKeyDown={(event) => event.stopPropagation()}
            >
              <span className="tw:text-[12px] tw:font-semibold tw:text-brand-muted">
                Add a new {noun}
              </span>
              <Input
                size="small"
                placeholder="Name in English"
                value={nameEn}
                maxLength={80}
                onChange={(event) => setNameEn(event.target.value)}
                onPressEnter={() => void create()}
              />
              <Input
                size="small"
                placeholder="Name in Arabic (optional)"
                dir="rtl"
                lang="ar"
                value={nameAr}
                maxLength={80}
                onChange={(event) => setNameAr(event.target.value)}
                onPressEnter={() => void create()}
              />
              <Button
                size="small"
                type="primary"
                loading={saving}
                disabled={!nameEn.trim()}
                onClick={() => void create()}
              >
                + Add {noun}
              </Button>
            </div>
          </>
        )}
      />
      <input type="hidden" name={name} value={value ?? ''} />
    </>
  )
}

/**
 * Labelled switch for a boolean field. A switch is not a native input, so a hidden input carries
 * its value when the form posts natively (multipart).
 */
export function SwitchField({
  label,
  name,
  hint,
  on = 'Active',
  off = 'Inactive',
}: {
  label: string
  name: string
  hint?: string
  on?: string
  off?: string
}) {
  return (
    <>
      <FormField label={label} name={name} valuePropName="checked" hint={hint}>
        <Switch checkedChildren={on} unCheckedChildren={off} />
      </FormField>
      <Form.Item noStyle shouldUpdate>
        {({ getFieldValue }) => (
          <input type="hidden" name={name} value={getFieldValue(name) ? 'true' : 'false'} />
        )}
      </Form.Item>
    </>
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

/** Small POST form for one-click actions. For actions that need confirming, use ConfirmModal. */
export function ActionForm({
  action,
  csrfToken,
  children,
  className,
}: {
  action: string
  csrfToken: string
  children: ReactNode
  className?: string
}) {
  return (
    <form method="post" action={action} className={className}>
      <input type="hidden" name="_csrf" value={csrfToken} />
      {children}
    </form>
  )
}

export function useCan() {
  return useAuthorization().can
}
