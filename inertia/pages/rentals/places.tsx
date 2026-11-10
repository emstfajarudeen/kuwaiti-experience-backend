import { useState } from 'react'
import { Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import { useCan, type SharedProps } from '../../components/rental_ui'

type Place = {
  id: number
  name_en: string
  subtitle_en: string | null
  active: boolean
  sort_order: number
  branch_count: number
}

export default function RentalPlaces({
  adminName,
  csrfToken,
  success,
  error,
  rows,
}: SharedProps & { rows: Place[] }) {
  const can = useCan()
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Place | null>(null)
  return (
    <AdminLayout
      title="Pickup places"
      active="rental-places"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6">
        <h1>Pickup places</h1>
      </div>
      <p className="tw:-mt-3 tw:mb-5 tw:max-w-3xl tw:text-[14px] tw:text-brand-muted">
        The places customers choose in the app, such as the airport or a mall. Each provider branch
        is linked to a place, and the app shows every provider&apos;s cars at that place.
      </p>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>Places ({rows.length})</h2>
          {can('rentals.create') && (
            <a className="button primary" href="/admin/rentals/places/new">
              + Add place
            </a>
          )}
        </div>
        <div className="table-scroll">
          <Table<Place>
            className="cms-antd-table"
            rowKey="id"
            dataSource={rows}
            pagination={false}
            locale={{ emptyText: 'No pickup places yet.' }}
            columns={[
              ...(can('rentals.update')
                ? [
                    {
                      title: 'Edit',
                      key: 'edit',
                      width: 70,
                      render: (_: unknown, row: Place) => (
                        <a
                          href={`/admin/rentals/places/${row.id}/edit`}
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
                title: 'Place',
                key: 'place',
                render: (_: unknown, row: Place) => (
                  <div className="tw:flex tw:flex-col">
                    <strong>{row.name_en}</strong>
                    <span className="tw:text-[12px] tw:text-brand-muted">
                      {row.subtitle_en ?? '—'}
                    </span>
                  </div>
                ),
              },
              { title: 'Provider branches', dataIndex: 'branch_count', key: 'branches' },
              { title: 'Order', dataIndex: 'sort_order', key: 'order' },
              {
                title: 'Status',
                key: 'active',
                width: 90,
                render: (_: unknown, row: Place) => (
                  <Switch
                    aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${row.name_en}`}
                    checked={row.active}
                    loading={busy === row.id}
                    disabled={!can('rentals.update') || busy !== null}
                    onChange={(active) =>
                      router.post(
                        `/admin/rentals/places/${row.id}/status`,
                        { active, _csrf: csrfToken },
                        {
                          preserveScroll: true,
                          onStart: () => setBusy(row.id),
                          onFinish: () => setBusy(null),
                        }
                      )
                    }
                  />
                ),
              },
              ...(can('rentals.delete')
                ? [
                    {
                      title: 'Actions',
                      key: 'more',
                      width: 90,
                      render: (_: unknown, row: Place) => (
                        <RowActionMenu
                          label={`More actions for ${row.name_en}`}
                          actions={[
                            { label: 'Delete', danger: true, onClick: () => setDeleting(row) },
                          ]}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete place"
        message={`Delete ${deleting?.name_en ?? 'this place'}? Places linked to provider branches cannot be deleted; deactivate them instead.`}
        action={deleting ? `/admin/rentals/places/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
