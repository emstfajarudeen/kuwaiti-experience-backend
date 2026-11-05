import AdminLayout from '../../layouts/admin_layout'
import { useAuthorization } from '../../lib/authorization'
import { Table } from 'antd'
import TableToolbar, { useLocalFilters } from '../../components/table_toolbar'

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
  const filters = useLocalFilters({ q: '' })
  const needle = filters.values.q.trim().toLocaleLowerCase()
  const visibleRows = rows.filter(
    (row) =>
      !needle || [row.title ?? '', row.slug].some((v) => v.toLocaleLowerCase().includes(needle))
  )
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
        </div>
        <TableToolbar
          search={{
            label: 'Search pages',
            placeholder: 'Search title or URL',
            value: filters.values.q,
            onChange: (value) => filters.set('q', value),
          }}
          active={filters.active}
          onReset={filters.reset}
        />
        {rows.length ? (
          <div className="table-scroll">
            <Table<PageRow>
              rowKey="id"
              pagination={false}
              dataSource={visibleRows}
              locale={{ emptyText: 'No pages match these filters.' }}
              columns={[
                ...(can('pages.update')
                  ? [
                      {
                        title: 'Edit',
                        key: 'edit',
                        width: 64,
                        render: (_: unknown, row: PageRow) => (
                          <a
                            href={`/admin/pages/${row.id}/edit`}
                            className="action-pencil-btn"
                            aria-label={`Edit ${row.title || 'page'}`}
                          >
                            ✎
                          </a>
                        ),
                      },
                    ]
                  : []),
                {
                  title: 'Page Title',
                  dataIndex: 'title',
                  render: (title: string | null) => <strong>{title || 'Untitled page'}</strong>,
                },
                {
                  title: 'Public URL',
                  dataIndex: 'slug',
                  render: (slug: string) => (
                    <a
                      href={`${publicSiteUrl.replace(/\/$/, '')}/${encodeURIComponent(slug)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <code>/{slug}</code>
                    </a>
                  ),
                },
              ]}
            />
          </div>
        ) : (
          <div className="empty-state tw:[padding:var(--space-10)_var(--space-6)] tw:[text-align:center] tw:[color:var(--muted)] tw:[display:flex] tw:[flex-direction:column] tw:[align-items:center] tw:[gap:var(--space-3)]">
            <p>No content pages yet.</p>
          </div>
        )}
      </section>
    </AdminLayout>
  )
}
