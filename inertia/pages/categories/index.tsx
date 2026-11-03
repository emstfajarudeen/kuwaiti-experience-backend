import { useState } from 'react'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import AdminLayout from '../../layouts/admin_layout'
import { Table } from 'antd'
import TableToolbar, { useLocalFilters } from '../../components/table_toolbar'
import { useAuthorization } from '../../lib/authorization'

type Category = {
  id: number
  type: string
  slug: string
  active: boolean
  sort_order: number
  name_en: string | null
  name_ar: string | null
  type_image_key: string | null
  type_name_en: string | null
}

type CategoryType = { code: string; name_en: string }

type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  selectedType: string
  types: CategoryType[]
  rows: Category[]
}

export default function CategoryIndex({
  adminName,
  csrfToken,
  success,
  error,
  selectedType,
  types,
  rows,
}: Props) {
  const { can } = useAuthorization()
  const [deleting, setDeleting] = useState<Category | null>(null)
  const filters = useLocalFilters({ q: '', type: '' }, { q: '', type: selectedType })
  const needle = filters.values.q.trim().toLocaleLowerCase()
  const visibleRows = rows.filter(
    (row) =>
      (!filters.values.type || row.type === filters.values.type) &&
      (!needle ||
        [row.name_en ?? '', row.name_ar ?? '', row.slug].some((v) =>
          v.toLocaleLowerCase().includes(needle)
        ))
  )
  const categoryName = (category: Category) => category.name_en || category.slug

  return (
    <AdminLayout
      title="Categories"
      active="categories"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div>
          <h1>Categories</h1>
        </div>
      </div>

      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:overflow-hidden tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>Categories ({visibleRows.length})</h2>
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
            {can('category_types.view') && (
              <a className="button secondary" href="/admin/category-types">
                Category types
              </a>
            )}
            {can('categories.create') && (
              <a className="button primary" href="/admin/categories/new">
                + Add category
              </a>
            )}
          </div>
        </div>
        <TableToolbar
          search={{
            label: 'Search categories',
            placeholder: 'Search name or slug',
            value: filters.values.q,
            onChange: (value) => filters.set('q', value),
          }}
          selects={[
            {
              key: 'type',
              value: filters.values.type,
              placeholder: 'All category types',
              onChange: (value) => filters.set('type', value),
              options: types.map((type) => ({ value: type.code, label: type.name_en })),
            },
          ]}
          active={filters.active}
          onReset={filters.reset}
        />
        {visibleRows.length > 0 ? (
          <div className="table-scroll">
            <Table<Category>
              rowKey="id"
              pagination={false}
              dataSource={visibleRows}
              columns={[
                ...(can('categories.update')
                  ? [
                      {
                        title: 'Edit',
                        key: 'edit',
                        width: 64,
                        render: (_: unknown, row: Category) => (
                          <a
                            href={`/admin/categories/${row.id}/edit`}
                            className="action-pencil-btn"
                            aria-label={`Edit ${categoryName(row)}`}
                          >
                            ✎
                          </a>
                        ),
                      },
                    ]
                  : []),
                {
                  title: 'Category',
                  key: 'category',
                  render: (_: unknown, row) => (
                    <>
                      <strong>{categoryName(row)}</strong>
                      <div className="tw:text-xs tw:text-brand-ink-secondary">{row.slug}</div>
                    </>
                  ),
                },
                {
                  title: 'Arabic name',
                  dataIndex: 'name_ar',
                  render: (name: string | null) => <span dir="rtl">{name || '—'}</span>,
                },
                {
                  title: 'Place type',
                  key: 'type',
                  render: (_: unknown, row) => (
                    <span className="type-pill">
                      {row.type_name_en || row.type.replace('_', ' ')}
                    </span>
                  ),
                },
                {
                  title: 'Visibility',
                  key: 'active',
                  render: (_: unknown, row) => (
                    <span className={`status ${row.active ? 'published' : 'draft'}`}>
                      {row.active ? 'Active' : 'Hidden'}
                    </span>
                  ),
                },
                { title: 'Order', dataIndex: 'sort_order' },
                ...(can('categories.delete')
                  ? [
                      {
                        title: 'Actions',
                        key: 'actions',
                        render: (_: unknown, row: Category) => (
                          <RowActionMenu
                            label={`More actions for ${categoryName(row)}`}
                            actions={[
                              { label: 'Delete', danger: true, onClick: () => setDeleting(row) },
                            ]}
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        ) : (
          <div className="empty-state tw:[padding:var(--space-10)_var(--space-6)] tw:[text-align:center] tw:[color:var(--muted)] tw:[display:flex] tw:[flex-direction:column] tw:[align-items:center] tw:[gap:var(--space-3)]">
            <p>{rows.length ? 'No categories match these filters.' : 'No categories found.'}</p>
            {can('categories.create') && <a href="/admin/categories/new">Create category</a>}
          </div>
        )}
      </section>

      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete category"
        message={`Delete category "${deleting ? categoryName(deleting) : ''}"? Places assigned to it will become uncategorized.`}
        action={deleting ? `/admin/categories/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
