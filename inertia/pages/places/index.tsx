import { useState } from 'react'
import AdminLayout from '../../layouts/admin_layout'
import RowActionMenu from '../../components/row_action_menu'
import ConfirmModal from '../../components/confirm_modal'
import { Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import TableToolbar, { useServerFilters } from '../../components/table_toolbar'

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
  const [changingStatus, setChangingStatus] = useState<number | null>(null)
  const defaults = { q: '', type: '', status: '', sort: 'updated_desc' }
  const serverFilters = useServerFilters(
    '/admin/places',
    { q: searchQuery, type: selectedType, status: selectedStatus, sort: selectedSort },
    defaults
  )
  const pageUrl = (page: number) =>
    `/admin/places?${new URLSearchParams({ page: String(page), q: filters.q, type: filters.type, status: filters.status, sort: filters.sort })}`
  const changeStatus = (place: Place, checked: boolean) => {
    router.post(
      `/admin/places/${place.id}/${checked ? 'publish' : 'archive'}`,
      { _csrf: csrfToken, returnTo: window.location.pathname + window.location.search },
      {
        preserveScroll: true,
        onStart: () => setChangingStatus(place.id),
        onFinish: () => setChangingStatus(null),
      }
    )
  }
  return (
    <AdminLayout
      title="Business/Places"
      active="places"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Business/Places</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:overflow-hidden tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>
            {pagination.total
              ? `Showing ${(pagination.page - 1) * pagination.perPage + 1}–${Math.min(pagination.page * pagination.perPage, pagination.total)} of ${pagination.total} business/places`
              : '0 business/places found'}
          </h2>
          <a className="button primary" href="/admin/places/new">
            + Add business/place
          </a>
        </div>
        <TableToolbar
          search={{
            label: 'Search business/places',
            placeholder: 'Search name, slug or address',
            value: serverFilters.values.q,
            onChange: (value) => serverFilters.setSearch('q', value),
          }}
          selects={[
            {
              key: 'type',
              value: serverFilters.values.type,
              placeholder: 'All types',
              onChange: (value) => serverFilters.setSelect('type', value),
              options: types.map((type) => ({ value: type.code, label: type.name_en })),
            },
            {
              key: 'status',
              value: serverFilters.values.status,
              placeholder: 'All statuses',
              onChange: (value) => serverFilters.setSelect('status', value),
              options: [
                { value: 'published', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
            {
              key: 'sort',
              value: serverFilters.values.sort,
              placeholder: 'Sort by',
              required: true,
              onChange: (value) => serverFilters.setSelect('sort', value),
              options: [
                { value: 'updated_desc', label: 'Recently edited' },
                { value: 'updated_asc', label: 'Oldest edited' },
                { value: 'title_asc', label: 'Title (A–Z)' },
                { value: 'title_desc', label: 'Title (Z–A)' },
                { value: 'status', label: 'Status' },
              ],
            },
          ]}
          active={serverFilters.active}
          onReset={serverFilters.reset}
        />
        {rows.length ? (
          <>
            <div className="table-scroll">
              <Table<Place>
                rowKey="id"
                pagination={false}
                dataSource={rows}
                columns={[
                  {
                    title: 'Edit',
                    key: 'edit',
                    width: 64,
                    render: (_: unknown, row) => (
                      <a
                        href={`/admin/places/${row.id}/edit`}
                        className="action-pencil-btn"
                        aria-label={`Edit ${row.title}`}
                      >
                        ✎
                      </a>
                    ),
                  },
                  {
                    title: 'Business/Place',
                    key: 'place',
                    render: (_: unknown, row) => (
                      <div className="place-cell tw:[display:flex] tw:[align-items:center] tw:[gap:var(--space-3)] tw:[min-width:220px]">
                        {row.coverUrl && <img src={row.coverUrl} alt="" loading="lazy" />}
                        <div className="place-title-wrap">
                          <strong>{row.title}</strong>
                        </div>
                      </div>
                    ),
                  },
                  {
                    title: 'Type',
                    dataIndex: 'type_name_en',
                    render: (name: string) => <span className="type-chip">{name}</span>,
                  },
                  {
                    title: 'Last Edit',
                    dataIndex: 'updated_at_local',
                    render: (value: string | null) => value || '—',
                  },
                  {
                    title: 'Status',
                    key: 'status',
                    render: (_: unknown, row) => (
                      <Switch
                        aria-label={`${row.status === 'published' ? 'Archive' : 'Publish'} ${row.title}; current status: ${row.status}`}
                        title={`Current status: ${row.status}`}
                        checked={row.status === 'published'}
                        loading={changingStatus === row.id}
                        disabled={changingStatus !== null}
                        onChange={(checked) => changeStatus(row, checked)}
                      />
                    ),
                  },
                  {
                    title: 'Actions',
                    key: 'actions',
                    render: (_: unknown, row) => (
                      <RowActionMenu
                        label={`More actions for ${row.title}`}
                        actions={[
                          {
                            label: 'Preview',
                            href: `/admin/places/${row.id}/preview`,
                            target: '_blank',
                          },
                          {
                            label: 'Explore details & hours',
                            href: `/admin/places/${row.id}/explore`,
                          },
                          { label: 'Delete', danger: true, onClick: () => setDeleting(row) },
                        ]}
                      />
                    ),
                  },
                ]}
              />
            </div>
            <div className="pagination-bar tw:[display:flex] tw:[justify-content:space-between] tw:[align-items:center] tw:[flex-wrap:wrap] tw:[gap:var(--space-3)] tw:[padding:var(--space-4)_var(--space-6)] tw:[border-top:1px_solid_var(--line-subtle)] tw:[background:var(--surface)] tw:[font-size:13px] tw:[color:var(--muted)]">
              <span>
                Page {pagination.page} of {pagination.lastPage} ({pagination.total} total business/places)
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
                <p>No business/places match your search or filter criteria.</p>
                <a href="/admin/places">Clear all filters</a>
              </>
            ) : (
              <>
                <p>No business/places in your collection yet.</p>
                <a href="/admin/places/new">Add the first place</a>
              </>
            )}
          </div>
        )}
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete business/place"
        message={`Are you sure you want to permanently delete "${deleting?.title ?? ''}"?`}
        action={deleting ? `/admin/places/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
