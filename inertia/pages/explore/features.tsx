import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import RowActionMenu from '../../components/row_action_menu'
import ConfirmModal from '../../components/confirm_modal'
import { Button, Checkbox, Form, Input, InputNumber, Select, Table } from 'antd'
import { postCmsForm } from '../../lib/cms_form'
type Feature = {
  id: number
  type: string
  kind: string
  code: string
  name_en: string
  name_ar: string | null
  active: boolean
  sort_order: number
}
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  features: Feature[]
  types: Array<{ code: string; name_en: string }>
  editing: Feature | null
  selectedType: string
}
export default function Features({
  adminName,
  csrfToken,
  success,
  error,
  form,
  features,
  types,
  editing,
  selectedType,
}: Props) {
  const [deleting, setDeleting] = useState<Feature | null>(null)
  const [processing, setProcessing] = useState(false)
  const [featureForm] = Form.useForm()
  const value = (key: string, fallback: string | number | null | undefined) =>
    form?.[key] ?? fallback ?? ''
  return (
    <AdminLayout
      title="Place features"
      active="place-features"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Place features</h1>
      </div>
      <div className="content-grid cms-form-workspace tw:grid tw:gap-4">
        <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
          <div className="panel-heading tw:[padding:0_0_16px] tw:[border-bottom:1px_solid_var(--line-subtle)] tw:[margin-bottom:16px] tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
            <h2>{editing ? 'Edit feature' : 'Add feature'}</h2>
            <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
              {editing && <a className="button secondary" href="/admin/place-features">Cancel</a>}
              <Button className="button primary" htmlType="submit" form="cms-feature-editor" loading={processing}>
                {editing ? 'Update feature' : 'Save feature'}
              </Button>
            </div>
          </div>
          <Form
            id="cms-feature-editor"
            form={featureForm}
            layout="vertical"
            initialValues={{ type: value('type', editing?.type ?? selectedType ?? types[0]?.code ?? ''), kind: value('kind', editing?.kind ?? 'highlight'), code: value('code', editing?.code), name_en: value('name_en', editing?.name_en), name_ar: value('name_ar', editing?.name_ar), sort_order: Number(value('sort_order', editing?.sort_order ?? 0)), active: form ? form.active === 'on' : editing ? editing.active : true }}
            onFinish={(values) => postCmsForm({ action: editing ? `/admin/place-features/${editing.id}/save` : '/admin/place-features', csrfToken, form: featureForm, setProcessing, data: { type: values.type, kind: values.kind, code: values.code, name_en: values.name_en, name_ar: values.name_ar ?? '', sort_order: String(values.sort_order ?? 0), active: values.active ? 'on' : '' } })}
            action={editing ? `/admin/place-features/${editing.id}/save` : '/admin/place-features'}
            method="POST"
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <div className="form-grid two tw:grid tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <Form.Item name="type" label="Place type" rules={[{ required: true, message: 'Choose a place type.' }]}><Select options={types.map((type) => ({ value: type.code, label: type.name_en }))} /></Form.Item>
              <Form.Item name="kind" label="Kind"><Select options={['highlight', 'amenity', 'capability'].map((kind) => ({ value: kind, label: kind }))} /></Form.Item>
              <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Enter a feature code.' }, { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: 'Use lowercase letters, numbers, and single hyphens.' }, { max: 80 }]}><Input maxLength={80} placeholder="sea-view" /></Form.Item>
              <Form.Item name="name_en" label="English label" rules={[{ required: true, message: 'Enter an English label.' }, { max: 120 }]}><Input maxLength={120} placeholder="Sea View" /></Form.Item>
              <Form.Item name="name_ar" label="Arabic label" rules={[{ max: 120 }]}><Input dir="rtl" lang="ar" maxLength={120} placeholder="إطلالة بحرية" /></Form.Item>
              <Form.Item name="sort_order" label="Display order" rules={[{ required: true, message: 'Enter a display order.' }]}><InputNumber min={0} max={999} precision={0} className="tw:w-full" /></Form.Item>
              <Form.Item name="active" valuePropName="checked"><Checkbox>Visible to visitors</Checkbox></Form.Item>
            </div>
          </Form>
        </section>
        <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:overflow-hidden tw:p-0">
          <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
            <h2>Features ({features.length})</h2>
            <a className="button primary" href={editing ? '/admin/place-features' : '#cms-feature-editor'}>+ Add feature</a>
          </div>
          {features.length ? (
            <div className="table-scroll tw:overflow-x-auto">
              <Table<Feature> rowKey="id" pagination={false} scroll={{ x: 750 }} dataSource={features} columns={[
                { title: 'Edit', key: 'edit', render: (_: unknown, row) => <a href={`/admin/place-features/${row.id}/edit`} className="action-pencil-btn" aria-label={`Edit ${row.name_en}`}>✎</a> },
                { title: 'Feature', key: 'feature', render: (_: unknown, row) => <><strong>{row.name_en}</strong><small className="tw:block">{row.code}</small></> },
                { title: 'Type', dataIndex: 'type' }, { title: 'Kind', dataIndex: 'kind' },
                { title: 'Status', key: 'active', render: (_: unknown, row) => <span className={`status ${row.active ? 'published' : 'archived'}`}>{row.active ? 'Active' : 'Hidden'}</span> },
                { title: 'Actions', key: 'actions', render: (_: unknown, row) => <RowActionMenu label={`More actions for ${row.name_en}`} actions={[{ label: 'Delete', danger: true, onClick: () => setDeleting(row) }]} /> },
              ]} />
            </div>
          ) : (
            <div className="empty-state tw:[padding:var(--space-10)_var(--space-6)] tw:[text-align:center] tw:[color:var(--muted)] tw:[display:flex] tw:[flex-direction:column] tw:[align-items:center] tw:[gap:var(--space-3)]">
              <span className="empty-state-icon tw:[font-size:36px] tw:[color:var(--muted)] tw:[opacity:0.6]">
                ✦
              </span>
              <p>No feature definitions created yet.</p>
            </div>
          )}
        </section>
      </div>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete feature"
        message={`Delete feature "${deleting?.name_en ?? ''}"? Ensure it is not assigned to any venue.`}
        action={deleting ? `/admin/place-features/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
