import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import RowActionMenu from '../../components/row_action_menu'
import ConfirmModal from '../../components/confirm_modal'
import { Table } from 'antd'
import { Input } from 'antd'
import FormSelect from '../../components/form_select'

type Place = {
  id: number
  type: string
  slug: string
  status: string
  coverUrl: string | null
  title: string
  type_name_en: string
  updated_at_local: string | null
}
type Pagination = {
  total: number
  page: number
  perPage: number
  lastPage: number
  hasPrev: boolean
  hasNext: boolean
  prevPage: number
  nextPage: number
}
type Filters = { q: string; type: string; status: string; sort: string }
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  rows: Place[]
  types: Array<{ code: string; name_en: string }>
  selectedType: string
  selectedStatus: string
  searchQuery: string
  selectedSort: string
  pagination: Pagination
  filters: Filters
}
export default function PlacesIndex({
  adminName,
  csrfToken,
  success,
  error,
  rows,
  types,
  selectedType,
  selectedStatus,
  searchQuery,
  selectedSort,
  pagination,
  filters,
}: Props) {
  const [deleting, setDeleting] = useState<Place | null>(null)
  const [typeFilter, setTypeFilter] = useState(selectedType)
  const [statusFilter, setStatusFilter] = useState(selectedStatus)
  const [sortFilter, setSortFilter] = useState(selectedSort)
  const pageUrl = (page: number) =>
    `/admin/places?${new URLSearchParams({ page: String(page), q: filters.q, type: filters.type, status: filters.status, sort: filters.sort })}`
  return (
    <AdminLayout
      title="Places"
      active="places"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Places</h1>
      </div>
      <form
        className="filter-bar cms-filter-grid panel tw:mb-5"
        action="/admin/places"
        method="GET"
      >
        <div className="filter-search">
          <label htmlFor="places-search">Search</label>
          <Input
            id="places-search"
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search places by name, slug or address..."
            aria-label="Search places"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="places-type-filter">Type:</label>
          <FormSelect id="places-type-filter" name="type" value={typeFilter} onChange={setTypeFilter} placeholder="All types" options={types.map((type) => ({ value: type.code, label: type.name_en }))} />
        </div>
        <div className="filter-group">
          <label htmlFor="places-status-filter">Status:</label>
          <FormSelect id="places-status-filter" name="status" value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" options={[{ value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }]} />
        </div>
        <div className="filter-group">
          <label htmlFor="places-sort-filter">Sort:</label>
          <FormSelect id="places-sort-filter" name="sort" value={sortFilter} required onChange={setSortFilter} options={[{ value: 'updated_desc', label: 'Recently edited' }, { value: 'updated_asc', label: 'Oldest edited' }, { value: 'title_asc', label: 'Title (A–Z)' }, { value: 'title_desc', label: 'Title (Z–A)' }, { value: 'status', label: 'Status' }]} />
        </div>
        <div className="filter-actions tw:[margin-left:auto] tw:[display:flex] tw:[align-items:center] tw:[gap:var(--space-2)]">
          <button type="submit" className="button secondary">
            Filter
          </button>
          {(searchQuery || selectedType || selectedStatus || selectedSort !== 'updated_desc') && (
            <a
              href="/admin/places"
              className="text-button tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:8px_12px] tw:[background:transparent] tw:[border:none] tw:[color:var(--navy)] tw:[font-size:14px] tw:[font-weight:600] tw:[cursor:pointer] tw:[border-radius:var(--radius-sm)] tw:[transition:all_0.15s_ease]"
            >
              Reset
            </a>
          )}
        </div>
      </form>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:overflow-hidden tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>
            {pagination.total
              ? `Showing ${(pagination.page - 1) * pagination.perPage + 1}–${Math.min(pagination.page * pagination.perPage, pagination.total)} of ${pagination.total} places`
              : '0 places found'}
          </h2>
          <a className="button primary" href="/admin/places/new">
            + Add place
          </a>
        </div>
        {rows.length ? (
          <>
            <div className="table-scroll tw:overflow-x-auto"><Table<Place> rowKey="id" pagination={false} scroll={{ x: 850 }} dataSource={rows} columns={[
              { title: 'Edit', key: 'edit', width: 64, render: (_: unknown, row) => <a href={`/admin/places/${row.id}/edit`} className="action-pencil-btn" aria-label={`Edit ${row.title}`}>✎</a> },
              { title: 'Place', key: 'place', render: (_: unknown, row) => <div className="place-cell tw:[display:flex] tw:[align-items:center] tw:[gap:var(--space-3)] tw:[min-width:220px]">{row.coverUrl ? <img src={row.coverUrl} alt="" loading="lazy" /> : <span className="thumb-empty" aria-hidden="true">K</span>}<div className="place-title-wrap"><strong>{row.title}</strong><small>/places/{row.slug}</small></div></div> },
              { title: 'Type', dataIndex: 'type_name_en', render: (name: string) => <span className="type-chip">{name}</span> },
              { title: 'Status', dataIndex: 'status', render: (status: string) => <span className={`status ${status}`}>{status}</span> },
              { title: 'Last Edit (Kuwait)', dataIndex: 'updated_at_local', render: (value: string | null) => value || '—' },
              { title: 'Actions', key: 'actions', render: (_: unknown, row) => <RowActionMenu label={`More actions for ${row.title}`} actions={[{ label: 'Preview', href: `/admin/places/${row.id}/preview`, target: '_blank' }, { label: 'Delete', danger: true, onClick: () => setDeleting(row) }]} /> },
            ]} /></div>
            <div className="pagination-bar tw:[display:flex] tw:[justify-content:space-between] tw:[align-items:center] tw:[flex-wrap:wrap] tw:[gap:var(--space-3)] tw:[padding:var(--space-4)_var(--space-6)] tw:[border-top:1px_solid_var(--line-subtle)] tw:[background:var(--surface)] tw:[font-size:13px] tw:[color:var(--muted)]">
              <span>
                Page {pagination.page} of {pagination.lastPage} ({pagination.total} total places)
              </span>
              <div className="pagination-links tw:[display:flex] tw:[align-items:center] tw:[gap:6px]">
                {pagination.hasPrev ? (
                  <a
                    className="pagination-btn tw:[display:inline-flex] tw:[align-items:center] tw:[justify-content:center] tw:[min-width:36px] tw:[height:36px] tw:[padding:0_10px] tw:[border-radius:var(--radius-sm)] tw:[border:1px_solid_var(--line)] tw:[background:var(--surface)] tw:[color:var(--ink)] tw:[font-size:13px] tw:[font-weight:600] tw:[transition:all_0.15s_ease]"
                    href={pageUrl(pagination.prevPage)}
                    aria-label="Previous page"
                  >
                    ← Previous
                  </a>
                ) : (
                  <button
                    className="pagination-btn tw:[display:inline-flex] tw:[align-items:center] tw:[justify-content:center] tw:[min-width:36px] tw:[height:36px] tw:[padding:0_10px] tw:[border-radius:var(--radius-sm)] tw:[border:1px_solid_var(--line)] tw:[background:var(--surface)] tw:[color:var(--ink)] tw:[font-size:13px] tw:[font-weight:600] tw:[transition:all_0.15s_ease]"
                    disabled
                  >
                    ← Previous
                  </button>
                )}
                {pagination.hasNext ? (
                  <a
                    className="pagination-btn tw:[display:inline-flex] tw:[align-items:center] tw:[justify-content:center] tw:[min-width:36px] tw:[height:36px] tw:[padding:0_10px] tw:[border-radius:var(--radius-sm)] tw:[border:1px_solid_var(--line)] tw:[background:var(--surface)] tw:[color:var(--ink)] tw:[font-size:13px] tw:[font-weight:600] tw:[transition:all_0.15s_ease]"
                    href={pageUrl(pagination.nextPage)}
                    aria-label="Next page"
                  >
                    Next →
                  </a>
                ) : (
                  <button
                    className="pagination-btn tw:[display:inline-flex] tw:[align-items:center] tw:[justify-content:center] tw:[min-width:36px] tw:[height:36px] tw:[padding:0_10px] tw:[border-radius:var(--radius-sm)] tw:[border:1px_solid_var(--line)] tw:[background:var(--surface)] tw:[color:var(--ink)] tw:[font-size:13px] tw:[font-weight:600] tw:[transition:all_0.15s_ease]"
                    disabled
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state tw:[padding:var(--space-10)_var(--space-6)] tw:[text-align:center] tw:[color:var(--muted)] tw:[display:flex] tw:[flex-direction:column] tw:[align-items:center] tw:[gap:var(--space-3)]">
            <span className="empty-state-icon tw:[font-size:36px] tw:[color:var(--muted)] tw:[opacity:0.6]">
              🏛️
            </span>
            {searchQuery || selectedType || selectedStatus ? (
              <>
                <p>No places match your search or filter criteria.</p>
                <a href="/admin/places">Clear all filters</a>
              </>
            ) : (
              <>
                <p>No places in your collection yet.</p>
                <a href="/admin/places/new">Add the first place</a>
              </>
            )}
          </div>
        )}
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete place"
        message={`Are you sure you want to permanently delete "${deleting?.title ?? ''}"?`}
        action={deleting ? `/admin/places/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
