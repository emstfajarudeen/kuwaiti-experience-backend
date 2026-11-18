import { Button, Checkbox, ConfigProvider, Form, Input } from 'antd'
import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import { postCmsForm } from '../../lib/cms_form'
import RequiredMark from '../../components/required_mark'
import { ReadOnlyNotice, useReadOnly } from '../../components/read_only'

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

const grid = 'tw:mt-4 tw:grid tw:grid-cols-2 tw:items-start tw:gap-x-6 tw:max-[900px]:grid-cols-1'

export default function AppConfigPage({ adminName, csrfToken, success, error, config }: Props) {
  const [form] = Form.useForm<AppConfig>()
  const [processing, setProcessing] = useState(false)
  const readOnly = useReadOnly('settings.update', true)
  const forced = {
    ios: Form.useWatch('ios_force', form),
    android: Form.useWatch('android_force', form),
  }
  return (
    <AdminLayout
      title="App configuration"
      active="app-config"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      {readOnly && <ReadOnlyNotice thing="page" />}
      <ConfigProvider theme={{ components: { Form: { itemMarginBottom: 24 } } }}>
        <Form
          id="app-config-editor"
          noValidate
          form={form}
          disabled={readOnly}
          layout="vertical"
          initialValues={config}
          onFinish={(values) =>
            postCmsForm({
              action: '/admin/app-config',
              csrfToken,
              form,
              setProcessing,
              data: values,
            })
          }
        >
          <div className="panel form-panel tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-6">
            <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
              <h2>App configuration</h2>
            </div>
            <section className="cms-form-section tw:mt-6">
              <div className={grid}>
                {(['ios', 'android'] as const).map((platform) => (
                  <div key={platform}>
                    <h3 className="tw:mb-3">{platform === 'ios' ? 'iOS' : 'Android'}</h3>
                    <Form.Item
                      name={`${platform}_version`}
                      label={<>Latest version{forced[platform] && <RequiredMark />}</>}
                      dependencies={[`${platform}_force`]}
                      rules={[
                        ({ getFieldValue }) => ({
                          validator: (_, value) =>
                            getFieldValue(`${platform}_force`) && !String(value ?? '').trim()
                              ? Promise.reject(new Error('Enter a version to require an update.'))
                              : Promise.resolve(),
                        }),
                        {
                          pattern: /^\d+\.\d+\.\d+$/,
                          message: 'Use the format 1.2.3 (numbers separated by dots).',
                        },
                        { max: 32, message: 'Version must be 32 characters or fewer.' },
                      ]}
                    >
                      <Input placeholder="1.0.0" />
                    </Form.Item>
                    <Form.Item
                      name={`${platform}_store_url`}
                      label={<>Store link{forced[platform] && <RequiredMark />}</>}
                      dependencies={[`${platform}_force`]}
                      rules={[
                        ({ getFieldValue }) => ({
                          validator: (_, value) =>
                            getFieldValue(`${platform}_force`) && !String(value ?? '').trim()
                              ? Promise.reject(
                                  new Error('Enter a store link to require an update.')
                                )
                              : Promise.resolve(),
                        }),
                        { type: 'url', message: 'Enter a valid link starting with https://' },
                        {
                          pattern: /^https?:\/\//i,
                          message: 'The link must start with http:// or https://',
                        },
                        { max: 500, message: 'Link must be 500 characters or fewer.' },
                      ]}
                    >
                      <Input placeholder="https://..." />
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
                    rules={[
                      { required: true, whitespace: true, message: 'Enter the English title.' },
                      { max: 200, message: 'Title must be 200 characters or fewer.' },
                    ]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="update_message_en"
                    label="Message · English"
                    rules={[
                      { required: true, whitespace: true, message: 'Enter the English message.' },
                      { max: 2000, message: 'Message must be 2,000 characters or fewer.' },
                    ]}
                  >
                    <Input.TextArea rows={4} />
                  </Form.Item>
                </div>
                <div>
                  <Form.Item
                    name="update_title_ar"
                    label="Title · Arabic"
                    rules={[{ max: 200, message: 'Title must be 200 characters or fewer.' }]}
                  >
                    <Input dir="rtl" />
                  </Form.Item>
                  <Form.Item
                    name="update_message_ar"
                    label="Message · Arabic"
                    rules={[{ max: 2000, message: 'Message must be 2,000 characters or fewer.' }]}
                  >
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
                    rules={[
                      { required: true, whitespace: true, message: 'Enter the English title.' },
                      { max: 200, message: 'Title must be 200 characters or fewer.' },
                    ]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="maintenance_message_en"
                    label="Message · English"
                    rules={[
                      { required: true, whitespace: true, message: 'Enter the English message.' },
                      { max: 2000, message: 'Message must be 2,000 characters or fewer.' },
                    ]}
                  >
                    <Input.TextArea rows={4} />
                  </Form.Item>
                </div>
                <div>
                  <Form.Item
                    name="maintenance_title_ar"
                    label="Title · Arabic"
                    rules={[{ max: 200, message: 'Title must be 200 characters or fewer.' }]}
                  >
                    <Input dir="rtl" />
                  </Form.Item>
                  <Form.Item
                    name="maintenance_message_ar"
                    label="Message · Arabic"
                    rules={[{ max: 2000, message: 'Message must be 2,000 characters or fewer.' }]}
                  >
                    <Input.TextArea rows={4} dir="rtl" />
                  </Form.Item>
                </div>
              </div>
            </section>
            {!readOnly && (
              <div className="cms-form-actions">
                <Button type="primary" htmlType="submit" loading={processing}>
                  Save configuration
                </Button>
              </div>
            )}
          </div>
        </Form>
      </ConfigProvider>
    </AdminLayout>
  )
}
