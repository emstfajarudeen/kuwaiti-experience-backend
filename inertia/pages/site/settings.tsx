import AdminLayout from '../../layouts/admin_layout'
import { Button, Form, Input } from 'antd'
import { useState } from 'react'
import { postCmsForm } from '../../lib/cms_form'
import { ReadOnlyNotice, useReadOnly } from '../../components/read_only'
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  settings: Record<string, string | null> | null
}
const contactFields = [
  {
    name: 'directPhoneNumber',
    key: 'direct_phone_number',
    label: 'Direct phone number',
    placeholder: '+96541443322',
    maxLength: 25,
  },
  {
    name: 'directPhoneDescription',
    key: 'direct_phone_description',
    label: 'Direct phone description',
    placeholder: 'Call our team',
    maxLength: 160,
  },
  {
    name: 'whatsappNumber',
    key: 'whatsapp_number',
    label: 'WhatsApp number',
    placeholder: '+96541443322',
    maxLength: 25,
  },
  {
    name: 'whatsappDescription',
    key: 'whatsapp_description',
    label: 'WhatsApp description',
    placeholder: 'Chat with our team',
    maxLength: 160,
  },
  {
    name: 'contactEmail',
    key: 'contact_email',
    label: 'Contact email',
    placeholder: 'info@example.com',
    maxLength: 254,
  },
  {
    name: 'headquartersName',
    key: 'headquarters_name',
    label: 'Headquarters name',
    placeholder: 'Headquarters',
    maxLength: 160,
  },
  {
    name: 'headquartersAddress',
    key: 'headquarters_address',
    label: 'Headquarters address',
    placeholder: 'Street, city, country',
    maxLength: 300,
  },
  {
    name: 'headquartersMapUrl',
    key: 'headquarters_map_url',
    label: 'Map URL',
    placeholder: 'https://maps.google.com/...',
    maxLength: 500,
  },
] as const
export default function Settings({ adminName, csrfToken, success, error, form, settings }: Props) {
  const [settingsForm] = Form.useForm()
  const [processing, setProcessing] = useState(false)
  const readOnly = useReadOnly('settings.update', true)
  const value = (formKey: string, settingKey: string, fallback = '') =>
    form?.[formKey] ?? settings?.[settingKey] ?? fallback
  return (
    <AdminLayout
      title="Site settings"
      active="settings"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      {readOnly && <ReadOnlyNotice thing="page" />}
      <Form
        id="cms-settings-editor"
        component="form"
        form={settingsForm}
        disabled={readOnly}
        layout="vertical"
        initialValues={{
          appStoreUrl: value('appStoreUrl', 'app_store_url'),
          playStoreUrl: value('playStoreUrl', 'play_store_url'),
          ...Object.fromEntries(contactFields.map(({ name, key }) => [name, value(name, key)])),
        }}
        onFinish={() => {
          const element = document.getElementById('cms-settings-editor') as HTMLFormElement | null
          if (element)
            postCmsForm({
              action: '/admin/settings',
              csrfToken,
              form: settingsForm,
              setProcessing,
              data: new FormData(element),
            })
        }}
        action="/admin/settings"
        method="POST"
        noValidate
        className="editor-grid tw:grid tw:items-start tw:gap-4"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <div className="editor-main tw:flex tw:flex-col">
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
              <h2>Site settings</h2>
              {!readOnly && (
                <Button className="button primary" htmlType="submit" loading={processing}>
                  Save settings
                </Button>
              )}
            </div>
            <h3 className="tw:mt-6">Contact &amp; channels</h3>
            <div className="form-grid two tw:mt-4 tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
              {contactFields.map(({ name, label, placeholder, maxLength }) => (
                <Form.Item
                  key={name}
                  name={name}
                  label={label}
                  rules={
                    name === 'contactEmail'
                      ? [{ type: 'email', message: 'Enter a valid email address.' }]
                      : name === 'headquartersMapUrl'
                        ? [{ type: 'url', message: 'Enter a valid map URL.' }]
                        : name === 'directPhoneNumber' || name === 'whatsappNumber'
                          ? [
                              {
                                pattern: /^\+?[1-9]\d{7,14}$/,
                                message: 'Enter an international number with 8 to 15 digits.',
                              },
                            ]
                          : undefined
                  }
                >
                  <Input name={name} placeholder={placeholder} maxLength={maxLength} />
                </Form.Item>
              ))}
            </div>
            <div className="cms-form-section-separated">
              <h3>App store links</h3>
              <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
                <label>
                  App Store URL (iOS)
                  <Form.Item
                    name="appStoreUrl"
                    rules={[
                      { type: 'url', message: 'Enter a valid link starting with https://' },
                      {
                        pattern: /^https?:\/\//i,
                        message: 'The link must start with http:// or https://',
                      },
                      { max: 500, message: 'Link must be 500 characters or fewer.' },
                    ]}
                  >
                    <Input name="appStoreUrl" type="url" placeholder="https://apps.apple.com/..." />
                  </Form.Item>
                </label>
                <label>
                  Google Play URL (Android)
                  <Form.Item
                    name="playStoreUrl"
                    rules={[
                      { type: 'url', message: 'Enter a valid link starting with https://' },
                      {
                        pattern: /^https?:\/\//i,
                        message: 'The link must start with http:// or https://',
                      },
                      { max: 500, message: 'Link must be 500 characters or fewer.' },
                    ]}
                  >
                    <Input
                      name="playStoreUrl"
                      type="url"
                      placeholder="https://play.google.com/..."
                    />
                  </Form.Item>
                </label>
              </div>
            </div>
          </section>
        </div>
      </Form>
    </AdminLayout>
  )
}
