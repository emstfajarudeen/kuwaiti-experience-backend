import { useState } from 'react'
import { Button, Form, Input } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import { postCmsForm } from '../../lib/cms_form'

type PasswordValues = { currentPassword: string; newPassword: string }

type Props = {
  adminName: string
  csrfToken: string
  error: string | null
  success: string | null
}

export default function Account({ adminName, csrfToken, error, success }: Props) {
  const [form] = Form.useForm<PasswordValues>()
  const [processing, setProcessing] = useState(false)

  return (
    <AdminLayout
      title="My account"
      active="account"
      adminName={adminName}
      csrfToken={csrfToken}
      error={error === 'Validation failure' ? null : error}
      success={success}
    >
      <div className="page-head form-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div>
          <h1>My account</h1>
        </div>
      </div>

      <div className="tw:w-full">
        <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
          <div className="panel-heading tw:mb-5 tw:border-b tw:border-brand-line-subtle tw:px-0 tw:pb-4 tw:pt-0 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
            <h2>Change password</h2>
          </div>
          <Form<PasswordValues>
            id="cms-account-password"
            form={form}
            layout="vertical"
            className="editor-form"
            onFinish={(values) => {
              postCmsForm({
                action: '/admin/account/password',
                csrfToken,
                data: values,
                form,
                setProcessing,
              })
            }}
          >
            <div className="form-grid two tw:grid tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <Form.Item
                label="Current password"
                name="currentPassword"
                rules={[
                  { required: true, message: 'Enter your current password.' },
                  { max: 200, message: 'Password must be 200 characters or fewer.' },
                ]}
              >
                <Input.Password
                  id="current-password"
                  name="currentPassword"
                  autoComplete="current-password"
                  maxLength={200}
                  placeholder="Current password"
                />
              </Form.Item>
              <Form.Item
                label="New password"
                name="newPassword"
                rules={[
                  { required: true, message: 'Enter a new password.' },
                  { max: 200, message: 'Password must be 200 characters or fewer.' },
                ]}
              >
                <Input.Password
                  id="new-password"
                  name="newPassword"
                  autoComplete="new-password"
                  maxLength={200}
                  placeholder="New password"
                />
              </Form.Item>
            </div>
            <div className="cms-form-actions">
              <Button type="primary" htmlType="submit" loading={processing}>
                Update password
              </Button>
            </div>
          </Form>
        </section>
      </div>
    </AdminLayout>
  )
}
