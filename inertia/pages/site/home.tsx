import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import ConfirmModal from '../../components/confirm_modal'
import { Button, Checkbox, Form, Input, InputNumber, Select } from 'antd'
import { postCmsForm } from '../../lib/cms_form'
type Home = {
  hero_eyebrow: string | null
  hero_title: string | null
  discovery_title: string | null
  app_title: string | null
  app_body: string | null
}
type Card = {
  id: number
  place_id: number
  caption_en: string | null
  caption_ar: string | null
  sort_order: number
  active: boolean
}
type Place = { id: number; type: string; status: string; title: string }
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  cardForm: Record<string, string | null> | null
  locale: 'en' | 'ar'
  home: Home | null
  cards: Card[]
  places: Place[]
  heroImageUrl: string | null
}
export default function HomePage({
  adminName,
  csrfToken,
  success,
  error,
  form,
  cardForm,
  locale,
  home,
  cards,
  places,
  heroImageUrl,
}: Props) {
  const [deleting, setDeleting] = useState<Card | null>(null)
  const [homeForm] = Form.useForm()
  const [processing, setProcessing] = useState(false)
  const value = (key: string, fallback: string | null | undefined) => form?.[key] ?? fallback ?? ''
  const placeOptions = places.map((place) => ({ value: place.id, label: `${place.title} — ${place.type} (${place.status})` }))
  return (
    <AdminLayout
      title="Homepage"
      active="home"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head form-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
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
        initialValues={{ hero_eyebrow: value('hero_eyebrow', home?.hero_eyebrow ?? 'WELCOME TO KUWAIT'), hero_title: value('hero_title', home?.hero_title ?? 'Explore Kuwait'), discovery_title: value('discovery_title', home?.discovery_title ?? 'What would you like to do?'), app_title: value('app_title', home?.app_title ?? ''), app_body: value('app_body', home?.app_body ?? '') }}
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
                Hero eyebrow
                <Form.Item name="hero_eyebrow" rules={[{ required: true, message: 'Enter a hero eyebrow.' }]}><Input name="hero_eyebrow" /></Form.Item>
              </label>
              <label>
                Hero headline
                <Form.Item name="hero_title" rules={[{ required: true, message: 'Enter a hero headline.' }]}><Input name="hero_title" /></Form.Item>
              </label>
              <div className="image-field tw:[display:flex] tw:[flex-direction:column] tw:[gap:var(--space-2)]">
                <span>Hero image ({locale === 'ar' ? 'Arabic' : 'English'})</span>
                {heroImageUrl && (
                  <img
                    className="cover-preview tw:[max-height:220px] tw:[width:100%] tw:[max-height:220px] tw:[object-fit:cover] tw:[border-radius:var(--radius-sm)] tw:[border:1px_solid_var(--line)] tw:[background:var(--ivory)]"
                    src={heroImageUrl}
                    alt="Current hero image"
                  />
                )}
                <ImageUpload
                  name="heroImage"
                  label={heroImageUrl ? 'Replace hero image' : 'Upload hero image'}
                />
                {heroImageUrl && (
                  <Checkbox name="removeHeroImage">Remove hero image</Checkbox>
                )}
              </div>
            </div>
          </section>
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Category headline &amp; app promo</h2>
            <div className="form-grid tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4">
              <label>
                Discovery section headline
                <Form.Item name="discovery_title" rules={[{ required: true, message: 'Enter a discovery section headline.' }]}><Input name="discovery_title" /></Form.Item>
              </label>
              <label>
                Mobile app banner title
                <Form.Item name="app_title"><Input name="app_title" placeholder="Take Kuwait with you" /></Form.Item>
              </label>
              <label className="full tw:col-span-full">
                Mobile app banner description
                <Form.Item name="app_body"><Input.TextArea name="app_body" rows={3} placeholder="App description..." /></Form.Item>
              </label>
            </div>
          </section>
        </div>
      </Form>
      <section
        className="panel form-panel tw:[margin-top:24px] tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6"
        id="home-cards"
      >
        <h2>Place stories</h2>
        {cards.length > 0 && (
          <div className="tw:[display:flex] tw:[flex-direction:column] tw:[gap:16px] tw:[margin-top:20px]">
            {cards.map((card) => (
              <div
                key={card.id}
                className="panel tw:[margin-bottom:0] tw:[box-shadow:none] tw:[border:1px_solid_var(--line)] tw:[padding:18px] tw:[background:var(--surface-subtle)] tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)]"
              >
                <HomeCardEditor action={`/admin/home/cards/${card.id}/save`} csrfToken={csrfToken} places={placeOptions} initial={{ place_id: card.place_id, caption_en: card.caption_en ?? '', caption_ar: card.caption_ar ?? '', sort_order: card.sort_order, active: card.active }} submitLabel="Save card" />
                <div className="tw:[margin-top:8px] tw:[text-align:right]">
                  <button
                    className="text-button danger tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:8px_12px] tw:[background:transparent] tw:[border:none] tw:[color:var(--navy)] tw:[font-size:14px] tw:[font-weight:600] tw:[cursor:pointer] tw:[border-radius:var(--radius-sm)] tw:[transition:all_0.15s_ease]"
                    type="button"
                    onClick={() => setDeleting(card)}
                  >
                    Remove card
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="tw:[margin-top:28px] tw:[border-top:1px_solid_var(--line)] tw:[padding-top:20px]">
          <h3>Add a place story card</h3>
          <HomeCardEditor action="/admin/home/cards" csrfToken={csrfToken} places={placeOptions} initial={{ place_id: cardForm?.place_id ? Number(cardForm.place_id) : undefined, caption_en: cardForm?.caption_en ?? '', caption_ar: cardForm?.caption_ar ?? '', sort_order: Number(cardForm?.sort_order ?? 0), active: cardForm ? cardForm.active === 'on' : true }} submitLabel="Add story card" />
        </div>
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Remove card"
        message="Remove this place card from the homepage?"
        action={deleting ? `/admin/home/cards/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Remove"
        danger
      />
    </AdminLayout>
  )
}

function HomeCardEditor({ action, csrfToken, places, initial, submitLabel }: { action: string; csrfToken: string; places: { value: number; label: string }[]; initial: { place_id?: number; caption_en: string; caption_ar: string; sort_order: number; active: boolean }; submitLabel: string }) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  return <Form form={form} layout="vertical" className="form-grid two tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1" initialValues={initial} onFinish={(v) => postCmsForm({ action, csrfToken, form, setProcessing: setSaving, data: { place_id: String(v.place_id), caption_en: v.caption_en ?? '', caption_ar: v.caption_ar ?? '', sort_order: String(v.sort_order), active: v.active ? 'on' : '' } })}>
    <div className="tw:col-span-full tw:flex tw:justify-end"><Button className="button secondary" htmlType="submit" loading={saving}>{submitLabel}</Button></div>
    <Form.Item name="place_id" label="Venue" rules={[{ required: true, message: 'Choose a place.' }]}><Select showSearch optionFilterProp="label" options={places} /></Form.Item>
    <Form.Item name="caption_en" label="English caption"><Input maxLength={200} placeholder="Custom caption" /></Form.Item>
    <Form.Item name="caption_ar" label="Arabic caption"><Input maxLength={200} dir="rtl" placeholder="تعليق مخصص" /></Form.Item>
    <Form.Item name="sort_order" label="Display order" rules={[{ required: true, message: 'Enter a display order.' }]}><InputNumber className="tw:w-full" min={0} max={9999} precision={0} /></Form.Item>
    <Form.Item name="active" valuePropName="checked"><Checkbox>Visible when venue is published</Checkbox></Form.Item>
  </Form>
}
