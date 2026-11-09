import { Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import { useState } from 'react'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import { RentalTabs, useCan, type SharedProps } from '../../components/rental_ui'

type Provider = {
  id: number
  name_en: string
  phone: string | null
  email: string | null
  active: boolean
  vehicle_count: number
  logo_url: string | null
}

export default function RentalProviders({
  adminName,
  csrfToken,
  success,
  error,
  rows,
}: SharedProps & { rows: Provider[] }) {
  const can = useCan()
  const [deleting, setDeleting] = useState<Provider | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const changeActive = (row: Provider, active: boolean) =>
    router.post(
      `/admin/rentals/providers/${row.id}/status`,
      {
        active,
        returnTo: window.location.pathname + window.location.search,
        _csrf: csrfToken,
      },
      { preserveScroll: true, onStart: () => setBusy(row.id), onFinish: () => setBusy(null) }
    )
  const columns: ColumnsType<Provider> = [
    ...(can('rentals.update')
      ? [
          {
            title: 'Edit',
            key: 'edit',
            width: 70,
            render: (_: unknown, row: Provider) => (
              <a
                href={`/admin/rentals/providers/${row.id}/edit`}
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
      title: 'Provider',
      key: 'name',
      render: (_, row) => (
        <div className="tw:flex tw:items-center tw:gap-3">
          {row.logo_url ? (
            <img
              src={row.logo_url}
              alt=""
              className="tw:h-10 tw:w-10 tw:rounded tw:object-contain"
            />
          ) : (
            <div className="tw:h-10 tw:w-10 tw:rounded tw:bg-slate-100" />
          )}
          <strong>{row.name_en}</strong>
        </div>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      render: (_, row) => (
        <div className="tw:flex tw:flex-col tw:text-[13px]">
          <span>{row.phone ?? '—'}</span>
          <span className="tw:text-brand-muted">{row.email ?? ''}</span>
        </div>
      ),
    },
    { title: 'Vehicles', dataIndex: 'vehicle_count', key: 'vehicles' },
    {
      title: 'Status',
      key: 'active',
      width: 90,
      render: (_, row) => (
        <Switch
          aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${row.name_en}`}
          checked={row.active}
          loading={busy === row.id}
          disabled={!can('rentals.update') || busy !== null}
          onChange={(checked) => changeActive(row, checked)}
        />
      ),
    },
    ...(can('rentals.delete')
      ? [
          {
            title: '',
            key: 'more',
            width: 90,
            render: (_: unknown, row: Provider) => (
              <RowActionMenu
                label={`More actions for ${row.name_en}`}
                actions={[{ label: 'Delete', danger: true, onClick: () => setDeleting(row) }]}
              />
            ),
          },
        ]
      : []),
  ]
  return (
    <AdminLayout
      title="Rental providers"
      active="rentals"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
        <h1>Rental providers</h1>
      </div>
      <RentalTabs
        current="providers"
        actions={
          can('rentals.create') && (
            <a className="button primary" href="/admin/rentals/providers/new">
              + Add provider
            </a>
          )
        }
      />
      <section className="panel table-panel tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <Table<Provider>
          className="cms-antd-table"
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'No rental providers yet.' }}
        />
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete provider"
        message={`Delete ${deleting?.name_en ?? 'this provider'}? Providers that have vehicles cannot be deleted; deactivate them instead.`}
        action={deleting ? `/admin/rentals/providers/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
