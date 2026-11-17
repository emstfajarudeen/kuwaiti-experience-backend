import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Select, Switch } from 'antd'
import { router, usePage } from '@inertiajs/react'
import RequiredMark from '../../components/required_mark'
import ConfirmModal from '../../components/confirm_modal'
import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import OpenMapAddressSearch from '../../components/open_map_address_search'
import { useAuthorization } from '../../lib/authorization'
import { postCmsForm } from '../../lib/cms_form'
import { processingLabel } from '../../components/video_processing'

type Option = { id: number; name: string }
type PlaceOption = {
  id: number
  title: string
  category_id: number | null
  phone: string | null
  latitude: number | null
  longitude: number | null
  address: string | null
}
type Video = {
  id: number
  caption_en: string
  caption_ar: string | null
  status: string
  category_id: number | null
  place_id: number | null
  phone: string | null
  location_name_en: string | null
  location_name_ar: string | null
  latitude: number | null
  longitude: number | null
  video_url: string | null
  thumbnail_url: string | null
  size_bytes: number
  processing_status: string
  processing_error: string | null
  width: number | null
  height: number | null
  duration_ms: number | null
  likes: number
  comments: number
  shares: number
  saves: number
}
type Comment = {
  id: number
  body: string
  status: string
  like_count: number
  author: string
  created_at: string | null
}
type Props = {
  adminName: string
  csrfToken: string
  success?: string | null
  error?: string | null
  video: Video | null
  form: Record<string, string> | null
  options: { categories: Option[]; places: PlaceOption[] }
  maxVideoMb: number
  comments: Comment[]
}

function FieldError({ message, name }: { message?: string; name: string }) {
  if (!message) return null
  return (
    <p className="field-error" role="alert" data-field-error={name}>
      {message}
    </p>
  )
}

// The form uses plain inputs, so there is no Ant Design form instance to update.
const noForm = { setFields: () => undefined } as never

const field = (form: Record<string, string> | null, key: string, fallback: unknown) =>
  form && form[key] !== undefined
    ? String(form[key])
    : fallback === null || fallback === undefined
      ? ''
      : String(fallback)

export default function VideoEdit({
  adminName,
  csrfToken,
  success,
  error,
  video,
  form,
  options,
  maxVideoMb,
  comments,
}: Props) {
  const { can } = useAuthorization()
  const formRef = useRef<HTMLFormElement>(null)
  const [processing, setProcessing] = useState(false)
  const [categoryId, setCategoryId] = useState<number | undefined>(
    form?.categoryId ? Number(form.categoryId) : (video?.category_id ?? undefined)
  )
  const [placeId, setPlaceId] = useState<number | undefined>(
    form?.placeId ? Number(form.placeId) : (video?.place_id ?? undefined)
  )
  const fileInput = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<{ name: string; size: number; url: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [locationName, setLocationName] = useState(
    field(form, 'locationNameEn', video?.location_name_en)
  )
  const [latitude, setLatitude] = useState<number | null>(() => {
    const value = field(form, 'latitude', video?.latitude)
    return value !== '' && Number.isFinite(Number(value)) ? Number(value) : null
  })
  const [longitude, setLongitude] = useState<number | null>(() => {
    const value = field(form, 'longitude', video?.longitude)
    return value !== '' && Number.isFinite(Number(value)) ? Number(value) : null
  })
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const serverErrors = (
    usePage().props as unknown as { errors?: Record<string, string | string[]> }
  ).errors
  const errorFor = (name: string) => {
    if (localErrors[name]) return localErrors[name]
    const value = serverErrors?.[name]
    return Array.isArray(value) ? value[0] : value
  }
  const setFieldError = (name: string, message?: string) =>
    setLocalErrors((current) => {
      const next = { ...current }
      if (message) next[name] = message
      else delete next[name]
      return next
    })
  const errorSignature = JSON.stringify([serverErrors ?? {}, localErrors])
  useEffect(() => {
    if (errorSignature === '[{},{}]') return
    document
      .querySelector('[data-field-error]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [errorSignature])

  useEffect(
    () => () => {
      if (picked) URL.revokeObjectURL(picked.url)
    },
    [picked]
  )

  const chooseFile = (file: File | undefined) => {
    if (!file) return setPicked(null)
    if (!/^video\/(mp4|quicktime|webm)$/.test(file.type)) {
      setFieldError('video', 'Choose an MP4, MOV or WebM video.')
      return
    }
    if (file.size > maxVideoMb * 1024 * 1024) {
      setFieldError('video', `Videos must be ${maxVideoMb} MB or smaller.`)
      return
    }
    setFieldError('video')
    setPicked({ name: file.name, size: file.size, url: URL.createObjectURL(file) })
  }
  const clearFile = () => {
    if (fileInput.current) fileInput.current.value = ''
    setPicked(null)
  }

  const places = useMemo(
    () =>
      options.places.filter(
        (place) => !categoryId || !place.category_id || place.category_id === categoryId
      ),
    [options.places, categoryId]
  )
  const place = options.places.find((item) => item.id === placeId)
  const canPublish = can('videos.publish')
  const [active, setActive] = useState(video ? video.status === 'published' : canPublish)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const action = video ? `/admin/videos/${video.id}/save` : '/admin/videos'

  const submit = () => {
    const intent =
      !canPublish || active === (video?.status === 'published')
        ? 'save'
        : active
          ? 'publish'
          : 'unpublish'
    const element = formRef.current
    if (!element) return
    const data = new FormData(element)
    const caption = String(data.get('captionEn') ?? '').trim()
    const problems: Record<string, string> = {}
    if (caption.length < 2) problems.captionEn = 'Write a caption of at least 2 characters.'
    const file = data.get('video')
    if (!video && !(file instanceof File && file.size > 0))
      problems.video = 'Choose a video to upload.'
    const phone = String(data.get('phone') ?? '').trim()
    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone))
      problems.phone = 'Use international format, for example +96512345678.'
    setLocalErrors(problems)
    if (Object.keys(problems).length) return
    data.set('categoryId', categoryId ? String(categoryId) : '')
    data.set('placeId', placeId ? String(placeId) : '')
    data.set('intent', intent)
    if (!(file instanceof File && file.size > 0)) data.delete('video')
    postCmsForm({ action, csrfToken, form: noForm, setProcessing, data })
  }

  return (
    <AdminLayout
      title={video ? 'Edit video' : 'New video'}
      active="videos"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:inline-flex tw:mb-4" href="/admin/videos">
        ← Back to videos
      </a>
      <div className="page-head form-page-head tw:mb-6">
        <h1>{video ? 'Edit video' : 'New video'}</h1>
      </div>

      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        encType="multipart/form-data"
        noValidate
        className="editor-main panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-6 tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)]"
      >
        <section className="cms-form-section">
          <div className="place-details-heading">
            <h2>Video &amp; cover</h2>
            <label className="place-form-active-toggle tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold">
              <Switch
                aria-label="Video active"
                checked={active}
                onChange={setActive}
                disabled={processing || !canPublish}
              />
              {active ? 'Active' : 'Inactive'}
            </label>
          </div>
          <div className="video-picker">
            <div className="video-picker-main">
              <div className="video-picker-phone">
                {(picked?.url ?? video?.video_url) ? (
                  <video
                    key={picked?.url ?? video?.video_url}
                    src={picked?.url ?? video?.video_url ?? undefined}
                    controls
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <div className="video-picker-empty" aria-hidden="true">
                    <span>▶</span>
                    <small>9:16</small>
                  </div>
                )}
                {picked && <span className="video-picker-badge">New</span>}
              </div>
              <div
                className={`video-picker-drop${dragOver ? ' is-over' : ''}`}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes('Files')) {
                    event.preventDefault()
                    setDragOver(true)
                  }
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragOver(false)
                  const file = event.dataTransfer.files?.[0]
                  if (!file) return
                  if (fileInput.current) {
                    const transfer = new DataTransfer()
                    transfer.items.add(file)
                    fileInput.current.files = transfer.files
                  }
                  chooseFile(file)
                }}
              >
                <strong>
                  {picked ? 'New video selected' : video ? 'Current video' : 'Upload a video'}
                  {!video && <RequiredMark />}
                </strong>
                {picked ? (
                  <span className="video-picker-file">
                    {picked.name} · {(picked.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                ) : (
                  <span className="video-picker-file">
                    {video
                      ? `${(video.size_bytes / 1024 / 1024).toFixed(1)} MB${
                          video.width && video.height ? ` · ${video.width}×${video.height}` : ''
                        } · drop a file to replace it`
                      : 'Drag and drop a file here, or browse'}
                  </span>
                )}
                {video && !picked && processingLabel(video) && (
                  <span
                    role="status"
                    className={`tw:text-[12px] tw:font-semibold ${processingLabel(video)!.tone}`}
                  >
                    {processingLabel(video)!.text}
                  </span>
                )}
                <div className="video-picker-actions">
                  <button
                    type="button"
                    className="gallery-sorter-add-button"
                    onClick={() => fileInput.current?.click()}
                  >
                    {video || picked ? 'Replace video' : '+ Choose video'}
                  </button>
                  {picked && (
                    <button type="button" className="video-picker-link" onClick={clearFile}>
                      Remove selected
                    </button>
                  )}
                </div>
                <ul className="video-picker-rules">
                  <li>MP4, MOV or WebM</li>
                  <li>Up to {maxVideoMb} MB</li>
                  <li>Vertical 9:16 looks best</li>
                  <li>Converted automatically for phones (720×1280, 30 fps, H.264)</li>
                </ul>
                <input
                  ref={fileInput}
                  className="image-upload-native"
                  type="file"
                  name="video"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                />
                <FieldError name="video" message={errorFor('video')} />
              </div>
            </div>
            <div className="video-picker-cover">
              <span className="image-block-label">Cover image (optional)</span>
              <ImageUpload
                name="thumbnail"
                currentImageUrl={video?.thumbnail_url}
                currentImageAlt="Video cover"
                removeName="removeThumbnail"
              />
              <FieldError name="thumbnail" message={errorFor('thumbnail')} />
            </div>
          </div>
        </section>

        <section className="cms-form-section">
          <h2>Caption</h2>
          <div className="form-grid two tw:mt-4 tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
            <label>
              <span>
                Caption (English) <RequiredMark />
              </span>
              <textarea
                name="captionEn"
                rows={3}
                maxLength={1000}
                defaultValue={field(form, 'captionEn', video?.caption_en)}
                placeholder="Sunset over the iconic Kuwait Towers…"
                aria-invalid={Boolean(errorFor('captionEn'))}
                onChange={() => setFieldError('captionEn')}
              />
              <FieldError name="captionEn" message={errorFor('captionEn')} />
            </label>
            <label>
              Caption (Arabic)
              <textarea
                name="captionAr"
                rows={3}
                maxLength={1000}
                dir="rtl"
                lang="ar"
                defaultValue={field(form, 'captionAr', video?.caption_ar)}
                aria-invalid={Boolean(errorFor('captionAr'))}
              />
              <FieldError name="captionAr" message={errorFor('captionAr')} />
            </label>
          </div>
        </section>

        <section className="cms-form-section">
          <h2>Category &amp; business</h2>
          <p className="muted tw:mt-1">
            Both are optional. Without a business, the video is shown as{' '}
            <strong>thekuwaitiexperience</strong>.
          </p>
          <div className="form-grid two tw:mt-4 tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
            <label>
              Category
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="No category"
                value={categoryId}
                onChange={(value) => {
                  setCategoryId(value)
                  if (place && value && place.category_id && place.category_id !== value)
                    setPlaceId(undefined)
                }}
                options={options.categories.map((item) => ({ value: item.id, label: item.name }))}
                status={errorFor('categoryId') ? 'error' : undefined}
              />
              <FieldError name="categoryId" message={errorFor('categoryId')} />
            </label>
            <label>
              Business / place
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="thekuwaitiexperience (no business)"
                value={placeId}
                onChange={setPlaceId}
                options={places.map((item) => ({ value: item.id, label: item.title }))}
                status={errorFor('placeId') ? 'error' : undefined}
              />
              <FieldError name="placeId" message={errorFor('placeId')} />
            </label>
          </div>
        </section>

        <section className="cms-form-section">
          <h2>Call &amp; location</h2>
          <p className="muted tw:mt-1">
            {place
              ? 'Leave empty to use this business’s phone and location.'
              : 'Shown on the video as the call button and map location.'}
          </p>
          <div className="tw:mt-4 tw:grid tw:gap-4">
            <label>
              Phone number
              <input
                name="phone"
                inputMode="tel"
                placeholder={place?.phone ?? '+96512345678'}
                defaultValue={field(form, 'phone', video?.phone)}
                aria-invalid={Boolean(errorFor('phone'))}
                onChange={() => setFieldError('phone')}
              />
              <FieldError name="phone" message={errorFor('phone')} />
            </label>
            <div>
              <span className="tw:mb-1 tw:block tw:font-semibold">Location</span>
              <OpenMapAddressSearch
                name="locationNameEn"
                value={locationName}
                onChange={setLocationName}
                latitude={latitude}
                longitude={longitude}
                searchUrl="/admin/videos/address-search"
                reverseUrl="/admin/videos/address-reverse"
                onAddressEdited={() => {
                  setLatitude(null)
                  setLongitude(null)
                }}
                onPlaceSelected={(_, nextLatitude, nextLongitude) => {
                  setLatitude(nextLatitude)
                  setLongitude(nextLongitude)
                }}
              />
              {(latitude === null || longitude === null) && place?.latitude != null && (
                <p className="muted tw:mt-2">
                  No pin set. The app will use {place.title}’s location.
                </p>
              )}
              {latitude !== null && longitude !== null && (
                <button
                  type="button"
                  className="video-picker-link tw:mt-2"
                  onClick={() => {
                    setLatitude(null)
                    setLongitude(null)
                    setLocationName('')
                  }}
                >
                  Clear location
                </button>
              )}
            </div>
            <FieldError
              name="location"
              message={errorFor('locationNameEn') ?? errorFor('latitude') ?? errorFor('longitude')}
            />
            <label>
              Location name (Arabic)
              <input
                name="locationNameAr"
                dir="rtl"
                lang="ar"
                maxLength={200}
                defaultValue={field(form, 'locationNameAr', video?.location_name_ar)}
                aria-invalid={Boolean(errorFor('locationNameAr'))}
              />
              <FieldError name="locationNameAr" message={errorFor('locationNameAr')} />
            </label>
            <input type="hidden" name="latitude" value={latitude ?? ''} />
            <input type="hidden" name="longitude" value={longitude ?? ''} />
          </div>
        </section>

        {video && comments.length > 0 && (
          <section className="cms-form-section">
            <h2>Comments</h2>
            <ul className="video-comments">
              {comments.map((comment) => (
                <li key={comment.id} className={comment.status === 'hidden' ? 'is-hidden' : ''}>
                  <div>
                    <strong>{comment.author}</strong>
                    <span className="muted">
                      {' '}
                      · {comment.created_at
                        ? new Date(comment.created_at).toLocaleString()
                        : ''} · {comment.like_count} likes
                    </span>
                    <p>{comment.body}</p>
                  </div>
                  {can('videos.moderate') && (
                    <Button
                      size="small"
                      onClick={() =>
                        router.post(
                          `/admin/videos/comments/${comment.id}/status`,
                          {
                            status: comment.status === 'hidden' ? 'visible' : 'hidden',
                            _csrf: csrfToken,
                          },
                          { preserveScroll: true }
                        )
                      }
                    >
                      {comment.status === 'hidden' ? 'Restore' : 'Hide'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="cms-form-actions">
          {video && can('videos.delete') && (
            <Button
              danger
              className="cms-form-actions-start"
              onClick={() => setConfirmDelete(true)}
            >
              Delete permanently
            </Button>
          )}
          <Button href="/admin/videos">Cancel</Button>
          <Button type="primary" htmlType="submit" loading={processing}>
            {video
              ? active && video.status !== 'published' && canPublish
                ? 'Save and activate'
                : !active && video.status === 'published' && canPublish
                  ? 'Save and deactivate'
                  : 'Save changes'
              : active && canPublish
                ? 'Save and activate'
                : 'Save draft'}
          </Button>
        </div>
      </form>
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete video"
        message="Permanently delete this video? Its comments and reports are removed too."
        action={video ? `/admin/videos/${video.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
