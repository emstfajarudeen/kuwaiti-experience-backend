import { useState } from 'react'
import { Button, Checkbox, Form, Input } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import { postCmsForm } from '../../lib/cms_form'

type Permission = { key: string; module: string; action: string; label: string }
type Role = { id: number; name: string; description: string | null; slug: string; is_system: boolean; permissions: Permission[] }
type Values = { name: string; description?: string; permissionKeys: string[] }
type Props = {
  adminName: string; csrfToken: string; error: string | null; role: Role | null
  permissions: Permission[]; form: Partial<Values> | null
}

export default function RoleEditor({ adminName, csrfToken, error, role, permissions, form }: Props) {
  const [antdForm] = Form.useForm<Values>()
  const [processing, setProcessing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const selected = new Set(form?.permissionKeys ?? role?.permissions.map((item) => item.key) ?? [])
  const initialValues: Values = {
    name: form?.name ?? role?.name ?? '',
    description: form?.description ?? role?.description ?? '',
    permissionKeys: [...selected],
  }
  const groups = Object.groupBy(permissions, (permission) => permission.module)
  const action = role ? `/admin/roles/${role.id}/save` : '/admin/roles'
  return (
    <AdminLayout title={role ? 'Edit role' : 'Create role'} active="roles" adminName={adminName} csrfToken={csrfToken} error={error}>
      <a className="back-link" href="/admin/roles">← Back to roles</a>
      <div className="page-head form-page-head tw:mb-6"><h1>{role ? `Edit ${role.name}` : 'Create a role'}</h1>{!role?.is_system && <div className="form-page-actions"><Button href="/admin/roles">Cancel</Button><Button type="primary" htmlType="submit" form="cms-role-editor" loading={processing}>{role ? 'Save role' : 'Create role'}</Button></div>}</div>
      {role?.is_system ? <section className="panel tw:p-6">{role.slug === 'super_admin' ? 'Super Admin' : 'Administrator'} is protected. Its permissions follow the active code catalogue and cannot be edited.</section> : <Form id="cms-role-editor" form={antdForm} layout="vertical" initialValues={initialValues} onFinish={(values) => postCmsForm({ action, csrfToken, form: antdForm, setProcessing, data: { name: values.name, description: values.description ?? '', permissionKeys: values.permissionKeys ?? [] } })}>
        <section className="panel tw:mb-5 tw:p-6"><div className="form-grid tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[700px]:grid-cols-1"><Form.Item name="name" label="Role name" rules={[{ required: true, min: 2, max: 120 }]}><Input maxLength={120} /></Form.Item><Form.Item name="description" label="Description"><Input maxLength={500} /></Form.Item></div></section>
        <Form.Item name="permissionKeys" rules={[{ type: 'array' }]}>
          <Checkbox.Group className="tw:w-full">
            <div className="cms-permission-grid">{Object.entries(groups).map(([module, items]) => <section className="cms-permission-group" key={module}><h2 className="tw:capitalize">{module.replaceAll('_', ' ')}</h2><div className="tw:flex tw:flex-col tw:gap-2">{items?.map((permission) => <Checkbox key={permission.key} value={permission.key}>{permission.label}</Checkbox>)}</div></section>)}</div>
          </Checkbox.Group>
        </Form.Item>
        {role && <div className="tw:mt-6"><Button danger onClick={() => setDeleteOpen(true)}>Delete role</Button></div>}
      </Form>}
      <ConfirmModal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete role" message="Delete this role? Reassign its staff first; assigned roles cannot be deleted." action={role ? `/admin/roles/${role.id}/delete` : ''} csrfToken={csrfToken} confirmLabel="Delete role" danger />
    </AdminLayout>
  )
}
