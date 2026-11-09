import { Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import { useState } from 'react'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import { RentalTabs, useCan, type SharedProps } from '../../components/rental_ui'

type Location = {
  id: number
  name_en: string
  name_ar: string | null
  address: string | null
  active: boolean
  sort_order: number
  vehicle_count: number
}

export default function RentalLocations({
  adminName,
  csrfToken,
  success,
  error,
  rows,
}: SharedProps & { rows: Location[] }) {
  const can = useCan()
  const [deleting, setDeleting] = useState<Location | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const changeActive = (row: Location, active: boolean) =>
    router.post(
      `/admin/rentals/locations/${row.id}/status`,
      {
        active,
        returnTo: window.location.pathname + window.location.search,
        _csrf: csrfToken,
      },
      { preserveScroll: true, onStart: () => setBusy(row.id), onFinish: () => setBusy(null) }
    )
  const columns: ColumnsType<Location> = [
    ...(can('rentals.update')
      ? [
          {
            title: 'Edit',
            key: 'edit',
            width: 70,
            render: (_: unknown, row: Location) => (
              <a
                href={`/admin/rentals/locations/${row.id}/edit`}
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
      title: 'Location',
      key: 'name',
      render: (_, row) => (
        <div className="tw:flex tw:flex-col">
          <strong>{row.name_en}</strong>
          <span className="tw:text-[12px] tw:text-brand-muted">{row.address ?? ''}</span>
        </div>
      ),
    },
    { title: 'Vehicles', dataIndex: 'vehicle_count', key: 'vehicles' },
    { title: 'Order', dataIndex: 'sort_order', key: 'order' },
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
            render: (_: unknown, row: Location) => (
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
      title="Rental locations"
      active="rentals"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
        <h1>Pickup and return locations</h1>
      </div>
      <RentalTabs
        current="locations"
        actions={
          can('rentals.create') && (
            <a className="button primary" href="/admin/rentals/locations/new">
              + Add location
            </a>
          )
        }
      />
      <section className="panel table-panel tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="table-scroll">
          <Table<Location>
            className="cms-antd-table"
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={false}
            locale={{ emptyText: 'No rental locations yet.' }}
          />
        </div>
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete location"
        message={`Delete ${deleting?.name_en ?? 'this location'}? Locations used by bookings cannot be deleted; deactivate them instead.`}
        action={deleting ? `/admin/rentals/locations/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
