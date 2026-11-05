import { Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import TableToolbar, { useServerFilters } from '../../components/table_toolbar'
import {
  bookingStatusOptions,
  formatDateTime,
  StatusBadge,
  type SharedProps,
} from '../../components/rental_ui'

type Booking = {
  id: number
  reference: string
  status: string
  customer: { name: string; phone: string }
  vehicle_name: string
  provider_name: string
  pickup_at: string
  return_at: string
  with_driver: boolean
  days: number
  rental_amount: string
  booking_fee: string
  created_at: string
}

type Props = SharedProps & {
  status: string
  query: string
  rows: Booking[]
  meta: { total: number; page: number; lastPage: number; perPage: number }
}

export default function RentalBookings({
  adminName,
  csrfToken,
  success,
  error,
  status,
  query,
  rows,
  meta,
}: Props) {
  const filters = useServerFilters(
    '/admin/rentals/bookings',
    { q: query, status },
    { q: '', status: '' }
  )
  const columns: ColumnsType<Booking> = [
    {
      title: 'Reference',
      key: 'reference',
      render: (_, row) => (
        <a href={`/admin/rentals/bookings/${row.id}`}>
          <strong>{row.reference}</strong>
        </a>
      ),
    },
    { title: 'Status', key: 'status', render: (_, row) => <StatusBadge status={row.status} /> },
    {
      title: 'Customer',
      key: 'customer',
      render: (_, row) => (
        <div className="tw:flex tw:flex-col">
          <span>{row.customer.name}</span>
          <span className="tw:text-[12px] tw:text-brand-muted">{row.customer.phone}</span>
        </div>
      ),
    },
    {
      title: 'Vehicle',
      key: 'vehicle',
      render: (_, row) => (
        <div className="tw:flex tw:flex-col">
          <span>
            {row.vehicle_name}
            {row.with_driver ? ' · with driver' : ''}
          </span>
          <span className="tw:text-[12px] tw:text-brand-muted">{row.provider_name}</span>
        </div>
      ),
    },
    {
      title: 'Rental period',
      key: 'period',
      render: (_, row) => (
        <div className="tw:flex tw:flex-col tw:text-[13px]">
          <span>{formatDateTime(row.pickup_at)}</span>
          <span className="tw:text-brand-muted">
            → {formatDateTime(row.return_at)} ({row.days} {row.days === 1 ? 'day' : 'days'})
          </span>
        </div>
      ),
    },
    {
      title: 'Amounts (KWD)',
      key: 'amounts',
      render: (_, row) => (
        <div className="tw:flex tw:flex-col tw:text-[13px]">
          <span>Fee {row.booking_fee}</span>
          <span className="tw:text-brand-muted">At pickup {row.rental_amount}</span>
        </div>
      ),
    },
    {
      title: 'Booked',
      key: 'created',
      render: (_, row) => <span className="tw:text-[13px]">{formatDateTime(row.created_at)}</span>,
    },
  ]
  const changePage = (pagination: TablePaginationConfig) => {
    if (pagination.current && pagination.current !== meta.page)
      router.get('/admin/rentals/bookings', { ...filters.values, page: pagination.current })
  }
  return (
    <AdminLayout
      title="Rental bookings"
      active="rental-bookings"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6">
        <h1>Rental bookings</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>Bookings ({meta.total})</h2>
        </div>
        <TableToolbar
          search={{
            label: 'Search bookings',
            placeholder: 'Search reference, customer name or phone',
            value: filters.values.q,
            onChange: (value) => filters.setSearch('q', value),
          }}
          selects={[
            {
              key: 'status',
              value: filters.values.status,
              placeholder: 'All statuses',
              options: bookingStatusOptions,
              onChange: (value) => filters.setSelect('status', value),
            },
          ]}
          active={filters.active}
          onReset={filters.reset}
        />
        <Table<Booking>
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
          locale={{ emptyText: 'No rental bookings yet.' }}
        />
      </section>
    </AdminLayout>
  )
}
