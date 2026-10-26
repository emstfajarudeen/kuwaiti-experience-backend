import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import RowActionMenu from '../../components/row_action_menu'
import ConfirmModal from '../../components/confirm_modal'
import { Table } from 'antd'
type Movie = {
  id: number
  title_en: string
  title_ar: string | null
  status: string
  duration_minutes: number | null
}
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  result: { data: Movie[]; meta: { total: number; page: number; lastPage: number } }
}
export default function Movies({ adminName, csrfToken, success, error, result }: Props) {
  const [deleting, setDeleting] = useState<Movie | null>(null)
  return (
    <AdminLayout
      title="Movies"
      active="movies"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Movies</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:overflow-hidden tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>Movies ({result.meta.total})</h2>
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
            <a className="button secondary" href="/admin/showtimes">Showtimes</a>
            <a className="button primary" href="/admin/movies/new">+ Add movie</a>
          </div>
        </div>
        {result.data.length ? (
          <>
            <div className="table-scroll tw:overflow-x-auto">
              <Table<Movie> rowKey="id" pagination={false} scroll={{ x: 700 }} dataSource={result.data} columns={[
                { title: 'Edit', key: 'edit', render: (_: unknown, row) => <a href={`/admin/movies/${row.id}/edit`} className="action-pencil-btn" aria-label={`Edit ${row.title_en}`}>✎</a> },
                { title: 'Title', key: 'title', render: (_: unknown, row) => <div><strong>{row.title_en}</strong>{row.title_ar && <small className="tw:block" dir="rtl">{row.title_ar}</small>}</div> },
                { title: 'Status', dataIndex: 'status', render: (status: string) => <span className={`status ${status}`}>{status}</span> },
                { title: 'Duration', dataIndex: 'duration_minutes', render: (duration: number | null) => duration ? `${duration} min` : '—' },
                { title: 'Actions', key: 'actions', render: (_: unknown, row) => <RowActionMenu label={`More actions for ${row.title_en}`} actions={[{ label: 'Delete', danger: true, onClick: () => setDeleting(row) }]} /> },
              ]} />
            </div>
            {result.meta.lastPage > 1 && (
              <div className="pagination-bar tw:[display:flex] tw:[justify-content:space-between] tw:[align-items:center] tw:[flex-wrap:wrap] tw:[gap:var(--space-3)] tw:[padding:var(--space-4)_var(--space-6)] tw:[border-top:1px_solid_var(--line-subtle)] tw:[background:var(--surface)] tw:[font-size:13px] tw:[color:var(--muted)]">
                <span>
                  Page {result.meta.page} of {result.meta.lastPage}
                </span>
                <div className="pagination-nav">
                  {result.meta.page > 1 && (
                    <a
                      className="button secondary table-action"
                      href={`/admin/movies?page=${result.meta.page - 1}`}
                    >
                      Previous
                    </a>
                  )}
                  {result.meta.page < result.meta.lastPage && (
                    <a
                      className="button secondary table-action"
                      href={`/admin/movies?page=${result.meta.page + 1}`}
                    >
                      Next
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state tw:[padding:var(--space-10)_var(--space-6)] tw:[text-align:center] tw:[color:var(--muted)] tw:[display:flex] tw:[flex-direction:column] tw:[align-items:center] tw:[gap:var(--space-3)]">
            <p>No movies found.</p>
            <a href="/admin/movies/new">Create movie</a>
          </div>
        )}
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete movie"
        message={`Permanently delete movie "${deleting?.title_en ?? ''}"? Ensure no showtimes exist for it.`}
        action={deleting ? `/admin/movies/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
