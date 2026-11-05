import { useEffect, useState } from 'react'
import { Button, Checkbox, Form, Input, Switch, message } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import GallerySorter from '../../components/gallery_sorter'
import FormSelect from '../../components/form_select'
import RequiredMark from '../../components/required_mark'
import OpenMapAddressSearch from '../../components/open_map_address_search'
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
}: Props) {
  const [selectedType, setSelectedType] = useState(form?.type ?? place?.type ?? '')
  const [selectedCategory, setSelectedCategory] = useState(
    String(form?.categoryId ?? place?.category_id ?? '')
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [active, setActive] = useState(
    form?.intent === 'publish'
      ? true
      : form?.deactivate === '1'
        ? false
        : place
          ? place.status === 'published'
          : true
  )
  const [antdForm] = Form.useForm()
  const [cover, setCover] = useState({ hasFile: false, removed: Boolean(form?.removeCover === 'on') })
  const [coverError, setCoverError] = useState<string | null>(null)
  const hasCover = cover.hasFile || (Boolean(coverUrl) && !cover.removed)
  // A shared key makes repeated identical errors replace the previous toast instead of being skipped.
  const toastError = (content: string) => void message.error({ content, key: 'place-form-error' })
  useEffect(() => {
    if (error) toastError(error)
  }, [error])
  useEffect(() => {
    if (hasCover) setCoverError(null)
  }, [hasCover])
  const watchedLatitude = Form.useWatch('latitude', antdForm)
  const watchedLongitude = Form.useWatch('longitude', antdForm)
  const mapLatitude =
    watchedLatitude === '' || watchedLatitude == null || !Number.isFinite(Number(watchedLatitude))
      ? null
      : Number(watchedLatitude)
  const mapLongitude =
    watchedLongitude === '' ||
    watchedLongitude == null ||
    !Number.isFinite(Number(watchedLongitude))
      ? null
      : Number(watchedLongitude)
  const value = (key: string, fallback: string | number | null | undefined) =>
    form?.[key] ?? fallback ?? ''
  const matchedCategories = categories.filter(
    (category) => !selectedType || category.type === selectedType
  )
  const action = place ? `/admin/places/${place.id}/save` : '/admin/places'
  return (
    <AdminLayout
      title={place ? 'Edit business/place' : 'New business/place'}
      active="places"
      adminName={adminName}
      csrfToken={csrfToken}
    >
      <a
        className="back-link tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:600] tw:[margin-bottom:var(--space-3)] tw:[transition:color_0.15s_ease]"
        href="/admin/places"
      >
        ← Back to Business/Places
      </a>
      <div className="page-head form-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div className="tw:[display:flex] tw:[align-items:center] tw:[gap:12px] tw:[flex-wrap:wrap]">
          <h1>{place ? en?.title || 'Edit business/place' : 'Create a new business/place'}</h1>
        </div>
      </div>
      <Form
        id="cms-place-editor"
        component="form"
        form={antdForm}
        layout="vertical"
        initialValues={{
          type: selectedType,
          titleEn: value('titleEn', en?.title),
          slug: value('slug', place?.slug),
          addressEn: value('addressEn', en?.address),
          bodyEn: value('bodyEn', en?.body),
          titleAr: value('titleAr', ar?.title),
          addressAr: value('addressAr', ar?.address),
          bodyAr: value('bodyAr', ar?.body),
          latitude: value('latitude', place?.latitude),
          longitude: value('longitude', place?.longitude),
          websiteUrl: value('websiteUrl', place?.website_url),
          seoTitleEn: value('seoTitleEn', en?.seo_title),
          featured_order: value('featured_order', place?.featured_order ?? 0),
          seoDescriptionEn: value('seoDescriptionEn', en?.seo_description),
        }}
        onFinish={() => {
          if (!selectedType) {
            toastError('Select a place type.')
            return
          }
          if (active && !hasCover) {
            setCoverError('Add a cover image before activating this business/place.')
            toastError('Add a cover image before activating this business/place.')
            document.getElementById('coverImage-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            return
          }
          const element = document.getElementById('cms-place-editor') as HTMLFormElement | null
          if (element) {
            const data = new FormData(element)
            data.set('intent', active && place?.status !== 'published' ? 'publish' : 'save')
            data.set('deactivate', !active && place?.status === 'published' ? '1' : '0')
            postCmsForm({
              action,
              csrfToken,
              form: antdForm,
              setProcessing,
              data,
              onSuccess: (page) => {
                const flashed = page.props.error
                if (typeof flashed === 'string' && flashed) toastError(flashed)
              },
              onError: (errors) => {
                const firstMessage = Object.values(errors)[0]
                if (firstMessage) toastError(String(firstMessage))
                const firstField = Object.keys(errors)[0]
                if (firstField) antdForm.scrollToField(firstField, { focus: true })
              },
            })
          }
        }}
        onFinishFailed={({ errorFields }) => {
          const first = errorFields[0]
          if (!first) return
          toastError(first.errors[0] ?? 'Fix the highlighted fields.')
          if (active && !hasCover) setCoverError('Add a cover image before activating this business/place.')
          antdForm.scrollToField(first.name, { focus: true })
        }}
        action={action}
        method="POST"
        encType="multipart/form-data"
        noValidate
        className="editor-grid tw:grid tw:items-start tw:gap-4"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <div className="editor-main panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
          <section className="cms-form-section">
            <div className="place-details-heading">
              <h2>Place details</h2>
              <label className="place-form-active-toggle tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold">
                <Switch
                  aria-label="Place active"
                  checked={active}
                  onChange={setActive}
                  disabled={processing}
                />
                {active ? 'Active' : 'Inactive'}
              </label>
            </div>
            <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <label>
                <span>
                  Place type <RequiredMark />
                </span>
                <Form.Item
                  name="type"
                  rules={[{ required: true, message: 'Select a place type.' }]}
                >
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
                </Form.Item>
              </label>
              <label>
                Category
                <FormSelect
                  name="categoryId"
                  value={selectedCategory}
                  placeholder="Uncategorized"
                  options={matchedCategories.map((category) => ({
                    value: String(category.id),
                    label: category.name_en || category.slug,
                  }))}
                  onChange={setSelectedCategory}
                />
              </label>
              <label>
                <span>
                  English title <RequiredMark />
                </span>
                <Form.Item
                  name="titleEn"
                  rules={[
                    { required: true, message: 'Enter an English title.' },
                    { max: 200, message: 'Title must be 200 characters or fewer.' },
                  ]}
                >
                  <Input name="titleEn" maxLength={200} placeholder="Kuwait Towers" />
                </Form.Item>
              </label>
              <label>
                <span>
                  URL slug <RequiredMark />
                </span>
                <Form.Item
                  name="slug"
                  rules={[
                    { required: true, message: 'Enter a URL slug.' },
                    {
                      pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
                      message: 'Use lowercase letters, numbers, and single hyphens.',
                    },
                    { max: 160, message: 'Slug must be 160 characters or fewer.' },
                  ]}
                >
                  <Input
                    name="slug"
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={160}
                    placeholder="kuwait-towers"
                  />
                </Form.Item>
              </label>
              <label className="full tw:col-span-full">
                <span>
                  Address <RequiredMark />
                </span>
                <Form.Item
                  name="addressEn"
                  rules={[
                    { required: true, message: 'Search for or enter an address.' },
                    { max: 300, message: 'Address must be 300 characters or fewer.' },
                  ]}
                >
                  <OpenMapAddressSearch
                    latitude={mapLatitude}
                    longitude={mapLongitude}
                    onAddressEdited={() => antdForm.setFieldsValue({ latitude: '', longitude: '' })}
                    onPlaceSelected={(_, latitude, longitude) =>
                      antdForm.setFieldsValue({
                        latitude: String(latitude),
                        longitude: String(longitude),
                      })
                    }
                  />
                </Form.Item>
              </label>
              <label className="full tw:col-span-full">
                About this place
                <Form.Item name="bodyEn">
                  <Input.TextArea
                    name="bodyEn"
                    rows={7}
                    maxLength={30000}
                    placeholder="Detailed description..."
                  />
                </Form.Item>
              </label>
              {/* Coordinates come from the map. */}
              {['latitude', 'longitude'].map(
                (name) => (
                  <Form.Item key={name} name={name} hidden>
                    <Input name={name} />
                  </Form.Item>
                )
              )}
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
          <section className="cms-form-section">
            <h2>Images</h2>
            <div className="image-block">
              <span className="image-block-label">
                Cover image {active && <RequiredMark />}
              </span>
              <ImageUpload
                name="coverImage"
                currentImageUrl={coverUrl}
                currentImageAlt="Current cover"
                removeName="removeCover"
                initiallyRemoved={form?.removeCover === 'on'}
                allowRemove={place?.status !== 'published' || !active}
                disabledRemoveReason="Deactivate this place before removing its cover image."
                invalid={Boolean(coverError)}
                errorMessage={coverError}
                onStateChange={setCover}
              />
            </div>
            <div className="image-block">
              <GallerySorter images={gallery} maxFiles={maxUploads} />
            </div>
          </section>
          <section className="cms-form-section">
            <h2>Arabic translation</h2>
            <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <label>
                Arabic title
                <Form.Item name="titleAr">
                  <Input name="titleAr" lang="ar" dir="rtl" placeholder="أبراج الكويت" />
                </Form.Item>
              </label>
              <label>
                Arabic address
                <Form.Item name="addressAr">
                  <Input
                    name="addressAr"
                    lang="ar"
                    dir="rtl"
                    placeholder="شارع الخليج العربي، الشرق"
                  />
                </Form.Item>
              </label>
              <label className="full tw:col-span-full">
                Arabic body
                <Form.Item name="bodyAr">
                  <Input.TextArea name="bodyAr" lang="ar" dir="rtl" rows={5} />
                </Form.Item>
              </label>
            </div>
          </section>
          <section className="cms-form-section">
            <h2>Search &amp; homepage</h2>
            <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <label>
                SEO title
                <Form.Item name="seoTitleEn">
                  <Input name="seoTitleEn" placeholder="Kuwait Towers" />
                </Form.Item>
              </label>
              <label>
                Home display order
                <Form.Item name="featured_order">
                  <Input name="featured_order" type="number" min={0} max={9999} />
                </Form.Item>
              </label>
              <div className="full tw:col-span-full">
                <Checkbox
                  name="featured"
                  defaultChecked={
                    form ? form.featured === 'on' : Boolean(place && place.featured_order !== null)
                  }
                >
                  Feature this venue on the homepage
                </Checkbox>
              </div>
              <label className="full tw:col-span-full">
                SEO description
                <Form.Item name="seoDescriptionEn">
                  <Input.TextArea name="seoDescriptionEn" rows={2} />
                </Form.Item>
              </label>
            </div>
          </section>
          <div className="cms-form-actions">
            {place && (
              <Button
                danger
                className="cms-form-actions-start"
                onClick={() => setConfirmDelete(true)}
              >
                Delete permanently
              </Button>
            )}
            <Button href="/admin/places">Cancel</Button>
            <Button type="primary" htmlType="submit" loading={processing}>
              {active
                ? place?.status === 'published'
                  ? 'Save changes'
                  : 'Save and activate'
                : place?.status === 'published'
                  ? 'Save and deactivate'
                  : place
                    ? 'Save changes'
                    : 'Save draft'}
            </Button>
          </div>
        </div>
      </Form>
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
