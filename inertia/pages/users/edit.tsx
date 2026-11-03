import { useState } from 'react'
import { Button, Form, Input, Select, Switch } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import { postCmsForm } from '../../lib/cms_form'

type User = {
  id: number
  full_name: string
  email: string
  active: boolean
  must_change_password: boolean
  roles: Array<{ id: number; slug: string; name: string }>
  created_at: string | null
}
type StaffRole = { id: number; slug: string; name: string; is_system: boolean }
type FormData = {
  fullName: string
  email: string
  password?: string
  active?: boolean
  roleIds: string[]
}

type Props = {
  adminName: string
  csrfToken: string
  error: string | null
  user: User | null
  roles: StaffRole[]
  currentAdminId: number
  form: {
    fullName: string | null
    email: string | null
    active: string | null
    roleIds: string[]
  } | null
}

export default function UserEditor({
  adminName,
  csrfToken,
  error,
  user,
  roles,
  currentAdminId,
  form,
}: Props) {
  const [userForm] = Form.useForm<FormData>()
  const [processing, setProcessing] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const isNew = !user
  const initialValues = {
    fullName: form?.fullName ?? user?.full_name ?? '',
    email: form?.email ?? user?.email ?? '',
    active: form ? form.active === 'on' : (user?.active ?? true),
    roleIds: form?.roleIds ?? user?.roles.map((role) => String(role.id)) ?? [],
  }

  function submit(values: FormData) {
    const action = user ? `/admin/users/${user.id}/save` : '/admin/users'
    postCmsForm({
      action,
      csrfToken,
      form: userForm,
      setProcessing,
      data: {
        fullName: values.fullName,
        email: values.email,
        ...(isNew ? { password: values.password ?? '' } : {}),
        ...(!isNew ? { active: values.active ? 'on' : '' } : {}),
        roleIds: values.roleIds ?? [],
      },
    })
  }

  return (
    <AdminLayout
      title={isNew ? 'Add staff member' : 'Edit staff member'}
      active="users"
      adminName={adminName}
      csrfToken={csrfToken}
      error={error}
    >
      <a className="back-link tw:mb-3 tw:inline-flex" href="/admin/users">
        ← Back to users
      </a>
      <div className="page-head form-page-head tw:mb-6">
        <h1>{isNew ? 'Add staff member' : user?.full_name}</h1>
      </div>
      <div className="cms-form-workspace tw:grid tw:gap-4">
        <section className="panel tw:p-6">
          <h2 className="tw:mb-5">Account details</h2>
          <Form<FormData>
            id="cms-staff-editor"
            form={userForm}
            layout="vertical"
            initialValues={initialValues}
            onFinish={submit}
            className="editor-form"
          >
            <div className="form-grid two tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[700px]:grid-cols-1">
              <Form.Item
                label="Full name"
                name="fullName"
                rules={[
                  { required: true, message: 'Enter the administrator name.' },
                  { min: 2, message: 'Use at least 2 characters.' },
                  { max: 120, message: 'Name must be 120 characters or fewer.' },
                ]}
              >
                <Input autoComplete="name" maxLength={120} />
              </Form.Item>
              <Form.Item
                label="Email address"
                name="email"
                rules={[
                  { required: true, message: 'Enter an email address.' },
                  { type: 'email', message: 'Enter a valid email address.' },
                  { max: 254, message: 'Email must be 254 characters or fewer.' },
                ]}
              >
                <Input type="email" autoComplete="email" maxLength={254} />
              </Form.Item>
              {isNew && (
                <Form.Item
                  className="full tw:col-span-full"
                  label="Initial password"
                  name="password"
                  rules={[
                    { required: true, message: 'Enter an initial password.' },
                    { max: 200, message: 'Password must be 200 characters or fewer.' },
                  ]}
                >
                  <Input.Password autoComplete="new-password" maxLength={200} />
                </Form.Item>
              )}
              <Form.Item
                className="full tw:col-span-full"
                label="Roles"
                name="roleIds"
                rules={[{ required: true, message: 'Assign at least one role.' }]}
              >
                <Select
                  mode="multiple"
                  disabled={!isNew && user?.id === currentAdminId}
                  options={roles.map((role) => ({ value: String(role.id), label: role.name }))}
                  placeholder="Choose one or more roles"
                />
              </Form.Item>
              {!isNew && (
                <Form.Item
                  className="full tw:col-span-full"
                  name="active"
                  label="Active"
                  valuePropName="checked"
                  extra="Allow this staff member to sign in."
                >
                  <Switch disabled={user?.id === currentAdminId} />
                </Form.Item>
              )}
            </div>
            <div className="cms-form-actions">
              <Button href="/admin/users">Cancel</Button>
              <Button type="primary" htmlType="submit" loading={processing}>
                {isNew ? 'Create staff member' : 'Save changes'}
              </Button>
            </div>
          </Form>
        </section>
        {!isNew && user && (
          <aside className="tw:flex tw:flex-col tw:gap-5">
            <section className="panel tw:p-6">
              <h2 className="tw:mb-3">Reset password</h2>
              <p className="tw:mb-5 tw:text-sm tw:leading-6 tw:text-brand-muted">
                {user.active
                  ? 'Email a one-time reset link to this staff member. Existing sessions stay active until the password is reset.'
                  : 'Reactivate this staff member before sending a password-reset link.'}
              </p>
              <Button
                className="button secondary wide"
                disabled={!user.active}
                onClick={() => setResetOpen(true)}
              >
                Send reset link
              </Button>
            </section>
          </aside>
        )}
      </div>
      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Send password-reset link"
        message={`Send a one-time password-reset link to ${user?.email ?? ''}?`}
        action={user ? `/admin/users/${user.id}/send-reset` : ''}
        csrfToken={csrfToken}
        confirmLabel="Send reset link"
      />
    </AdminLayout>
  )
}
