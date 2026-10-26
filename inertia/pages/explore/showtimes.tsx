import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import RowActionMenu from '../../components/row_action_menu'
import ConfirmModal from '../../components/confirm_modal'
import { Button, Form, Input, Select, Table } from 'antd'
import { postCmsForm } from '../../lib/cms_form'
type Showtime = {
  id: number
  movie_id: number
  place_id: number
  starts_at: string
  format: string
  status: string
}
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  result: {
    data: Showtime[]
    included: { movies: Array<{ id: number; title_en: string }> }
    meta: { total: number; page: number; lastPage: number }
  }
  theaters: Array<{ id: number; slug: string; status: string }>
  movies: Array<{ id: number; title_en: string; status: string }>
  editing: { id: number; place_id: number; movie_id: number; format: string; status: string } | null
  startsLocal: string
  filterPlaceId: string
}
export default function Showtimes({
  adminName,
  csrfToken,
  success,
  error,
  form,
  result,
  theaters,
  movies,
  editing,
  startsLocal,
  filterPlaceId,
}: Props) {
  const [deleting, setDeleting] = useState<Showtime | null>(null)
  const [processing, setProcessing] = useState(false)
  const [showtimeForm] = Form.useForm()
  const value = (key: string, fallback: string | number | null | undefined) =>
    form?.[key] ?? fallback ?? ''
  const pageUrl = (page: number) =>
    `/admin/showtimes?${new URLSearchParams({ page: String(page), ...(filterPlaceId ? { place_id: filterPlaceId } : {}) })}`
  return (
    <AdminLayout
      title="Theater showtimes"
      active="showtimes"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Theater showtimes</h1>
      </div>
      <div className="content-grid cms-form-workspace tw:grid tw:gap-4">
        <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
          <div className="panel-heading tw:[padding:0_0_16px] tw:[border-bottom:1px_solid_var(--line-subtle)] tw:[margin-bottom:16px] tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
            <h2>{editing ? 'Edit showtime' : 'Schedule showtime'}</h2>
            <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
              {editing && <a className="button secondary" href="/admin/showtimes">Cancel</a>}
              <Button className="button primary" htmlType="submit" form="cms-showtime-editor" loading={processing}>
                {editing ? 'Update showtime' : 'Save showtime'}
              </Button>
            </div>
          </div>
          <Form
            id="cms-showtime-editor"
            form={showtimeForm}
            layout="vertical"
            initialValues={{ place_id: value('place_id', editing?.place_id ?? ''), movie_id: value('movie_id', editing?.movie_id ?? ''), starts_at: value('starts_at', startsLocal), format: value('format', editing?.format), status: value('status', editing?.status ?? 'draft') }}
            onFinish={(values) => postCmsForm({ action: editing ? `/admin/showtimes/${editing.id}/save` : '/admin/showtimes', csrfToken, form: showtimeForm, setProcessing, data: { place_id: String(values.place_id), movie_id: String(values.movie_id), starts_at: values.starts_at, format: values.format, status: values.status } })}
            action={editing ? `/admin/showtimes/${editing.id}/save` : '/admin/showtimes'}
            method="POST"
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <div className="form-grid two tw:grid tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <Form.Item name="place_id" label="Theater venue" rules={[{ required: true, message: 'Choose a theater.' }]}><Select placeholder="Choose a theater" options={theaters.map((place) => ({ value: place.id, label: `${place.slug} (${place.status})` }))} /></Form.Item>
              <Form.Item name="movie_id" label="Movie" rules={[{ required: true, message: 'Choose a movie.' }]}><Select placeholder="Choose a movie" options={movies.map((movie) => ({ value: movie.id, label: `${movie.title_en} (${movie.status})` }))} /></Form.Item>
              <Form.Item name="starts_at" label="Starts at (Kuwait time)" rules={[{ required: true, message: 'Choose a start date and time.' }]}><Input type="datetime-local" /></Form.Item>
              <Form.Item name="format" label="Presentation format" rules={[{ required: true, message: 'Enter a presentation format.' }, { max: 80 }]}><Input maxLength={80} placeholder="IMAX · Standard" /></Form.Item>
              <Form.Item name="status" label="Status"><Select options={['draft', 'published', 'cancelled'].map((status) => ({ value: status, label: status }))} /></Form.Item>
            </div>
          </Form>
        </section>
        <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:overflow-hidden tw:p-0">
          <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
            <h2>Showtimes ({result.meta.total})</h2>
            <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
              <a className="button secondary" href="/admin/movies">Movies</a>
              <a className="button primary" href={editing ? '/admin/showtimes' : '#cms-showtime-editor'}>+ New showtime</a>
            </div>
          </div>
          {result.data.length ? (
            <>
              <div className="table-scroll tw:overflow-x-auto">
                <Table<Showtime> rowKey="id" pagination={false} scroll={{ x: 850 }} dataSource={result.data} columns={[
                  { title: 'Edit', key: 'edit', render: (_: unknown, row) => <a href={`/admin/showtimes/${row.id}/edit`} className="action-pencil-btn" aria-label="Edit showtime">✎</a> },
                  { title: 'Movie', key: 'movie', render: (_: unknown, row) => <strong>{result.included.movies.find((movie) => movie.id === row.movie_id)?.title_en || row.movie_id}</strong> },
                  { title: 'Theater', dataIndex: 'place_id', render: (id: number) => <code>{id}</code> },
                  { title: 'Starts (UTC)', dataIndex: 'starts_at' }, { title: 'Format', dataIndex: 'format' },
                  { title: 'Status', dataIndex: 'status', render: (status: string) => <span className={`status ${status === 'published' ? 'published' : status === 'cancelled' ? 'archived' : 'draft'}`}>{status}</span> },
                  { title: 'Actions', key: 'actions', render: (_: unknown, row) => <RowActionMenu label="More actions for showtime" actions={[{ label: 'Delete', danger: true, onClick: () => setDeleting(row) }]} /> },
                ]} />
              </div>
              {result.meta.lastPage > 1 && (
                <div className="pagination-bar tw:[display:flex] tw:[justify-content:space-between] tw:[align-items:center] tw:[flex-wrap:wrap] tw:[gap:var(--space-3)] tw:[padding:var(--space-4)_var(--space-6)] tw:[border-top:1px_solid_var(--line-subtle)] tw:[background:var(--surface)] tw:[font-size:13px] tw:[color:var(--muted)]">
                  <span>
                    Page {result.meta.page} of {result.meta.lastPage}
                  </span>
                  <div className="pagination-nav">
                    {result.meta.page > 1 && (
                      <a className="button secondary" href={pageUrl(result.meta.page - 1)}>
                        Previous
                      </a>
                    )}
                    {result.meta.page < result.meta.lastPage && (
                      <a className="button secondary" href={pageUrl(result.meta.page + 1)}>
                        Next
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state tw:[padding:var(--space-10)_var(--space-6)] tw:[text-align:center] tw:[color:var(--muted)] tw:[display:flex] tw:[flex-direction:column] tw:[align-items:center] tw:[gap:var(--space-3)]">
              <p>No showtimes scheduled.</p>
            </div>
          )}
        </section>
      </div>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete showtime"
        message="Are you sure you want to delete this showtime?"
        action={deleting ? `/admin/showtimes/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
