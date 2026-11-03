import { Button, Popconfirm, Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import TableToolbar, { useServerFilters } from '../../components/table_toolbar'

type Report = {
  id: number
  video_id: number
  video_caption: string
  video_status: string
  reason: string
  note: string | null
  reporter: string
  created_at: string | null
}
type Props = {
  adminName: string
  csrfToken: string
  success?: string | null
  error?: string | null
  status: string
  rows: Report[]
  meta: { total: number; page: number; lastPage: number }
}

const statusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'dismissed', label: 'Dismissed' },
]

export default function VideoReports({
  adminName,
  csrfToken,
  success,
  error,
  status,
  rows,
  meta,
}: Props) {
  const filters = useServerFilters('/admin/videos/reports', { status }, { status: 'open' })

  const resolve = (id: number, next: 'reviewed' | 'dismissed', unpublish = false) =>
    router.post(
      `/admin/videos/reports/${id}/status`,
      { status: next, unpublish: unpublish ? '1' : '0', _csrf: csrfToken },
      { preserveScroll: true }
    )

  const columns: ColumnsType<Report> = [
    {
      title: 'Video',
      key: 'video',
      render: (_, row) => (
        <div className="tw:flex tw:min-w-[220px] tw:flex-col">
          <a href={`/admin/videos/${row.video_id}/edit`}>
            <strong className="video-caption">{row.video_caption}</strong>
          </a>
          <span className="tw:text-[13px] tw:text-brand-muted">
            {row.video_status === 'published' ? 'Published' : 'Draft'}
          </span>
        </div>
      ),
    },
    {
      title: 'Reason',
      key: 'reason',
      render: (_, row) => (
        <div className="tw:flex tw:flex-col">
          <strong>{row.reason}</strong>
          {row.note && <span className="tw:text-[13px] tw:text-brand-muted">{row.note}</span>}
        </div>
      ),
    },
    { title: 'Reported by', dataIndex: 'reporter', key: 'reporter' },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string | null) => (value ? new Date(value).toLocaleString() : '—'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, row) =>
        status === 'open' ? (
          <div className="tw:flex tw:flex-wrap tw:gap-2">
            {row.video_status === 'published' && (
              <Popconfirm
                title="Unpublish this video?"
                description="It will be hidden from the app and the report marked as reviewed."
                okText="Unpublish"
                onConfirm={() => resolve(row.id, 'reviewed', true)}
              >
                <Button size="small" danger>
                  Unpublish video
                </Button>
              </Popconfirm>
            )}
            <Button size="small" onClick={() => resolve(row.id, 'reviewed')}>
              Mark reviewed
            </Button>
            <Button size="small" onClick={() => resolve(row.id, 'dismissed')}>
              Dismiss
            </Button>
          </div>
        ) : (
          <span className="tw:text-brand-muted">—</span>
        ),
    },
  ]

  const changePage = (pagination: TablePaginationConfig) => {
    if (pagination.current && pagination.current !== meta.page) {
      router.visit(`/admin/videos/reports?status=${status}&page=${pagination.current}`)
    }
  }

  return (
    <AdminLayout
      title="Video reports"
      active="videos"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="tw:mb-6 tw:flex tw:items-center tw:justify-between tw:gap-4">
        <a className="back-link tw:inline-flex" href="/admin/videos">
          ← Back to videos
        </a>
      </div>
      <div className="page-head tw:mb-4">
        <h1>Video reports</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0 tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)]">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>Reports ({meta.total})</h2>
        </div>
        <TableToolbar
          selects={[
            {
              key: 'status',
              value: filters.values.status,
              placeholder: 'Report status',
              onChange: (value) => filters.setSelect('status', value),
              options: statusOptions,
              required: true,
            },
          ]}
          active={filters.active}
          onReset={filters.reset}
        />
        <div className="table-scroll">
          <Table<Report>
            className="cms-antd-table"
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={{
              current: meta.page,
              pageSize: 20,
              total: meta.total,
              showSizeChanger: false,
              hideOnSinglePage: true,
            }}
            onChange={changePage}
            locale={{ emptyText: 'No reports here.' }}
          />
        </div>
      </section>
    </AdminLayout>
  )
}
