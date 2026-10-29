import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import RowActionMenu from '../../components/row_action_menu'
import { useAuthorization } from '../../lib/authorization'
import ConfirmModal from '../../components/confirm_modal'
import { Table } from 'antd'

type PageRow = { id: number; slug: string; status: string; title: string | null }
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  publicSiteUrl: string
  rows: PageRow[]
}
export default function PagesIndex({
  adminName,
  csrfToken,
  success,
  error,
  publicSiteUrl,
  rows,
}: Props) {
  const { can } = useAuthorization()
  const [deleting, setDeleting] = useState<PageRow | null>(null)
  return (
    <AdminLayout
      title="Pages"
      active="pages"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Pages</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:overflow-hidden tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>Pages ({rows.length})</h2>
          {can('pages.create') && <a className="button primary" href="/admin/pages/new">
            + Create page
          </a>}
        </div>
        {rows.length ? (
          <div className="table-scroll tw:overflow-x-auto"><Table<PageRow> rowKey="id" pagination={false} scroll={{ x: 700 }} dataSource={rows} columns={[
            ...(can('pages.update') ? [{ title: 'Edit', key: 'edit', width: 64, render: (_: unknown, row: PageRow) => <a href={`/admin/pages/${row.id}/edit`} className="action-pencil-btn" aria-label={`Edit ${row.title || 'page'}`}>✎</a> }] : []),
            { title: 'Page Title', dataIndex: 'title', render: (title: string | null) => <strong>{title || 'Untitled page'}</strong> },
            { title: 'Public URL', dataIndex: 'slug', render: (slug: string) => <a href={`${publicSiteUrl.replace(/\/$/, '')}/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer"><code>/{slug}</code></a> },
            { title: 'Status', dataIndex: 'status', render: (status: string) => <span className={`status ${status}`}>{status}</span> },
            ...(can('pages.delete') ? [{ title: 'Actions', key: 'actions', render: (_: unknown, row: PageRow) => <RowActionMenu label={`More actions for ${row.title || 'page'}`} actions={[...(row.status === 'published' ? [{ label: 'View page', href: `${publicSiteUrl.replace(/\/$/, '')}/${encodeURIComponent(row.slug)}`, target: '_blank' as const }] : []), { label: 'Delete', danger: true, onClick: () => setDeleting(row) }]} /> }] : []),
          ]} /></div>
        ) : (
          <div className="empty-state tw:[padding:var(--space-10)_var(--space-6)] tw:[text-align:center] tw:[color:var(--muted)] tw:[display:flex] tw:[flex-direction:column] tw:[align-items:center] tw:[gap:var(--space-3)]">
            <p>No content pages created yet.</p>
            {can('pages.create') && <a href="/admin/pages/new">Create page</a>}
          </div>
        )}
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete page"
        message={`Are you sure you want to permanently delete "${deleting?.title || deleting?.slug || ''}"?`}
        action={deleting ? `/admin/pages/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
