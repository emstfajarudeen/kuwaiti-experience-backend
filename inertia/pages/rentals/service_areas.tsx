import { useState } from 'react'
import { Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import { useCan, type SharedProps } from '../../components/rental_ui'

type Area = {
  id: number
  name_en: string
  name_ar: string | null
  active: boolean
  sort_order: number
  excluded_count: number
}

export default function RentalServiceAreas({
  adminName,
  csrfToken,
  success,
  error,
  rows,
  maxDistanceKm,
}: SharedProps & { rows: Area[]; maxDistanceKm: number }) {
  const can = useCan()
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Area | null>(null)
  return (
    <AdminLayout
      title="Service areas"
      active="rental-service-areas"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6">
        <h1>Service areas</h1>
      </div>
      <p className="tw:-mt-3 tw:mb-5 tw:max-w-3xl tw:text-[14px] tw:text-brand-muted">
        For with-driver bookings, the driver can pick the customer up at their own address. An
        address belongs to the area whose pin is nearest; addresses more than {maxDistanceKm} km
        from every pin are not served. On a provider&apos;s page, choose the areas that provider
        does not serve. While no areas exist, every address in Kuwait is accepted.
      </p>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>Areas ({rows.length})</h2>
          {can('rentals.create') && (
            <a className="button primary" href="/admin/rentals/service-areas/new">
              + Add area
            </a>
          )}
        </div>
        <div className="table-scroll">
          <Table<Area>
            className="cms-antd-table"
            rowKey="id"
            dataSource={rows}
            pagination={false}
            locale={{ emptyText: 'No service areas yet.' }}
            columns={[
              ...(can('rentals.update')
                ? [
                    {
                      title: 'Edit',
                      key: 'edit',
                      width: 70,
                      render: (_: unknown, row: Area) => (
                        <a
                          href={`/admin/rentals/service-areas/${row.id}/edit`}
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
                title: 'Area',
                key: 'area',
                render: (_: unknown, row: Area) => (
                  <div className="tw:flex tw:flex-col">
                    <strong>{row.name_en}</strong>
                    <span className="tw:text-[12px] tw:text-brand-muted" dir="rtl">
                      {row.name_ar ?? ''}
                    </span>
                  </div>
                ),
              },
              {
                title: 'Providers not serving',
                dataIndex: 'excluded_count',
                key: 'excluded',
              },
              { title: 'Order', dataIndex: 'sort_order', key: 'order' },
              {
                title: 'Status',
                key: 'active',
                width: 90,
                render: (_: unknown, row: Area) => (
                  <Switch
                    aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${row.name_en}`}
                    checked={row.active}
                    loading={busy === row.id}
                    disabled={!can('rentals.update') || busy !== null}
                    onChange={(active) =>
                      router.post(
                        `/admin/rentals/service-areas/${row.id}/status`,
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
                      render: (_: unknown, row: Area) => (
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
        title="Delete area"
        message={`Delete ${deleting?.name_en ?? 'this area'}? Providers' choices for it are removed. Existing bookings keep their address.`}
        action={deleting ? `/admin/rentals/service-areas/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
