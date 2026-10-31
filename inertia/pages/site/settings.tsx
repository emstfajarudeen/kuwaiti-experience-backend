import AdminLayout from '../../layouts/admin_layout'
import { Button, Form, Input } from 'antd'
import { useState } from 'react'
import { postCmsForm } from '../../lib/cms_form'
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  settings: Record<string, string | null> | null
}
export default function Settings({
  adminName,
  csrfToken,
  success,
  error,
  form,
  settings,
}: Props) {
  const [settingsForm] = Form.useForm()
  const [processing, setProcessing] = useState(false)
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
      <div className="page-head form-page-head site-settings-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Site settings</h1>
        <div className="form-page-actions"><Button className="button primary" htmlType="submit" form="cms-settings-editor" loading={processing}>Save settings</Button></div>
      </div>
      <Form
        id="cms-settings-editor"
        component="form"
        form={settingsForm}
        layout="vertical"
        initialValues={{ appStoreUrl: value('appStoreUrl', 'app_store_url'), playStoreUrl: value('playStoreUrl', 'play_store_url') }}
        onFinish={() => {
          const element = document.getElementById('cms-settings-editor') as HTMLFormElement | null
          if (element) postCmsForm({ action: '/admin/settings', csrfToken, form: settingsForm, setProcessing, data: new FormData(element) })
        }}
        action="/admin/settings"
        method="POST"
        className="editor-grid tw:grid tw:items-start tw:gap-4"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <div className="editor-main tw:flex tw:flex-col">
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>App store links</h2>
            <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <label>
                App Store URL (iOS)
                <Form.Item name="appStoreUrl"><Input name="appStoreUrl" type="url" placeholder="https://apps.apple.com/..." /></Form.Item>
              </label>
              <label>
                Google Play URL (Android)
                <Form.Item name="playStoreUrl"><Input name="playStoreUrl" type="url" placeholder="https://play.google.com/..." /></Form.Item>
              </label>
            </div>
          </section>
        </div>
      </Form>
    </AdminLayout>
  )
}
