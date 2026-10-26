import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import { Button, Checkbox, Form, Input, InputNumber } from 'antd'
import { postCmsForm } from '../../lib/cms_form'
type Location = {
  id: number
  code: string
  active: boolean
  pickup_enabled: boolean
  dropoff_enabled: boolean
  sort_order: number
  name: string
  name_ar: string | null
}
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  locations: Location[]
}
export default function Transport({
  adminName,
  csrfToken,
  success,
  error,
  form,
  locations,
}: Props) {
  const [deleting, setDeleting] = useState<Location | null>(null)
  const [newLocationForm] = Form.useForm()
  const [processing, setProcessing] = useState(false)
  return (
    <AdminLayout
      title="Transport"
      active="transport"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Transport locations</h1>
      </div>
      <div className="content-grid cms-form-workspace tw:grid tw:gap-4">
        <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
          <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
            <h2>New location</h2>
            <Button className="button primary" htmlType="submit" form="cms-transport-new" loading={processing}>Save location</Button>
          </div>
          <Form id="cms-transport-new" form={newLocationForm} layout="vertical" initialValues={{ nameEn: form?.nameEn ?? '', nameAr: form?.nameAr ?? '', code: form?.code ?? '', sortOrder: Number(form?.sortOrder ?? 0), pickupEnabled: form ? form.pickupEnabled === 'on' : true, dropoffEnabled: form ? form.dropoffEnabled === 'on' : true, active: form ? form.active === 'on' : true }} onFinish={(values) => postCmsForm({ action: '/admin/transport', csrfToken, form: newLocationForm, setProcessing, data: { nameEn: values.nameEn, nameAr: values.nameAr ?? '', code: values.code, sortOrder: String(values.sortOrder ?? 0), pickupEnabled: values.pickupEnabled ? 'on' : '', dropoffEnabled: values.dropoffEnabled ? 'on' : '', active: values.active ? 'on' : '' } })} className="form-grid two tw:grid tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
            <Form.Item name="nameEn" label="English name" rules={[{ required: true, message: 'Enter an English name.' }]}><Input placeholder="Kuwait International Airport (T1)" /></Form.Item>
            <Form.Item name="nameAr" label="Arabic name"><Input dir="rtl" lang="ar" placeholder="مطار الكويت الدولي (مبنى 1)" /></Form.Item>
            <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Enter a code.' }, { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: 'Use lowercase letters, numbers, and single hyphens.' }]}><Input placeholder="kuwait-airport-t1" /></Form.Item>
            <Form.Item name="sortOrder" label="Display order"><InputNumber className="tw:w-full" precision={0} /></Form.Item>
            <Form.Item name="pickupEnabled" valuePropName="checked"><Checkbox>Allow pickup from here</Checkbox></Form.Item>
            <Form.Item name="dropoffEnabled" valuePropName="checked"><Checkbox>Allow destination drop-off here</Checkbox></Form.Item>
            <Form.Item name="active" valuePropName="checked"><Checkbox>Active in inquiry forms</Checkbox></Form.Item>
          </Form>
        </section>
        <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:overflow-hidden tw:p-0">
          <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
            <h2>Locations ({locations.length})</h2>
            <a className="button primary" href="#cms-transport-new">+ Add location</a>
          </div>
          {locations.length ? (
            <div className="tw:[padding:var(--space-4)_var(--space-6)] tw:[display:flex] tw:[flex-direction:column] tw:[gap:12px]">
              {locations.map((item) => (
                <details
                  key={item.id}
                  className="panel tw:[margin-bottom:0] tw:[box-shadow:none] tw:[border:1px_solid_var(--line)] tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)]"
                >
                  <summary className="tw:[padding:14px_18px] tw:[cursor:pointer] tw:[display:flex] tw:[justify-content:space-between] tw:[align-items:center] tw:[font-weight:600]">
                    <div>
                      <strong>{item.name}</strong>
                      <small className="tw:[display:block] tw:[color:var(--muted)] tw:[font-weight:normal]">
                        <code>{item.code}</code> · Order {item.sort_order}
                      </small>
                    </div>
                    <div>
                      <span
                        className={`status ${item.active ? 'published' : 'archived'} tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:4px_10px] tw:[border-radius:var(--radius-full)] tw:[font-size:12px] tw:[font-weight:700] tw:[text-transform:capitalize] tw:[letter-spacing:0.02em] tw:[border:1px_solid_transparent] tw:[line-height:1.2]`}
                      >
                        {item.active ? 'Active' : 'Inactive'}
                      </span>{' '}
                      Edit ▾
                    </div>
                  </summary>
                  <div className="tw:[padding:18px] tw:[border-top:1px_solid_var(--line-subtle)] tw:[background:var(--surface-subtle)]">
                    <LocationEditForm item={item} csrfToken={csrfToken} />
                    <div className="tw:[margin-top:14px] tw:[border-top:1px_solid_var(--line)] tw:[padding-top:12px]">
                      <button
                        className="text-button danger tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:8px_12px] tw:[background:transparent] tw:[border:none] tw:[color:var(--navy)] tw:[font-size:14px] tw:[font-weight:600] tw:[cursor:pointer] tw:[border-radius:var(--radius-sm)] tw:[transition:all_0.15s_ease]"
                        type="button"
                        onClick={() => setDeleting(item)}
                      >
                        Delete location
                      </button>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="empty-state tw:[padding:var(--space-10)_var(--space-6)] tw:[text-align:center] tw:[color:var(--muted)] tw:[display:flex] tw:[flex-direction:column] tw:[align-items:center] tw:[gap:var(--space-3)]">
              <p>No transport locations added yet.</p>
            </div>
          )}
        </section>
      </div>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete location"
        message={`Delete location "${deleting?.name ?? ''}"?`}
        action={deleting ? `/admin/transport/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}

function LocationEditForm({ item, csrfToken }: { item: Location; csrfToken: string }) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  return <Form form={form} layout="vertical" className="form-grid two tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1" initialValues={{ nameEn: item.name, nameAr: item.name_ar ?? '', code: item.code, sortOrder: item.sort_order, pickupEnabled: item.pickup_enabled, dropoffEnabled: item.dropoff_enabled, active: item.active }} onFinish={(v) => postCmsForm({ action: `/admin/transport/${item.id}/save`, csrfToken, form, setProcessing: setSaving, data: { nameEn: v.nameEn, nameAr: v.nameAr ?? '', code: v.code, sortOrder: String(v.sortOrder ?? 0), pickupEnabled: v.pickupEnabled ? 'on' : '', dropoffEnabled: v.dropoffEnabled ? 'on' : '', active: v.active ? 'on' : '' } })}>
    <div className="tw:col-span-full tw:flex tw:justify-end"><Button className="button secondary" htmlType="submit" loading={saving}>Save changes</Button></div>
    <Form.Item name="nameEn" label="English name" rules={[{ required: true, message: 'Enter an English name.' }]}><Input /></Form.Item>
    <Form.Item name="nameAr" label="Arabic name"><Input dir="rtl" /></Form.Item>
    <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Enter a code.' }]}><Input /></Form.Item>
    <Form.Item name="sortOrder" label="Display order"><InputNumber className="tw:w-full" precision={0} /></Form.Item>
    <Form.Item name="pickupEnabled" valuePropName="checked"><Checkbox>Pickup allowed</Checkbox></Form.Item>
    <Form.Item name="dropoffEnabled" valuePropName="checked"><Checkbox>Dropoff allowed</Checkbox></Form.Item>
    <Form.Item name="active" valuePropName="checked"><Checkbox>Active</Checkbox></Form.Item>
  </Form>
}
