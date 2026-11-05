import { Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import TableToolbar, { useServerFilters } from '../../components/table_toolbar'
import {
  ActionForm,
  RentalTabs,
  StatusBadge,
  useCan,
  type SharedProps,
} from '../../components/rental_ui'

type Vehicle = {
  id: number
  name_en: string
  make: string
  model: string
  year: number | null
  provider_name: string
  vehicle_type: string
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
  const filters = useServerFilters(
    '/admin/rentals/vehicles',
    { q: query, status, provider: providerId ? String(providerId) : '' },
    { q: '', status: '', provider: '' }
  )
  const returnTo =
    typeof window === 'undefined' ? '' : window.location.pathname + window.location.search
  const columns: ColumnsType<Vehicle> = [
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
              {row.make} {row.model} {row.year ?? ''} · {row.provider_name}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: 'Type',
      key: 'type',
      render: (_, row) => (
        <span className="tw:text-[13px] tw:capitalize">
          {row.vehicle_type} · {row.transmission} · {row.seats} seats
          {row.with_driver_available ? ' · driver' : ''}
        </span>
      ),
    },
    { title: 'KWD / day', dataIndex: 'daily_rate', key: 'rate' },
    { title: 'Units', dataIndex: 'quantity', key: 'quantity' },
    { title: 'Status', key: 'status', render: (_, row) => <StatusBadge status={row.status} /> },
    {
      title: '',
      key: 'actions',
      render: (_, row) =>
        can('rentals.publish') ? (
          <ActionForm action={`/admin/rentals/vehicles/${row.id}/status`} csrfToken={csrfToken}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input
              type="hidden"
              name="status"
              value={row.status === 'published' ? 'draft' : 'published'}
            />
            <button type="submit" className="ant-btn ant-btn-default ant-btn-sm">
              {row.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
          </ActionForm>
        ) : null,
    },
  ]
  const changePage = (pagination: TablePaginationConfig) => {
    if (pagination.current && pagination.current !== meta.page)
      router.get('/admin/rentals/vehicles', { ...filters.values, page: pagination.current })
  }
  return (
    <AdminLayout
      title="Rental fleet"
      active="rentals"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
        <h1>Rental fleet</h1>
        {can('rentals.create') && (
          <a className="ant-btn ant-btn-primary" href="/admin/rentals/vehicles/new">
            Add vehicle
          </a>
        )}
      </div>
      <RentalTabs current="vehicles" />
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>Vehicles ({meta.total})</h2>
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
            {
              key: 'provider',
              value: filters.values.provider,
              placeholder: 'All providers',
              options: providers.map((provider) => ({
                value: String(provider.id),
                label: provider.name,
              })),
              onChange: (value) => filters.setSelect('provider', value),
            },
          ]}
          active={filters.active}
          onReset={filters.reset}
        />
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
          scroll={{ x: 'max-content' }}
          onChange={changePage}
          locale={{
            emptyText: providers.length
              ? 'No vehicles yet.'
              : 'Add a provider and a pickup location first, then add vehicles.',
          }}
        />
      </section>
    </AdminLayout>
  )
}
