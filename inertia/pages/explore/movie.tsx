import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import ConfirmModal from '../../components/confirm_modal'
import { Button, Form, Input, InputNumber, Select } from 'antd'
import { postCmsForm } from '../../lib/cms_form'
type Movie = {
  id: number
  title_en: string
  title_ar: string | null
  synopsis_en: string | null
  synopsis_ar: string | null
  duration_minutes: number | null
  age_rating: string | null
  status: string
}
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  movie: Movie | null
  posterUrl: string | null
}
export default function MovieEdit({
  adminName,
  csrfToken,
  success,
  error,
  form,
  movie,
  posterUrl,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [movieForm] = Form.useForm()
  const value = (key: string, fallback: string | number | null | undefined) =>
    form?.[key] ?? fallback ?? ''
  return (
    <AdminLayout
      title={movie ? 'Edit movie' : 'Add movie'}
      active="movies"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a
        className="back-link tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:600] tw:[margin-bottom:var(--space-3)] tw:[transition:color_0.15s_ease]"
        href="/admin/movies"
      >
        ← Back to movies
      </a>
      <div className="page-head form-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div className="tw:[display:flex] tw:[align-items:center] tw:[gap:12px] tw:[flex-wrap:wrap]">
          <h1>{movie ? value('title_en', movie.title_en) : 'Add movie'}</h1>
          {movie && (
            <span
              className={`status ${movie.status} tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:4px_10px] tw:[border-radius:var(--radius-full)] tw:[font-size:12px] tw:[font-weight:700] tw:[text-transform:capitalize] tw:[letter-spacing:0.02em] tw:[border:1px_solid_transparent] tw:[line-height:1.2]`}
            >
              {movie.status}
            </span>
          )}
        </div>
        <div className="form-page-actions"><Button className="button primary" htmlType="submit" form="cms-movie-editor" loading={processing}>Save {movie ? 'changes' : 'movie'}</Button></div>
      </div>
      <Form
        id="cms-movie-editor"
        component="form"
        form={movieForm}
        layout="vertical"
        initialValues={{ title_en: value('title_en', movie?.title_en), title_ar: value('title_ar', movie?.title_ar), synopsis_en: value('synopsis_en', movie?.synopsis_en), synopsis_ar: value('synopsis_ar', movie?.synopsis_ar), duration_minutes: value('duration_minutes', movie?.duration_minutes), age_rating: value('age_rating', movie?.age_rating), status: value('status', movie?.status ?? 'draft') }}
        onFinish={(values) => {
          const element = document.getElementById('cms-movie-editor') as HTMLFormElement | null
          if (!element) return
          const data = new FormData(element)
          for (const [key, value] of Object.entries(values)) data.set(key, String(value ?? ''))
          postCmsForm({ action: movie ? `/admin/movies/${movie.id}/save` : '/admin/movies', csrfToken, form: movieForm, setProcessing, data })
        }}
        action={movie ? `/admin/movies/${movie.id}/save` : '/admin/movies'}
        method="POST"
        encType="multipart/form-data"
        className="editor-grid tw:grid tw:items-start tw:gap-4"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <div className="editor-main tw:flex tw:flex-col">
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Details &amp; synopsis</h2>
            <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <Form.Item name="title_en" label="English title" rules={[{ required: true, message: 'Enter an English title.' }, { max: 200 }]}><Input name="title_en" maxLength={200} placeholder="Dune: Part Two" /></Form.Item>
              <Form.Item name="title_ar" label="Arabic title" rules={[{ max: 200 }]}><Input name="title_ar" maxLength={200} lang="ar" dir="rtl" placeholder="كثيب: الجزء الثاني" /></Form.Item>
              <Form.Item className="full tw:col-span-full" name="synopsis_en" label="English synopsis" rules={[{ max: 10000 }]}><Input.TextArea name="synopsis_en" rows={4} maxLength={10000} placeholder="Story description..." /></Form.Item>
              <Form.Item className="full tw:col-span-full" name="synopsis_ar" label="Arabic synopsis" rules={[{ max: 10000 }]}><Input.TextArea name="synopsis_ar" rows={4} maxLength={10000} lang="ar" dir="rtl" /></Form.Item>
              <Form.Item name="duration_minutes" label="Duration (minutes)" rules={[{ type: 'number', min: 1, max: 600 }]}><InputNumber name="duration_minutes" min={1} max={600} precision={0} className="tw:w-full" placeholder="120" /></Form.Item>
              <Form.Item name="age_rating" label="Age rating" rules={[{ max: 30 }]}><Input name="age_rating" maxLength={30} placeholder="PG-13 / 18+" /></Form.Item>
              <Form.Item className="full tw:col-span-full" name="status" label="Status"><Select options={['draft', 'published', 'archived'].map((status) => ({ value: status, label: status }))} /></Form.Item>
            </div>
          </section>
        </div>
        <aside className="editor-aside tw:sticky tw:top-[76px] tw:flex tw:flex-col tw:max-[1024px]:static">
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Movie poster</h2>
            <div className="tw:[margin-top:12px]">
              {posterUrl ? (
                <img
                  className="cover-preview tw:[aspect-ratio:2/3] tw:[object-fit:cover] tw:[max-height:280px] tw:[width:100%] tw:[max-height:220px] tw:[object-fit:cover] tw:[border-radius:var(--radius-sm)] tw:[border:1px_solid_var(--line)] tw:[background:var(--ivory)]"
                  src={posterUrl}
                  alt={`${movie?.title_en ?? ''} poster`}
                />
              ) : (
                <div className="cover-placeholder tw:[aspect-ratio:2/3] tw:[height:180px] tw:[width:100%] tw:[height:140px] tw:[display:grid] tw:[place-items:center] tw:[background:var(--surface-subtle)] tw:[border:1.5px_dashed_var(--line-strong)] tw:[border-radius:var(--radius-sm)] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:500]">
                  No poster uploaded
                </div>
              )}
              <div className="tw:[margin-top:12px]">
                <ImageUpload name="poster" label={posterUrl ? 'Replace poster' : 'Upload poster'} />
              </div>
              {posterUrl && (
                <label className="checkbox-line tw:[margin-top:10px] tw:[display:flex] tw:[flex-direction:row] tw:[align-items:center] tw:[gap:10px] tw:[font-size:14px] tw:[font-weight:500] tw:[color:var(--ink)] tw:[cursor:pointer] tw:[min-height:44px] tw:[user-select:none]">
                  <input
                    type="checkbox"
                    name="remove_poster"
                    defaultChecked={form?.remove_poster === 'on'}
                  />
                  Remove poster
                </label>
              )}
            </div>
          </section>
        </aside>
      </Form>
      {movie && (
        <section className="panel danger-zone-panel tw:[max-width:600px] tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:[border-color:var(--danger-border)] tw:[background:#fdfaf9] tw:[padding:var(--space-5)_var(--space-6)] tw:[margin-top:var(--space-8)]">
          <h2>Danger zone</h2>
          <div className="tw:[margin-top:14px]">
            <button className="button danger" type="button" onClick={() => setConfirmDelete(true)}>
              Delete movie
            </button>
          </div>
        </section>
      )}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete movie"
        message="Permanently delete this movie? Ensure no showtimes exist for it."
        action={movie ? `/admin/movies/${movie.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
