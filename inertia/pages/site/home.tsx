import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import { Button, Form, Input } from 'antd'
import { postCmsForm } from '../../lib/cms_form'
type Home = {
  hero_eyebrow: string | null
  hero_title: string | null
  discovery_eyebrow: string | null
  discovery_title: string | null
  discovery_description: string | null
}
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  locale: 'en' | 'ar'
  home: Home | null
  heroImageUrl: string | null
}
export default function HomePage({
  adminName,
  csrfToken,
  success,
  error,
  form,
  locale,
  home,
  heroImageUrl,
}: Props) {
  const [homeForm] = Form.useForm()
  const [processing, setProcessing] = useState(false)
  const value = (key: string, fallback: string | null | undefined) => form?.[key] ?? fallback ?? ''
  return (
    <AdminLayout
      title="Homepage"
      active="home"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head form-page-head home-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Homepage</h1>
      </div>
      <div className="filter-pills tw:[display:flex] tw:[align-items:center] tw:[gap:var(--space-2)] tw:[margin-bottom:var(--space-5)]">
        <a href="/admin/home?locale=en" className={locale === 'en' ? 'selected' : ''}>
          English
        </a>
        <a href="/admin/home?locale=ar" className={locale === 'ar' ? 'selected' : ''}>
          العربية (Arabic)
        </a>
        <div className="form-page-actions"><Button className="button primary" htmlType="submit" form="cms-home-editor" loading={processing}>Save homepage</Button></div>
      </div>
      <Form
        id="cms-home-editor"
        component="form"
        form={homeForm}
        layout="vertical"
        initialValues={{
          hero_eyebrow: value('hero_eyebrow', home?.hero_eyebrow ?? 'WELCOME TO KUWAIT'),
          hero_title: value('hero_title', home?.hero_title ?? 'Explore Kuwait'),
          discovery_eyebrow: value(
            'discovery_eyebrow',
            home?.discovery_eyebrow ?? 'EVERYTHING IN ONE PLACE'
          ),
          discovery_title: value(
            'discovery_title',
            home?.discovery_title ?? 'What would you like to do?'
          ),
          discovery_description: value(
            'discovery_description',
            home?.discovery_description ?? 'Start with a ride, then make the city yours. Find the best of Kuwait by category.'
          ),
        }}
        onFinish={() => {
          const element = document.getElementById('cms-home-editor') as HTMLFormElement | null
          if (element) postCmsForm({ action: '/admin/home', csrfToken, form: homeForm, setProcessing, data: new FormData(element) })
        }}
        action="/admin/home"
        method="POST"
        encType="multipart/form-data"
        className="editor-grid tw:grid tw:items-start tw:gap-4"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <input type="hidden" name="locale" value={locale} />
        <div className="editor-main tw:flex tw:flex-col">
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Hero headline &amp; image</h2>
            <div className="form-grid tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4">
              <label>
                Hero label
                <Form.Item name="hero_eyebrow" rules={[{ required: true, message: 'Enter a hero label.' }]}><Input name="hero_eyebrow" /></Form.Item>
              </label>
              <label>
                Hero headline
                <Form.Item name="hero_title" rules={[{ required: true, message: 'Enter a hero headline.' }]}><Input name="hero_title" /></Form.Item>
              </label>
              <ImageUpload
                name="heroImage"
                label={`Hero image (${locale === 'ar' ? 'Arabic' : 'English'})`}
                currentImageUrl={heroImageUrl}
                currentImageAlt="Current hero image"
                removeName="removeHeroImage"
                initiallyRemoved={form?.removeHeroImage === 'on'}
              />
            </div>
          </section>
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Discovery section</h2>
            <div className="form-grid tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4">
              <label>
                Section label
                <Form.Item name="discovery_eyebrow" rules={[{ required: true, message: 'Enter a section label.' }]}><Input name="discovery_eyebrow" /></Form.Item>
              </label>
              <label>
                Section heading
                <Form.Item name="discovery_title" rules={[{ required: true, message: 'Enter a section heading.' }]}><Input name="discovery_title" /></Form.Item>
              </label>
              <label>
                Section description
                <Form.Item name="discovery_description" rules={[{ required: true, message: 'Enter a section description.' }]}><Input.TextArea name="discovery_description" rows={3} /></Form.Item>
              </label>
            </div>
          </section>
        </div>
      </Form>
    </AdminLayout>
  )
}
