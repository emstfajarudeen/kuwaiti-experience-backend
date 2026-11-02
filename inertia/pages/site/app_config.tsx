import { Button, Checkbox, Form, Input } from 'antd'
import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import { postCmsForm } from '../../lib/cms_form'

type AppConfig = {
  ios_version: string | null
  ios_force: boolean
  ios_store_url: string | null
  android_version: string | null
  android_force: boolean
  android_store_url: string | null
  update_title_en: string
  update_title_ar: string | null
  update_message_en: string
  update_message_ar: string | null
  maintenance_enabled: boolean
  maintenance_title_en: string
  maintenance_title_ar: string | null
  maintenance_message_en: string
  maintenance_message_ar: string | null
}

type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  environment: 'qa' | 'live' | null
  config: AppConfig
}

const grid = 'form-grid two tw:mt-4 tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1'

export default function AppConfigPage({ adminName, csrfToken, success, error, config }: Props) {
  const [form] = Form.useForm<AppConfig>()
  const [processing, setProcessing] = useState(false)
  return (
    <AdminLayout
      title="App configuration"
      active="app-config"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <Form
        id="app-config-editor"
        form={form}
        layout="vertical"
        initialValues={config}
        onFinish={(values) =>
          postCmsForm({ action: '/admin/app-config', csrfToken, form, setProcessing, data: values })
        }
      >
        <div className="panel form-panel tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-6">
          <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
            <h2>App configuration</h2>
            <Button className="button primary" htmlType="submit" loading={processing}>
              Save configuration
            </Button>
          </div>
          <section className="cms-form-section tw:mt-6">
            <h2>App versions</h2>
            <div className={grid}>
              {(['ios', 'android'] as const).map((platform) => (
                <div key={platform}>
                  <h3>{platform === 'ios' ? 'iOS' : 'Android'}</h3>
                  <Form.Item name={`${platform}_version`} label="Latest version">
                    <Input placeholder="1.0.0" />
                  </Form.Item>
                  <Form.Item name={`${platform}_store_url`} label="Store link">
                    <Input type="url" placeholder="https://..." />
                  </Form.Item>
                  <Form.Item name={`${platform}_force`} valuePropName="checked">
                    <Checkbox>Require an update for older versions</Checkbox>
                  </Form.Item>
                </div>
              ))}
            </div>
          </section>
          <section className="cms-form-section">
            <h2>Update message</h2>
            <div className={grid}>
              <div>
                <Form.Item
                  name="update_title_en"
                  label="Title · English"
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  name="update_message_en"
                  label="Message · English"
                  rules={[{ required: true }]}
                >
                  <Input.TextArea rows={4} />
                </Form.Item>
              </div>
              <div>
                <Form.Item name="update_title_ar" label="Title · Arabic">
                  <Input dir="rtl" />
                </Form.Item>
                <Form.Item name="update_message_ar" label="Message · Arabic">
                  <Input.TextArea rows={4} dir="rtl" />
                </Form.Item>
              </div>
            </div>
          </section>
          <section className="cms-form-section">
            <h2>Maintenance</h2>
            <Form.Item name="maintenance_enabled" valuePropName="checked">
              <Checkbox>Show maintenance screen in the app</Checkbox>
            </Form.Item>
            <div className={grid}>
              <div>
                <Form.Item
                  name="maintenance_title_en"
                  label="Title · English"
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  name="maintenance_message_en"
                  label="Message · English"
                  rules={[{ required: true }]}
                >
                  <Input.TextArea rows={4} />
                </Form.Item>
              </div>
              <div>
                <Form.Item name="maintenance_title_ar" label="Title · Arabic">
                  <Input dir="rtl" />
                </Form.Item>
                <Form.Item name="maintenance_message_ar" label="Message · Arabic">
                  <Input.TextArea rows={4} dir="rtl" />
                </Form.Item>
              </div>
            </div>
          </section>
        </div>
      </Form>
    </AdminLayout>
  )
}
