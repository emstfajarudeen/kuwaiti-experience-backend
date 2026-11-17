import { useState } from 'react'
import { Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import { useAuthorization } from '../../lib/authorization'
import RowActionMenu from '../../components/row_action_menu'
import ConfirmModal from '../../components/confirm_modal'
import TableToolbar, { useServerFilters } from '../../components/table_toolbar'
import { processingLabel } from '../../components/video_processing'

type VideoRow = {
  id: number
  caption_en: string
  status: string
  place_title: string | null
  category_name: string | null
  thumbnail_url: string | null
  processing_status: string
  processing_error: string | null
  likes: number
  comments: number
  saves: number
  shares: number
  open_reports: number
  published_at: string | null
}
type Props = {
  adminName: string
  csrfToken: string
  success?: string | null
  error?: string | null
  status: string
  query: string
  rows: VideoRow[]
  meta: { total: number; page: number; lastPage: number; perPage: number }
}

export default function VideosIndex({
  adminName,
  csrfToken,
  success,
  error,
  status,
  query,
  rows,
  meta,
}: Props) {
  const { can } = useAuthorization()
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<VideoRow | null>(null)
  const filters = useServerFilters('/admin/videos', { q: query, status }, { q: '', status: '' })

  const post = (url: string, data: Record<string, string>, id: number) =>
    router.post(
      url,
      { ...data, _csrf: csrfToken, returnTo: window.location.pathname + window.location.search },
      { preserveScroll: true, onStart: () => setBusy(id), onFinish: () => setBusy(null) }
    )

  const columns: ColumnsType<VideoRow> = [
    ...(can('videos.update')
      ? [
          {
            title: 'Edit',
            key: 'edit',
            width: 70,
            render: (_: unknown, row: VideoRow) => (
              <a
                href={`/admin/videos/${row.id}/edit`}
                className="action-pencil-btn"
                aria-label={`Edit video ${row.caption_en}`}
              >
                ✎
              </a>
            ),
          },
        ]
      : []),
    {
      title: 'Video',
      key: 'video',
      render: (_, row) => (
        <div className="tw:flex tw:min-w-[260px] tw:items-center tw:gap-3">
          <span className="video-thumb">
            {row.thumbnail_url ? (
              <img src={row.thumbnail_url} alt="" />
            ) : (
              <span aria-hidden="true">▶</span>
            )}
          </span>
          <div className="tw:flex tw:flex-col">
            <strong className="video-caption">{row.caption_en}</strong>
            <span className="tw:text-[13px] tw:text-brand-muted">
              {row.place_title ?? 'thekuwaitiexperience'}
              {row.category_name ? ` · ${row.category_name}` : ''}
            </span>
            {processingLabel(row) && (
              <span className={`tw:text-[12px] tw:font-semibold ${processingLabel(row)!.tone}`}>
                {row.processing_status === 'failed' ? 'Conversion failed' : 'Converting…'}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      render: (_, row) => (
        <label className="tw:flex tw:items-center tw:gap-2">
          <Switch
            aria-label={`${row.status === 'published' ? 'Deactivate' : 'Activate'} video ${row.caption_en}`}
            checked={row.status === 'published'}
            loading={busy === row.id}
            disabled={!can('videos.publish') || busy !== null}
            onChange={(checked) =>
              post(
                `/admin/videos/${row.id}/status`,
                { status: checked ? 'published' : 'draft' },
                row.id
              )
            }
          />
          <span className="tw:text-[13px] tw:font-semibold">
            {row.status === 'published' ? 'Active' : 'Inactive'}
          </span>
        </label>
      ),
    },
    {
      title: 'Engagement',
      key: 'engagement',
      render: (_, row) => (
        <span className="tw:text-[13px]">
          {row.likes} likes · {row.comments} comments · {row.saves} saves
        </span>
      ),
    },
    {
      title: 'Reports',
      key: 'reports',
      render: (_, row) =>
        row.open_reports > 0 && can('videos.moderate') ? (
          <a href="/admin/videos/reports" className="status archived">
            {row.open_reports} open
          </a>
        ) : (
          <span className="tw:text-brand-muted">—</span>
        ),
    },
    ...(can('videos.delete')
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 90,
            render: (_: unknown, row: VideoRow) => (
              <RowActionMenu
                label={`More actions for ${row.caption_en}`}
                actions={[{ label: 'Delete', danger: true, onClick: () => setDeleting(row) }]}
              />
            ),
          },
        ]
      : []),
  ]

  const changePage = (pagination: TablePaginationConfig) => {
    if (pagination.current && pagination.current !== meta.page) {
      const params = new URLSearchParams({ page: String(pagination.current) })
      if (query) params.set('q', query)
      if (status) params.set('status', status)
      router.visit(`/admin/videos?${params.toString()}`)
    }
  }

  return (
    <AdminLayout
      title="Videos"
      active="videos"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6">
        <h1>Videos</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0 tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)]">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>All videos ({meta.total})</h2>
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            {can('videos.moderate') && (
              <a className="button secondary" href="/admin/videos/reports">
                Reports
              </a>
            )}
            {can('videos.create') && (
              <a className="button primary" href="/admin/videos/new">
                + Add video
              </a>
            )}
          </div>
        </div>
        <TableToolbar
          search={{
            label: 'Search videos',
            placeholder: 'Search caption',
            value: filters.values.q,
            onChange: (value) => filters.setSearch('q', value),
          }}
          selects={[
            {
              key: 'status',
              value: filters.values.status,
              placeholder: 'All statuses',
              onChange: (value) => filters.setSelect('status', value),
              options: [
                { value: 'published', label: 'Active' },
                { value: 'draft', label: 'Inactive' },
              ],
            },
          ]}
          active={filters.active}
          onReset={filters.reset}
        />
        <div className="table-scroll">
          <Table<VideoRow>
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
            locale={{ emptyText: 'No videos yet. Add the first one.' }}
          />
        </div>
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete video"
        message="Delete this video? Its comments and reports are removed too. This cannot be undone."
        action={deleting ? `/admin/videos/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
