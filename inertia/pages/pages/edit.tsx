import { useState } from 'react'
import { Button, Form, Input } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import RichTextField from '../../components/rich_text_field'
import { postCmsForm } from '../../lib/cms_form'

type Translation = {
  title: string | null
  eyebrow: string | null
  body: string | null
  body_format: string | null
  seo_title: string | null
  seo_description: string | null
}
type Form = Record<string, string | null>
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Form | null
  page: { id: number; slug: string; status: string } | null
  en: Translation | null
  ar: Translation | null
  fieldErrors: Record<string, string[]> | null
}
export default function PageEdit({
  adminName,
  csrfToken,
  success,
  error,
  form,
  page,
  en,
  ar,
  fieldErrors,
}: Props) {
  const value = (key: string, fallback: string | null | undefined) => form?.[key] ?? fallback ?? ''
  const initialTitle = value('titleEn', en?.title)
  const initialSlug = value('slug', page?.slug)
  const initialBody = value('bodyEn', en?.body)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [titleError, setTitleError] = useState(fieldErrors?.titleEn?.[0] ?? '')
  const [slugError, setSlugError] = useState(fieldErrors?.slug?.[0] ?? '')
  const [bodyError, setBodyError] = useState(fieldErrors?.bodyEn?.[0] ?? '')
  const [bodyContent, setBodyContent] = useState(initialBody)
  const [antdForm] = Form.useForm()
  const action = page ? `/admin/pages/${page.id}/save` : '/admin/pages'
  const placeholderCopy = (body: string) =>
    /Gheyar Seller App|demo placeholder|placeholder content|Draft demo content/i.test(body)
  const bodyHasText = (body: string) => {
    const format = (document.querySelector('[name="bodyFormatEn"]') as HTMLInputElement | null)
      ?.value
    return format === 'html'
      ? Boolean(new DOMParser().parseFromString(body, 'text/html').body.textContent?.trim())
      : Boolean(body.trim())
  }
  const bodyLength = (body: string) => body.length
  const focusBody = () => {
    const editor = document.querySelector(
      '#page-body-en .ql-editor[contenteditable="true"]'
    ) as HTMLElement | null
    editor?.focus()
    editor?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  return (
    <AdminLayout
      title={page ? 'Edit page' : 'New page'}
      active="pages"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="tw:mb-6 tw:flex tw:items-center tw:justify-between tw:gap-4">
        <a
          className="back-link tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:600] tw:[transition:color_0.15s_ease]"
          href="/admin/pages"
        >
          ← Back to pages
        </a>
        {page && (
          <span className={`status ${page.status} tw:shrink-0 tw:capitalize`}>{page.status}</span>
        )}
      </div>
      <div className="panel form-panel tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)]">
        <Form
          id="cms-page-editor"
          component="form"
          form={antdForm}
          layout="vertical"
          initialValues={{
            titleEn: initialTitle,
            eyebrowEn: value('eyebrowEn', en?.eyebrow),
            slug: initialSlug,
            seoTitleEn: value('seoTitleEn', en?.seo_title),
            seoDescriptionEn: value('seoDescriptionEn', en?.seo_description),
            titleAr: value('titleAr', ar?.title),
            eyebrowAr: value('eyebrowAr', ar?.eyebrow),
          }}
          onFinish={() => {
            const bodyInput = document.getElementById(
              'page-body-en-source'
            ) as HTMLInputElement | null
            const currentBody = bodyInput?.value ?? bodyContent
            if (page?.status === 'published' && !bodyHasText(currentBody)) {
              setBodyError('A published page must keep English content. Add text before saving.')
              focusBody()
              return
            }
            if (bodyLength(currentBody) > 50000) {
              setBodyError('Page content must be 50,000 characters or fewer.')
              focusBody()
              return
            }
            const element = document.getElementById('cms-page-editor') as HTMLFormElement | null
            if (element) {
              const data = Object.fromEntries(new FormData(element).entries()) as Record<
                string,
                string
              >
              postCmsForm({ action, csrfToken, form: antdForm, setProcessing, data })
            }
          }}
          className="editor-grid tw:grid tw:items-start tw:gap-4 tw:p-6"
        >
          <input type="hidden" name="_csrf" value={csrfToken} />
          <div className="editor-main tw:flex tw:flex-col">
            <section className="tw:pb-8">
              <h2>Page details</h2>
              <div className="form-grid tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4">
                <label>
                  <span>
                    Page title{' '}
                    <span className="tw:text-red-700" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <Form.Item
                    name="titleEn"
                    validateStatus={titleError ? 'error' : undefined}
                    help={titleError || undefined}
                    rules={[
                      { required: true, whitespace: true, message: 'Enter an English page title.' },
                      { min: 2, message: 'Use at least 2 characters.' },
                      { max: 200, message: 'Title must be 200 characters or fewer.' },
                    ]}
                  >
                    <Input
                      name="titleEn"
                      maxLength={200}
                      placeholder="About The Kuwaiti Experience"
                      onChange={() => setTitleError('')}
                    />
                  </Form.Item>
                </label>
                <label>
                  Intro label
                  <Form.Item name="eyebrowEn">
                    <Input name="eyebrowEn" maxLength={120} placeholder="LEGAL & POLICIES" />
                  </Form.Item>
                </label>
                <label>
                  <span>
                    URL slug{' '}
                    <span className="tw:text-red-700" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <Form.Item
                    name="slug"
                    validateStatus={slugError ? 'error' : undefined}
                    help={slugError || undefined}
                    rules={[
                      { required: true, whitespace: true, message: 'Enter a URL slug.' },
                      {
                        pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
                        message: 'Use lowercase letters, numbers, and single hyphens.',
                      },
                      { max: 160, message: 'URL slug must be 160 characters or fewer.' },
                    ]}
                  >
                    <Input
                      name="slug"
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      maxLength={160}
                      placeholder="about-us"
                      onChange={() => setSlugError('')}
                    />
                  </Form.Item>
                </label>
                <RichTextField
                  key={`en-${page?.id ?? 'new'}`}
                  id="page-body-en"
                  label="Formatted body"
                  name="bodyEn"
                  formatName="bodyFormatEn"
                  value={initialBody}
                  format={value('bodyFormatEn', en?.body_format || 'plain_text')}
                  required
                  error={bodyError || null}
                  onChange={(nextBody) => {
                    setBodyContent(nextBody)
                    setBodyError((current) => {
                      if (bodyLength(nextBody) > 50000)
                        return 'Page content must be 50,000 characters or fewer.'
                      if (!bodyHasText(nextBody)) return current
                      if (placeholderCopy(nextBody))
                        return current.toLowerCase().includes('demo text') ? current : ''
                      return ''
                    })
                  }}
                />
                <label>
                  SEO title
                  <Form.Item name="seoTitleEn">
                    <Input name="seoTitleEn" placeholder="About Us — The Kuwaiti Experience" />
                  </Form.Item>
                </label>
                <label>
                  SEO description
                  <Form.Item name="seoDescriptionEn">
                    <Input.TextArea name="seoDescriptionEn" rows={2} />
                  </Form.Item>
                </label>
              </div>
            </section>
            <section className="tw:border-t tw:border-brand-line tw:pt-8">
              <h2>Arabic translation</h2>
              <div className="form-grid tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4">
                <label>
                  Arabic title
                  <Form.Item name="titleAr">
                    <Input name="titleAr" dir="rtl" lang="ar" placeholder="عن تجربة الكويت" />
                  </Form.Item>
                </label>
                <label>
                  Arabic intro label
                  <Form.Item name="eyebrowAr">
                    <Input
                      name="eyebrowAr"
                      dir="rtl"
                      lang="ar"
                      maxLength={120}
                      placeholder="الشروط والسياسات"
                    />
                  </Form.Item>
                </label>
                <RichTextField
                  key={`ar-${page?.id ?? 'new'}`}
                  id="page-body-ar"
                  label="المحتوى العربي"
                  name="bodyAr"
                  formatName="bodyFormatAr"
                  value={value('bodyAr', ar?.body)}
                  format={value('bodyFormatAr', ar?.body_format || 'plain_text')}
                  rtl
                />
              </div>
            </section>
          </div>
        </Form>
        <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-3 tw:border-t tw:border-brand-line tw:px-6 tw:py-5">
          {page && (
            <div className="form-delete-actions tw:!m-0">
              <form
                action={`/admin/pages/${page.id}/${page.status === 'published' ? 'archive' : 'publish'}`}
                method="POST"
                onSubmit={(event) => {
                  if (page.status === 'published') return
                  const title = String(antdForm.getFieldValue('titleEn') ?? '').trim()
                  if (title.length < 2) {
                    event.preventDefault()
                    setTitleError('Enter an English page title before publishing.')
                    antdForm.scrollToField('titleEn')
                    return
                  }
                  if (!bodyHasText(bodyContent)) {
                    event.preventDefault()
                    setBodyError('Add English page content before publishing.')
                    focusBody()
                    return
                  }
                  if (bodyLength(bodyContent) > 50000) {
                    event.preventDefault()
                    setBodyError('Page content must be 50,000 characters or fewer.')
                    focusBody()
                    return
                  }
                  if (placeholderCopy(bodyContent)) {
                    event.preventDefault()
                    setBodyError(
                      'Replace the demo text with approved page copy, save the page, then publish again.'
                    )
                    focusBody()
                  }
                }}
              >
                <input type="hidden" name="_csrf" value={csrfToken} />
                <button className="button secondary" type="submit">
                  {page.status === 'published'
                    ? 'Set status to Archived'
                    : 'Set status to Published'}
                </button>
              </form>
              <button
                className="button danger"
                type="button"
                onClick={() => setConfirmDelete(true)}
              >
                Delete permanently
              </button>
            </div>
          )}
          <Button
            className="button primary"
            htmlType="submit"
            form="cms-page-editor"
            loading={processing}
          >
            Save page
          </Button>
        </div>
      </div>
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete page"
        message="Permanently delete this page?"
        action={page ? `/admin/pages/${page.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
