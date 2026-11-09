import { useState } from 'react'
import { Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import TableToolbar, { useServerFilters } from '../../components/table_toolbar'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import {
  bookingStatusOptions,
  formatDateTime,
  StatusBadge,
  useCan,
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
  paid: boolean
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
  const can = useCan()
  const [pending, setPending] = useState<{
    row: Booking
    kind: 'complete' | 'cancel' | 'refund'
  } | null>(null)
  const actionsFor = (row: Booking) => {
    const list: Array<{ label: string; href?: string; danger?: boolean; onClick?: () => void }> = [
      { label: 'View details', href: `/admin/rentals/bookings/${row.id}` },
    ]
    if (can('rental_bookings.update')) {
      if (row.status === 'confirmed' && new Date(row.pickup_at) <= new Date())
        list.push({
          label: 'Mark as completed',
          onClick: () => setPending({ row, kind: 'complete' }),
        })
      if (['pending_payment', 'confirmed', 'expired'].includes(row.status))
        list.push({
          label: 'Cancel booking',
          danger: true,
          onClick: () => setPending({ row, kind: 'cancel' }),
        })
    }
    if (row.paid && can('rental_bookings.refund'))
      list.push({
        label: 'Refund booking fee',
        danger: true,
        onClick: () => setPending({ row, kind: 'refund' }),
      })
    return list
  }
  const confirmCopy = {
    complete: {
      title: 'Mark as completed',
      message: 'Mark this rental as completed? The customer can then review it.',
      label: 'Mark as completed',
    },
    cancel: {
      title: 'Cancel booking',
      message:
        'Cancel this booking? The booking fee is not refunded automatically. If it was confirmed, the provider is emailed.',
      label: 'Cancel booking',
    },
    refund: {
      title: 'Refund booking fee',
      message: 'Refund the booking fee through MyFatoorah? This also cancels the booking.',
      label: 'Refund',
    },
  } as const
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
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      render: (_, row) => (
        <RowActionMenu label={`Actions for ${row.reference}`} actions={actionsFor(row)} />
      ),
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
        <div className="table-scroll">
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
            onChange={changePage}
            locale={{ emptyText: 'No rental bookings yet.' }}
          />
        </div>
      </section>
      <ConfirmModal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={pending ? confirmCopy[pending.kind].title : ''}
        message={pending ? `${pending.row.reference}: ${confirmCopy[pending.kind].message}` : ''}
        action={pending ? `/admin/rentals/bookings/${pending.row.id}/${pending.kind}` : ''}
        csrfToken={csrfToken}
        confirmLabel={pending ? confirmCopy[pending.kind].label : ''}
        danger={pending?.kind !== 'complete'}
        fields={{
          returnTo:
            typeof window === 'undefined' ? '' : window.location.pathname + window.location.search,
        }}
      />
    </AdminLayout>
  )
}
