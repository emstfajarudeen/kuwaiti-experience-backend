import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import { Button, Checkbox, Form, Input } from 'antd'
import { useState } from 'react'
import { postCmsForm } from '../../lib/cms_form'
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  settings: Record<string, string | null> | null
  contactInquiryTypes: string
  logoImageUrl: string | null
}
export default function Settings({
  adminName,
  csrfToken,
  success,
  error,
  form,
  settings,
  contactInquiryTypes,
  logoImageUrl,
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
      <div className="page-head form-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Site settings</h1>
        <div className="form-page-actions"><Button className="button primary" htmlType="submit" form="cms-settings-editor" loading={processing}>Save settings</Button></div>
      </div>
      <Form
        id="cms-settings-editor"
        component="form"
        form={settingsForm}
        layout="vertical"
        initialValues={{ brandName: value('brandName', 'brand_name', 'The Kuwaiti Experience'), directPhoneNumber: value('directPhoneNumber', 'direct_phone_number'), directPhoneDescription: value('directPhoneDescription', 'direct_phone_description'), whatsappNumber: value('whatsappNumber', 'whatsapp_number'), whatsappDescription: value('whatsappDescription', 'whatsapp_description'), contactEmail: value('contactEmail', 'contact_email'), headquartersName: value('headquartersName', 'headquarters_name'), headquartersAddress: value('headquartersAddress', 'headquarters_address'), headquartersMapUrl: value('headquartersMapUrl', 'headquarters_map_url'), contactInquiryTypes: form?.contactInquiryTypes ?? contactInquiryTypes, appStoreUrl: value('appStoreUrl', 'app_store_url'), playStoreUrl: value('playStoreUrl', 'play_store_url') }}
        onFinish={() => {
          const element = document.getElementById('cms-settings-editor') as HTMLFormElement | null
          if (element) postCmsForm({ action: '/admin/settings', csrfToken, form: settingsForm, setProcessing, data: new FormData(element) })
        }}
        action="/admin/settings"
        method="POST"
        encType="multipart/form-data"
        className="editor-grid tw:grid tw:items-start tw:gap-4"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <div className="editor-main tw:flex tw:flex-col">
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Brand &amp; logo</h2>
            <div className="form-grid tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4">
              <label>
                Brand name
                <Form.Item name="brandName" rules={[{ required: true, message: 'Enter the brand name.' }]}><Input name="brandName" /></Form.Item>
              </label>
              <div className="image-field tw:[display:flex] tw:[flex-direction:column] tw:[gap:var(--space-2)]">
                <span>Logo image</span>
                {logoImageUrl && (
                  <div className="tw:[margin:8px_0]">
                    <img
                      src={logoImageUrl}
                      alt="Brand logo"
                      className="tw:[max-height:80px] tw:[max-width:260px] tw:[object-fit:contain] tw:[background:var(--navy-deep)] tw:[padding:8px_16px] tw:[border-radius:var(--radius-sm)]"
                    />
                  </div>
                )}
                <ImageUpload
                  name="logoImage"
                  label={logoImageUrl ? 'Replace logo' : 'Upload logo'}
                />
                {logoImageUrl && (
                  <Checkbox name="removeLogo">Remove logo image</Checkbox>
                )}
              </div>
            </div>
          </section>
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Contact &amp; channels</h2>
            <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <label>
                Direct phone number
                <Form.Item name="directPhoneNumber"><Input name="directPhoneNumber" type="tel" placeholder="+965XXXXXXXX" /></Form.Item>
              </label>
              <label>
                Direct phone description
                <Form.Item name="directPhoneDescription"><Input name="directPhoneDescription" maxLength={160} placeholder="Support" /></Form.Item>
              </label>
              <label>
                WhatsApp number
                <Form.Item name="whatsappNumber"><Input name="whatsappNumber" type="tel" placeholder="+965XXXXXXXX" /></Form.Item>
              </label>
              <label>
                WhatsApp description
                <Form.Item name="whatsappDescription"><Input name="whatsappDescription" maxLength={160} placeholder="WhatsApp Assistance" /></Form.Item>
              </label>
              <label className="full tw:col-span-full">
                Contact email
                <Form.Item name="contactEmail" rules={[{ type: 'email', message: 'Enter a valid email address.' }]}><Input name="contactEmail" type="email" placeholder="support@kuwaitiexperience.com" /></Form.Item>
              </label>
              <label>
                Headquarters name
                <Form.Item name="headquartersName"><Input name="headquartersName" maxLength={160} placeholder="Kuwait City Headquarters" /></Form.Item>
              </label>
              <label>
                Headquarters address
                <Form.Item name="headquartersAddress"><Input name="headquartersAddress" maxLength={300} placeholder="Kuwait City" /></Form.Item>
              </label>
              <label className="full tw:col-span-full">
                Headquarters map URL
                <Form.Item name="headquartersMapUrl"><Input name="headquartersMapUrl" type="url" placeholder="https://maps.google.com/..." /></Form.Item>
              </label>
              <label className="full tw:col-span-full">
                Inquiry types
                <Form.Item name="contactInquiryTypes"><Input.TextArea name="contactInquiryTypes" rows={4} placeholder={'General Feedback\nPartnership\nVenue Listing\nSupport'} /></Form.Item>
              </label>
            </div>
          </section>
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
