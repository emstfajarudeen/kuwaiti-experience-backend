import { useRef, useState } from 'react'
import { Button, Checkbox, Form, Input, message } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import FormSelect from '../../components/form_select'
import ConfirmModal from '../../components/confirm_modal'
import { postCmsForm } from '../../lib/cms_form'

type Place = {
  id: number
  type: string
  category_id: number | null
  slug: string
  status: string
  price_mode: string
  price_amount: string | null
  latitude: string | null
  longitude: string | null
  website_url: string | null
  featured_order: number | null
}
type Translation = {
  title: string | null
  summary: string | null
  address: string | null
  body: string | null
  price_unit: string | null
  hours_note: string | null
  seo_title: string | null
  seo_description: string | null
}
type GalleryImage = {
  id: number
  alt_en: string | null
  alt_ar: string | null
  caption_en: string | null
  caption_ar: string | null
  sort_order: number
  url: string | null
}
type Props = {
  adminName: string
  csrfToken: string
  error: string | null
  form: Record<string, string | null> | null
  place: Place | null
  en: Translation | null
  ar: Translation | null
  categories: Array<{ id: number; type: string; slug: string; name_en: string | null }>
  types: Array<{ code: string; name_en: string }>
  coverUrl: string | null
  gallery: GalleryImage[]
  maxUploads: number
  hoursJson: string
}
export default function PlaceEdit({
  adminName,
  csrfToken,
  error,
  form,
  place,
  en,
  ar,
  categories,
  types,
  coverUrl,
  gallery,
  maxUploads,
  hoursJson,
}: Props) {
  const [selectedType, setSelectedType] = useState(form?.type ?? place?.type ?? '')
  const [selectedCategory, setSelectedCategory] = useState(
    String(form?.categoryId ?? place?.category_id ?? '')
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [processing, setProcessing] = useState(false)
  const submitIntent = useRef<'save' | 'publish'>('save')
  const [antdForm] = Form.useForm()
  const value = (key: string, fallback: string | number | null | undefined) =>
    form?.[key] ?? fallback ?? ''
  const matchedCategories = categories.filter(
    (category) => !selectedType || category.type === selectedType
  )
  const action = place ? `/admin/places/${place.id}/save` : '/admin/places'
  return (
    <AdminLayout
      title={place ? 'Edit place' : 'New place'}
      active="places"
      adminName={adminName}
      csrfToken={csrfToken}
      error={error}
    >
      <a
        className="back-link tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:600] tw:[margin-bottom:var(--space-3)] tw:[transition:color_0.15s_ease]"
        href="/admin/places"
      >
        ← Back to places
      </a>
      <div className="page-head form-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div className="tw:[display:flex] tw:[align-items:center] tw:[gap:12px] tw:[flex-wrap:wrap]">
          <h1>{place ? en?.title || 'Edit place' : 'Create a new place'}</h1>
          {place && (
            <span
              className={`status ${place.status} tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:4px_10px] tw:[border-radius:var(--radius-full)] tw:[font-size:12px] tw:[font-weight:700] tw:[text-transform:capitalize] tw:[letter-spacing:0.02em] tw:[border:1px_solid_transparent] tw:[line-height:1.2]`}
            >
              {place.status}
            </span>
          )}
        </div>
        <div className="form-page-actions">
          {place && (
            <div className="page-head-actions tw:flex tw:flex-wrap tw:items-center tw:gap-3">
            <a
              className="button secondary"
              href={`/admin/places/${place.id}/preview`}
              target="_blank"
              rel="noreferrer"
            >
              Preview
            </a>
            <a className="button secondary" href={`/admin/places/${place.id}/explore`}>
              Explore details &amp; hours
            </a>
            </div>
          )}
          {!place || place.status !== 'published' ? (
            <>
              <Button className="button secondary" htmlType="submit" form="cms-place-editor" name="intent" value="save" loading={processing}>Save {place ? 'changes' : 'draft'}</Button>
              <Button className="button primary" htmlType="submit" form="cms-place-editor" name="intent" value="publish" loading={processing}>Save and publish</Button>
            </>
          ) : <Button className="button primary" htmlType="submit" form="cms-place-editor" name="intent" value="save" loading={processing}>Save changes</Button>}
        </div>
      </div>
      <Form
        id="cms-place-editor"
        component="form"
        form={antdForm}
        layout="vertical"
        initialValues={{
          titleEn: value('titleEn', en?.title), slug: value('slug', place?.slug),
          summaryEn: value('summaryEn', en?.summary), addressEn: value('addressEn', en?.address),
          bodyEn: value('bodyEn', en?.body), titleAr: value('titleAr', ar?.title),
          addressAr: value('addressAr', ar?.address), summaryAr: value('summaryAr', ar?.summary),
          bodyAr: value('bodyAr', ar?.body),
          websiteUrl: value('websiteUrl', place?.website_url), seoTitleEn: value('seoTitleEn', en?.seo_title),
          featured_order: value('featured_order', place?.featured_order ?? 0),
          seoDescriptionEn: value('seoDescriptionEn', en?.seo_description),
        }}
        onSubmitCapture={(event) => {
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
          submitIntent.current = submitter?.value === 'publish' ? 'publish' : 'save'
        }}
        onFinish={() => {
          if (!selectedType) {
            void message.error('Select a place type.')
            return
          }
          const element = document.getElementById('cms-place-editor') as HTMLFormElement | null
          if (element) {
            const data = new FormData(element)
            data.set('intent', submitIntent.current)
            postCmsForm({ action, csrfToken, form: antdForm, setProcessing, data })
          }
        }}
        action={action}
        method="POST"
        encType="multipart/form-data"
        className="editor-grid tw:grid tw:items-start tw:gap-4"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        {/* Preserve stored visit details when saving the simplified form. */}
        <input type="hidden" name="priceMode" value={value('priceMode', place?.price_mode ?? 'unknown')} />
        <input type="hidden" name="priceAmount" value={value('priceAmount', place?.price_amount)} />
        <input type="hidden" name="priceUnitEn" value={value('priceUnitEn', en?.price_unit)} />
        <input type="hidden" name="hoursNoteEn" value={value('hoursNoteEn', en?.hours_note)} />
        <input type="hidden" name="latitude" value={value('latitude', place?.latitude)} />
        <input type="hidden" name="longitude" value={value('longitude', place?.longitude)} />
        <div className="editor-main tw:flex tw:flex-col">
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Place details</h2>
            <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <label>
                Place type
                <FormSelect
                  name="type"
                  required
                  value={selectedType}
                  placeholder="Select a place type"
                  options={types.map((type) => ({ value: type.code, label: type.name_en }))}
                  onChange={(next) => {
                    setSelectedType(next)
                    if (
                      selectedCategory &&
                      !categories.some(
                        (category) =>
                          String(category.id) === selectedCategory &&
                          (!next || category.type === next)
                      )
                    )
                      setSelectedCategory('')
                  }}
                />
              </label>
              <label>
                Category
                <FormSelect name="categoryId" value={selectedCategory} placeholder="Uncategorized" options={matchedCategories.map((category) => ({ value: String(category.id), label: category.name_en || category.slug }))} onChange={setSelectedCategory} />
              </label>
              <label>
                English title
                <Form.Item name="titleEn" rules={[{ required: true, message: 'Enter an English title.' }, { max: 200, message: 'Title must be 200 characters or fewer.' }]}><Input name="titleEn" maxLength={200} placeholder="Kuwait Towers" /></Form.Item>
              </label>
              <label>
                URL slug
                <Form.Item name="slug" rules={[{ required: true, message: 'Enter a URL slug.' }, { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: 'Use lowercase letters, numbers, and single hyphens.' }, { max: 160, message: 'Slug must be 160 characters or fewer.' }]}><Input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={160} placeholder="kuwait-towers" /></Form.Item>
              </label>
              <label className="full tw:col-span-full">
                Short summary
                <Form.Item name="summaryEn" rules={[{ required: true, message: 'Enter a short English summary.' }, { max: 500, message: 'Summary must be 500 characters or fewer.' }]}><Input.TextArea name="summaryEn" rows={2} maxLength={500} placeholder="A brief summary" /></Form.Item>
              </label>
              <label className="full tw:col-span-full">
                Address
                <Form.Item name="addressEn" rules={[{ required: true, message: 'Enter an English address.' }, { max: 300, message: 'Address must be 300 characters or fewer.' }]}><Input name="addressEn" maxLength={300} placeholder="Arabian Gulf Street, Sharq, Kuwait City" /></Form.Item>
              </label>
              <label className="full tw:col-span-full">
                About this place
                <Form.Item name="bodyEn"><Input.TextArea name="bodyEn" rows={7} maxLength={30000} placeholder="Detailed description..." /></Form.Item>
              </label>
            </div>
          </section>
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Arabic translation</h2>
            <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <label>
                Arabic title
                <Form.Item name="titleAr"><Input name="titleAr" lang="ar" dir="rtl" placeholder="أبراج الكويت" /></Form.Item>
              </label>
              <label>
                Arabic address
                <Form.Item name="addressAr"><Input name="addressAr" lang="ar" dir="rtl" placeholder="شارع الخليج العربي، الشرق" /></Form.Item>
              </label>
              <label className="full tw:col-span-full">
                Arabic summary
                <Form.Item name="summaryAr"><Input.TextArea name="summaryAr" lang="ar" dir="rtl" rows={2} /></Form.Item>
              </label>
              <label className="full tw:col-span-full">
                Arabic body
                <Form.Item name="bodyAr"><Input.TextArea name="bodyAr" lang="ar" dir="rtl" rows={5} /></Form.Item>
              </label>
            </div>
          </section>
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Visit information</h2>
            <div className="form-grid tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4">
              <label className="full tw:col-span-full">
                Website URL
                <Form.Item
                  name="websiteUrl"
                  rules={[
                    {
                      type: 'url',
                      warningOnly: true,
                      message: 'Use a complete URL starting with https://',
                    },
                  ]}
                >
                  <Input
                    name="websiteUrl"
                    placeholder="https://example.com"
                    onBlur={(e) => {
                      const val = e.target.value.trim()
                      if (val && !/^https?:\/\//i.test(val)) {
                        antdForm.setFieldValue('websiteUrl', `https://${val}`)
                      }
                    }}
                  />
                </Form.Item>
              </label>
            </div>
          </section>
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Search &amp; homepage</h2>
            <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <label>
                SEO title
                <Form.Item name="seoTitleEn"><Input name="seoTitleEn" placeholder="Kuwait Towers" /></Form.Item>
              </label>
              <label>
                Home display order
                <Form.Item name="featured_order"><Input name="featured_order" type="number" min={0} max={9999} /></Form.Item>
              </label>
              <div className="full tw:col-span-full">
                <Checkbox
                    name="featured"
                    defaultChecked={
                      form
                        ? form.featured === 'on'
                        : Boolean(place && place.featured_order !== null)
                    }
                  >Feature this venue on the homepage</Checkbox>
              </div>
              <label className="full tw:col-span-full">
                SEO description
                <Form.Item name="seoDescriptionEn"><Input.TextArea name="seoDescriptionEn" rows={2} /></Form.Item>
              </label>
            </div>
          </section>
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Gallery</h2>
            {gallery.length > 0 && (
              <div className="gallery-editor tw:[margin-top:16px] tw:max-[900px]:[grid-template-columns:1fr] tw:[display:grid] tw:[grid-template-columns:repeat(2,_minmax(0,_1fr))] tw:[gap:var(--space-4)] tw:[margin-bottom:var(--space-5)]">
                {gallery.map((image, index) => (
                  <article
                    className="gallery-item tw:[background:var(--surface-subtle)] tw:[border:1px_solid_var(--line)] tw:[border-radius:var(--radius-sm)] tw:[padding:var(--space-3)] tw:[display:flex] tw:[flex-direction:column] tw:[gap:var(--space-3)]"
                    key={image.id}
                  >
                    {image.url && (
                      <img src={image.url} alt={image.alt_en || 'Gallery image'} loading="lazy" />
                    )}
                    <input type="hidden" name={`gallery[${index}][id]`} value={image.id} />
                    <div className="form-grid two tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
                      <label>
                        English alt
                        <Input
                          name={`gallery[${index}][altEn]`}
                          defaultValue={image.alt_en || ''}
                          maxLength={255}
                        />
                      </label>
                      <label>
                        Arabic alt
                        <Input
                          name={`gallery[${index}][altAr]`}
                          lang="ar"
                          dir="rtl"
                          defaultValue={image.alt_ar || ''}
                          maxLength={255}
                        />
                      </label>
                      <label>
                        English caption
                        <Input
                          name={`gallery[${index}][captionEn]`}
                          defaultValue={image.caption_en || ''}
                          maxLength={255}
                        />
                      </label>
                      <label>
                        Arabic caption
                        <Input
                          name={`gallery[${index}][captionAr]`}
                          lang="ar"
                          dir="rtl"
                          defaultValue={image.caption_ar || ''}
                          maxLength={255}
                        />
                      </label>
                      <label>
                        Order
                        <Input
                          name={`gallery[${index}][sortOrder]`}
                          type="number"
                          min={0}
                          max={999}
                          defaultValue={image.sort_order}
                        />
                      </label>
                      <Checkbox name={`gallery[${index}][remove]`}>Remove</Checkbox>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="form-grid tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4">
              <ImageUpload
                name="galleryImages[]"
                label="Add gallery images"
                multiple
                maxFiles={maxUploads}
              />
              <label>
                Alt text for new images
                <Input
                  name="galleryAltEn"
                  defaultValue={value('galleryAltEn', '')}
                  maxLength={255}
                  placeholder="Kuwait Towers view"
                />
              </label>
            </div>
          </section>
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Explore &amp; weekly schedule</h2>
            {place ? (
              <div className="tw:[margin-top:16px]">
                <a className="button secondary" href={`/admin/places/${place.id}/explore`}>
                  Open Explore features &amp; hours editor
                </a>
              </div>
            ) : (
              <p className="tw:[margin-top:12px] tw:[color:var(--muted)] tw:[font-size:13px]">
                Save this place first to configure its Explore amenities and weekly hours.
              </p>
            )}
            <details className="tw:[margin-top:20px] tw:[border-top:1px_solid_var(--line)] tw:[padding-top:16px]">
              <summary>Raw hours JSON</summary>
              <label>
                Structured weekly hours JSON
                <Input.TextArea
                  name="hoursJson"
                  rows={5}
                  spellCheck={false}
                  className="code-field"
                  defaultValue={value('hoursJson', hoursJson)}
                />
              </label>
            </details>
          </section>
        </div>
        <aside className="editor-aside tw:sticky tw:top-[76px] tw:flex tw:flex-col tw:max-[1024px]:static">
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Cover image</h2>
            <div className="tw:[margin-top:12px]">
              {coverUrl ? (
                <img
                  className="cover-preview tw:[width:100%] tw:[max-height:220px] tw:[object-fit:cover] tw:[border-radius:var(--radius-sm)] tw:[border:1px_solid_var(--line)] tw:[background:var(--ivory)]"
                  src={coverUrl}
                  alt="Current cover"
                />
              ) : (
                <div className="cover-placeholder tw:[width:100%] tw:[height:140px] tw:[display:grid] tw:[place-items:center] tw:[background:var(--surface-subtle)] tw:[border:1.5px_dashed_var(--line-strong)] tw:[border-radius:var(--radius-sm)] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:500]">
                  No cover image uploaded
                </div>
              )}
              <div className="tw:[margin-top:12px]">
                <ImageUpload
                  name="coverImage"
                  label={coverUrl ? 'Replace cover' : 'Upload cover'}
                />
              </div>
              {coverUrl && place?.status !== 'published' && (
                <Checkbox className="tw:mt-3"
                    name="removeCover"
                    defaultChecked={form?.removeCover === 'on'}
                  >Remove cover image</Checkbox>
              )}
            </div>
          </section>
        </aside>
      </Form>
      {place && (
        <section className="panel danger-zone-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:[border-color:var(--danger-border)] tw:[background:#fdfaf9] tw:[padding:var(--space-5)_var(--space-6)] tw:[margin-top:var(--space-8)]">
          <h2>Danger zone</h2>
          <div className="danger-zone-actions tw:[display:flex] tw:[align-items:center] tw:[flex-wrap:wrap] tw:[gap:var(--space-4)] tw:[margin-top:var(--space-4)]">
            <a
              className="button secondary"
              href={`/admin/places/${place.id}/preview`}
              target="_blank"
              rel="noreferrer"
            >
              Preview
            </a>
            {place.status === 'published' && (
              <form action={`/admin/places/${place.id}/archive`} method="POST">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <button className="button secondary" type="submit">
                  Archive place
                </button>
              </form>
            )}
            <button className="button danger" type="button" onClick={() => setConfirmDelete(true)}>
              Delete permanently
            </button>
          </div>
        </section>
      )}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete place"
        message="Permanently delete this place?"
        action={place ? `/admin/places/${place.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
