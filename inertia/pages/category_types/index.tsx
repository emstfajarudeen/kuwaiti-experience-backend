import { useState } from 'react'
import { RowEditLink } from '../../components/read_only'
import { useAuthorization } from '../../lib/authorization'
import AdminLayout from '../../layouts/admin_layout'
import RowActionMenu from '../../components/row_action_menu'
import ConfirmModal from '../../components/confirm_modal'
import { Table } from 'antd'
import TableToolbar, { useLocalFilters } from '../../components/table_toolbar'

type CategoryType = {
  code: string
  name_en: string
  name_ar: string | null
  sort_order: number
  imageUrl: string | null
}
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  rows: CategoryType[]
}

export default function CategoryTypesIndex({ adminName, csrfToken, success, error, rows }: Props) {
  const { can } = useAuthorization()
  const [deleting, setDeleting] = useState<CategoryType | null>(null)
  const filters = useLocalFilters({ q: '' })
  const needle = filters.values.q.trim().toLocaleLowerCase()
  const visibleRows = needle
    ? rows.filter((row) =>
        [row.code, row.name_en, row.name_ar ?? ''].some((v) =>
          v.toLocaleLowerCase().includes(needle)
        )
      )
    : rows
  return (
    <AdminLayout
      title="Category types"
      active="category-types"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Category types</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:overflow-hidden tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>Category types ({rows.length})</h2>
          <a className="button primary" href="/admin/category-types/new">
            + Add category type
          </a>
        </div>
        <TableToolbar
          search={{
            label: 'Search category types',
            placeholder: 'Search name or code',
            value: filters.values.q,
            onChange: (value) => filters.set('q', value),
          }}
          active={filters.active}
          onReset={filters.reset}
        />
        {rows.length ? (
          <div className="table-scroll">
            <Table<CategoryType>
              rowKey="code"
              pagination={false}
              dataSource={visibleRows}
              locale={{ emptyText: 'No category types match these filters.' }}
              columns={[
                {
                  title: can('category_types.update') ? 'Edit' : 'View',
                  key: 'edit',
                  width: 64,
                  render: (_: unknown, row: CategoryType) => (
                    <RowEditLink
                      href={`/admin/category-types/${encodeURIComponent(row.code)}/edit`}
                      label={row.name_en}
                      canEdit={can('category_types.update')}
                    />
                  ),
                },
                {
                  title: 'Type',
                  key: 'type',
                  render: (_: unknown, row) => (
                    <div className="tw:flex tw:items-center tw:gap-3">
                      {row.imageUrl && (
                        <img
                          src={row.imageUrl}
                          alt={row.name_en}
                          className="tw:size-11 tw:rounded-cms-sm tw:object-cover"
                        />
                      )}
                      <div>
                        <strong>{row.name_en}</strong>
                        <small className="tw:block">
                          <code>{row.code}</code>
                        </small>
                      </div>
                    </div>
                  ),
                },
                {
                  title: 'Arabic name',
                  dataIndex: 'name_ar',
                  render: (name: string | null) => <span dir="rtl">{name || '—'}</span>,
                },
                { title: 'Display order', dataIndex: 'sort_order' },
                {
                  title: 'Actions',
                  key: 'actions',
                  render: (_: unknown, row) => (
                    <RowActionMenu
                      label={`More actions for ${row.name_en}`}
                      actions={[{ label: 'Delete', danger: true, onClick: () => setDeleting(row) }]}
                    />
                  ),
                },
              ]}
            />
          </div>
        ) : (
          <div className="empty-state tw:[padding:var(--space-10)_var(--space-6)] tw:[text-align:center] tw:[color:var(--muted)] tw:[display:flex] tw:[flex-direction:column] tw:[align-items:center] tw:[gap:var(--space-3)]">
            <p>No category types configured.</p>
            <a href="/admin/category-types/new">Create category type</a>
          </div>
        )}
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete category type"
        message={`Are you sure you want to delete category type "${deleting?.name_en ?? ''}"? Any categories under this type should be reassigned first.`}
        action={deleting ? `/admin/category-types/${encodeURIComponent(deleting.code)}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
