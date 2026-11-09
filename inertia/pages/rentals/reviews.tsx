import { useState } from 'react'
import { Rate, Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import TableToolbar, { useServerFilters } from '../../components/table_toolbar'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import { formatDateTime, useCan, type SharedProps } from '../../components/rental_ui'

type Review = {
  id: number
  booking_id: number
  reference: string
  rating: number
  comment: string | null
  status: 'published' | 'hidden'
  customer_name: string
  customer_phone: string
  vehicle_name: string
  provider_name: string
  created_at: string
}

type Props = SharedProps & {
  status: string
  rating: string
  query: string
  rows: Review[]
  meta: { total: number; page: number; lastPage: number; perPage: number }
}

export default function RentalReviews(props: Props) {
  const { adminName, csrfToken, success, error, status, rating, query, rows, meta } = props
  const can = useCan()
  const filters = useServerFilters(
    '/admin/rentals/reviews',
    { q: query, status, rating },
    { q: '', status: '', rating: '' }
  )
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Review | null>(null)
  const changeStatus = (row: Review, visible: boolean) =>
    router.post(
      `/admin/rentals/reviews/${row.id}/status`,
      {
        status: visible ? 'published' : 'hidden',
        returnTo: window.location.pathname + window.location.search,
        _csrf: csrfToken,
      },
      { preserveScroll: true, onStart: () => setBusy(row.id), onFinish: () => setBusy(null) }
    )
  const columns: ColumnsType<Review> = [
    {
      title: 'Rating',
      key: 'rating',
      width: 150,
      render: (_, row) => <Rate disabled value={row.rating} className="tw:text-[14px]" />,
    },
    {
      title: 'Review',
      key: 'comment',
      render: (_, row) => (
        <div className="tw:flex tw:max-w-[420px] tw:flex-col">
          <span className="tw:whitespace-pre-line">
            {row.comment ?? <em className="tw:text-brand-muted">No comment</em>}
          </span>
          <span className="tw:text-[12px] tw:text-brand-muted">
            {row.customer_name} · {row.customer_phone}
          </span>
        </div>
      ),
    },
    {
      title: 'Vehicle',
      key: 'vehicle',
      render: (_, row) => (
        <div className="tw:flex tw:flex-col">
          <span>{row.vehicle_name}</span>
          <span className="tw:text-[12px] tw:text-brand-muted">{row.provider_name}</span>
        </div>
      ),
    },
    {
      title: 'Booking',
      key: 'booking',
      render: (_, row) => <a href={`/admin/rentals/bookings/${row.booking_id}`}>{row.reference}</a>,
    },
    {
      title: 'Posted',
      key: 'created',
      render: (_, row) => <span className="tw:text-[13px]">{formatDateTime(row.created_at)}</span>,
    },
    {
      title: 'Visible',
      key: 'status',
      width: 90,
      render: (_, row) => (
        <Switch
          aria-label={`${row.status === 'published' ? 'Hide' : 'Show'} review ${row.id}`}
          checked={row.status === 'published'}
          loading={busy === row.id}
          disabled={!can('rental_reviews.update') || busy !== null}
          onChange={(checked) => changeStatus(row, checked)}
        />
      ),
    },
    ...(can('rental_reviews.delete')
      ? [
          {
            title: '',
            key: 'more',
            width: 90,
            render: (_: unknown, row: Review) => (
              <RowActionMenu
                label={`More actions for review ${row.id}`}
                actions={[{ label: 'Delete', danger: true, onClick: () => setDeleting(row) }]}
              />
            ),
          },
        ]
      : []),
  ]
  const changePage = (pagination: TablePaginationConfig) => {
    if (pagination.current && pagination.current !== meta.page)
      router.get('/admin/rentals/reviews', { ...filters.values, page: pagination.current })
  }
  return (
    <AdminLayout
      title="Rental reviews"
      active="rental-reviews"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6">
        <h1>Rental reviews</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>Reviews ({meta.total})</h2>
        </div>
        <TableToolbar
          search={{
            label: 'Search reviews',
            placeholder: 'Search reference, vehicle, provider or text',
            value: filters.values.q,
            onChange: (value) => filters.setSearch('q', value),
          }}
          selects={[
            {
              key: 'status',
              value: filters.values.status,
              placeholder: 'All reviews',
              options: [
                { value: 'published', label: 'Visible' },
                { value: 'hidden', label: 'Hidden' },
              ],
              onChange: (value) => filters.setSelect('status', value),
            },
            {
              key: 'rating',
              value: filters.values.rating,
              placeholder: 'All ratings',
              options: [5, 4, 3, 2, 1].map((value) => ({
                value: String(value),
                label: `${value} star${value === 1 ? '' : 's'}`,
              })),
              onChange: (value) => filters.setSelect('rating', value),
            },
          ]}
          active={filters.active}
          onReset={filters.reset}
        />
        <div className="table-scroll">
          <Table<Review>
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
            locale={{ emptyText: 'No reviews yet.' }}
          />
        </div>
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete review"
        message="Delete this review permanently? To keep it but remove it from the app, hide it instead."
        action={deleting ? `/admin/rentals/reviews/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
