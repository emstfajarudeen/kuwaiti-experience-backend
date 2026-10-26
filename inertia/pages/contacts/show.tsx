import { useState } from 'react'
import { Button, Form, Select } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import { postCmsForm } from '../../lib/cms_form'

type Contact = {
  id: number
  full_name: string
  email: string
  phone_number: string | null
  inquiry_type: string | null
  message: string
  status: 'new' | 'in_progress' | 'resolved'
  created_at: string | null
}

type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  contact: Contact
}

const statuses = ['new', 'in_progress', 'resolved'] as const

export default function ContactDetail({ adminName, csrfToken, success, contact }: Props) {
  const [form] = Form.useForm<{ status: Contact['status'] }>()
  const [processing, setProcessing] = useState(false)

  return (
    <AdminLayout
      title="Contact request"
      active="contacts"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
    >
      <a
        className="back-link tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:600] tw:[margin-bottom:var(--space-3)] tw:[transition:color_0.15s_ease]"
        href="/admin/contact-requests"
      >
        ← Back to contact inbox
      </a>

      <div className="page-head form-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div>
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
            <h1>{contact.full_name}</h1>
            <span
              className={`status ${contact.status} tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:4px_10px] tw:[border-radius:var(--radius-full)] tw:[font-size:12px] tw:[font-weight:700] tw:[text-transform:capitalize] tw:[letter-spacing:0.02em] tw:[border:1px_solid_transparent] tw:[line-height:1.2]`}
            >
              {contact.status.replace('_', ' ')}
            </span>
          </div>
          <p className="tw:mt-1.5 tw:text-sm tw:text-brand-muted">
            <a href={`mailto:${contact.email}`} className="tw:text-brand-navy tw:underline">
              {contact.email}
            </a>
            {contact.phone_number && (
              <>
                {' · '}
                <a href={`tel:${contact.phone_number}`} className="tw:text-brand-navy">
                  {contact.phone_number}
                </a>
              </>
            )}
            {' · Received '}
            {contact.created_at}
          </p>
        </div>
        <div className="form-page-actions"><Button type="primary" htmlType="submit" form="cms-contact-status" loading={processing}>Save status</Button></div>
      </div>

      <div className="content-grid cms-form-workspace tw:grid tw:gap-4">
        <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
          {contact.inquiry_type && (
            <div className="tw:mb-4">
              <span className="tw:mb-1 tw:block tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-[0.1em] tw:text-brand-muted">
                Inquiry Type
              </span>
              <span className="type-chip tw:[display:inline-flex] tw:[align-items:center] tw:[gap:8px] tw:[padding:6px_14px] tw:[border-radius:var(--radius-full)] tw:[background:var(--surface-subtle)] tw:[border:1px_solid_var(--line)] tw:[font-size:13px] tw:[font-weight:600] tw:[color:var(--ink-secondary)] tw:[transition:all_0.15s_ease]">
                {contact.inquiry_type}
              </span>
            </div>
          )}
          <span className="tw:mb-2 tw:block tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-[0.1em] tw:text-brand-muted">
            Message
          </span>
          <div className="tw:whitespace-pre-wrap tw:rounded-cms-sm tw:border tw:border-brand-line tw:bg-brand-surface-subtle tw:px-5 tw:py-[18px] tw:text-[15px] tw:leading-[1.6] tw:text-brand-ink">
            {contact.message}
          </div>
        </section>

        <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
          <h2>Status</h2>
          <Form
            id="cms-contact-status"
            form={form}
            layout="vertical"
            initialValues={{ status: contact.status }}
            onFinish={(values) => {
              postCmsForm({
                action: `/admin/contact-requests/${contact.id}/status`,
                csrfToken,
                data: values,
                form,
                setProcessing,
              })
            }}
          >
            <div className="form-grid tw:grid tw:grid-cols-1 tw:gap-4">
              <Form.Item
                label="Workflow status"
                name="status"
                rules={[{ required: true, message: 'Select a workflow status.' }]}
              >
                <Select
                  id="status"
                  options={statuses.map((status) => ({
                    value: status,
                    label: status.replace('_', ' '),
                  }))}
                />
              </Form.Item>
            </div>
          </Form>
        </section>
      </div>
    </AdminLayout>
  )
}
