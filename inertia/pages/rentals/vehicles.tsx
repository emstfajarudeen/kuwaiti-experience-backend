import { useState } from 'react'
import { Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import TableToolbar, { useServerFilters } from '../../components/table_toolbar'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import { useCan, usePortal, type SharedProps } from '../../components/rental_ui'

type Vehicle = {
  id: number
  name_en: string
  make: string
  model: string
  year: number | null
  provider_name: string
  vehicle_type: string
  vehicle_type_name: string
  rental_mode: 'self_drive' | 'with_driver' | 'both'
  transmission: string
  seats: number
  daily_rate: string
  quantity: number
  with_driver_available: boolean
  cover_url: string | null
  status: string
}

type Props = SharedProps & {
  status: string
  query: string
  providerId: number | null
  providers: { id: number; name: string }[]
  rows: Vehicle[]
  meta: { total: number; page: number; lastPage: number; perPage: number }
}

export default function RentalVehicles(props: Props) {
  const { adminName, csrfToken, success, error, status, query, providerId, providers, rows, meta } =
    props
  const can = useCan()
  const portal = usePortal()
  const filters = useServerFilters(
    '/admin/rentals/vehicles',
    { q: query, status, provider: providerId ? String(providerId) : '' },
    { q: '', status: '', provider: '' }
  )
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Vehicle | null>(null)
  const changeStatus = (row: Vehicle, active: boolean) =>
    router.post(
      `/admin/rentals/vehicles/${row.id}/status`,
      {
        status: active ? 'published' : 'draft',
        returnTo: window.location.pathname + window.location.search,
        _csrf: csrfToken,
      },
      { preserveScroll: true, onStart: () => setBusy(row.id), onFinish: () => setBusy(null) }
    )
  const columns: ColumnsType<Vehicle> = [
    ...(can('rentals.update')
      ? [
          {
            title: 'Edit',
            key: 'edit',
            width: 70,
            render: (_: unknown, row: Vehicle) => (
              <a
                href={`/admin/rentals/vehicles/${row.id}/edit`}
                className="action-pencil-btn"
                aria-label={`Edit ${row.name_en}`}
              >
                ✎
              </a>
            ),
          },
        ]
      : []),
    {
      title: 'Vehicle',
      key: 'vehicle',
      render: (_, row) => (
        <div className="tw:flex tw:min-w-[260px] tw:items-center tw:gap-3">
          {row.cover_url ? (
            <img
              src={row.cover_url}
              alt=""
              className="tw:h-12 tw:w-16 tw:rounded tw:object-cover"
            />
          ) : (
            <div className="tw:h-12 tw:w-16 tw:rounded tw:bg-slate-100" />
          )}
          <div className="tw:flex tw:flex-col">
            <a href={can('rentals.update') ? `/admin/rentals/vehicles/${row.id}/edit` : undefined}>
              <strong>{row.name_en}</strong>
            </a>
            <span className="tw:text-[12px] tw:text-brand-muted">
              {row.make} {row.model} {row.year ?? ''}
              {portal ? '' : ` · ${row.provider_name}`}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: 'Type',
      key: 'type',
      render: (_, row) => (
        <span className="tw:block tw:min-w-[170px] tw:text-[13px] tw:capitalize">
          {row.vehicle_type_name} · {row.transmission} · {row.seats} seats
          {row.rental_mode === 'both'
            ? ' · self-drive or driver'
            : row.rental_mode === 'with_driver'
              ? ' · driver only'
              : ''}
        </span>
      ),
    },
    { title: 'KWD / day', dataIndex: 'daily_rate', key: 'rate' },
    { title: 'Units', dataIndex: 'quantity', key: 'quantity' },
    {
      title: 'Status',
      key: 'status',
      width: 90,
      render: (_, row) => (
        <Switch
          aria-label={`${row.status === 'published' ? 'Deactivate' : 'Activate'} ${row.name_en}`}
          checked={row.status === 'published'}
          loading={busy === row.id}
          disabled={!can('rentals.publish') || busy !== null}
          onChange={(checked) => changeStatus(row, checked)}
        />
      ),
    },
    ...(can('rentals.delete')
      ? [
          {
            title: '',
            key: 'more',
            width: 90,
            render: (_: unknown, row: Vehicle) => (
              <RowActionMenu
                label={`More actions for ${row.name_en}`}
                actions={[{ label: 'Delete', danger: true, onClick: () => setDeleting(row) }]}
              />
            ),
          },
        ]
      : []),
  ]
  const changePage = (pagination: TablePaginationConfig) => {
    if (pagination.current && pagination.current !== meta.page)
      router.get('/admin/rentals/vehicles', { ...filters.values, page: pagination.current })
  }
  return (
    <AdminLayout
      title={portal ? 'Vehicles' : 'Rental fleet'}
      active="rental-vehicles"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6">
        <h1>{portal ? 'My vehicles' : 'Rental vehicles'}</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>Vehicles ({meta.total})</h2>
          {can('rentals.create') && (
            <a className="button primary" href="/admin/rentals/vehicles/new">
              {' '}
              + Add vehicle{' '}
            </a>
          )}
        </div>
        <TableToolbar
          search={{
            label: 'Search vehicles',
            placeholder: 'Search name, make or model',
            value: filters.values.q,
            onChange: (value) => filters.setSearch('q', value),
          }}
          selects={[
            {
              key: 'status',
              value: filters.values.status,
              placeholder: 'All statuses',
              options: [
                { value: 'published', label: 'Published' },
                { value: 'draft', label: 'Draft' },
              ],
              onChange: (value) => filters.setSelect('status', value),
            },
            ...(portal
              ? []
              : [
                  {
                    key: 'provider',
                    value: filters.values.provider,
                    placeholder: 'All providers',
                    options: providers.map((provider) => ({
                      value: String(provider.id),
                      label: provider.name,
                    })),
                    onChange: (value: string) => filters.setSelect('provider', value),
                  },
                ]),
          ]}
          active={filters.active}
          onReset={filters.reset}
        />
        <div className="table-scroll">
          <Table<Vehicle>
            className="cms-antd-table"
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={{
              current: meta.page,
              pageSize: meta.perPage,
              total: meta.total,
              showSizeChanger: false,
              hideOnSinglePage: true,
            }}
            onChange={changePage}
            locale={{
              emptyText: portal
                ? 'No vehicles yet. Add your first car with “+ Add vehicle”.'
                : providers.length
                  ? 'No vehicles yet.'
                  : 'Add a provider and a pickup location first, then add vehicles.',
            }}
          />
        </div>
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete vehicle"
        message={`Delete ${deleting?.name_en ?? 'this vehicle'}? Vehicles that have bookings cannot be deleted; deactivate them instead.`}
        action={deleting ? `/admin/rentals/vehicles/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
