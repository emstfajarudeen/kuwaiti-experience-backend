import { useState } from 'react'
import { Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import { useCan, usePortal, type SharedProps } from '../../components/rental_ui'

type Branch = {
  id: number
  name_en: string
  address: string | null
  phone: string | null
  provider_id: number | null
  provider_name: string | null
  place_name: string | null
  active: boolean
  hours_enabled: boolean
  vehicle_count: number
}

type Props = SharedProps & {
  provider: string
  providers: { value: string; label: string }[]
  rows: Branch[]
}

export default function RentalBranches({
  adminName,
  csrfToken,
  success,
  error,
  provider,
  providers,
  rows,
}: Props) {
  const can = useCan()
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Branch | null>(null)
  const here =
    typeof window === 'undefined' ? '' : window.location.pathname + window.location.search
  // Provider portal: the whole page is the provider's own, so no provider name or filter.
  const portal = usePortal()
  const providerName = providers.find((option) => option.value === provider)?.label
  const named = portal ? '' : providerName
  const addHref =
    provider && !portal
      ? `/admin/rentals/locations/new?providerId=${provider}`
      : '/admin/rentals/locations/new'
  return (
    <AdminLayout
      title={named ? `${named} · Branches` : 'Branches'}
      active="rental-branches"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      {!portal && (
        <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/providers">
          ← Back to providers
        </a>
      )}
      <div className="page-head tw:mb-6">
        <h1>{providerName ? 'Branches' : 'All branches'}</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>
            {named ? `${named} - ` : ''}Branches ({rows.length})
          </h2>
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <a
              className="button secondary"
              href={
                provider && !portal
                  ? `/admin/rentals/working-hours?provider=${provider}`
                  : '/admin/rentals/working-hours'
              }
            >
              Working hours
            </a>
            {can('rentals.create') && (
              <a className="button primary" href={addHref}>
                + Add branch
              </a>
            )}
          </div>
        </div>
        <div className="table-scroll">
          <Table<Branch>
            className="cms-antd-table"
            rowKey="id"
            dataSource={rows}
            pagination={false}
            locale={{ emptyText: 'No branches yet. Add one so cars can be picked up there.' }}
            columns={[
              ...(can('rentals.update')
                ? [
                    {
                      title: 'Edit',
                      key: 'edit',
                      width: 70,
                      render: (_: unknown, row: Branch) => (
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
                title: 'Branch',
                key: 'branch',
                render: (_: unknown, row: Branch) => (
                  <div className="tw:flex tw:min-w-[200px] tw:flex-col">
                    <strong>{row.name_en}</strong>
                    <span className="tw:text-[12px] tw:text-brand-muted">{row.address ?? '—'}</span>
                  </div>
                ),
              },
              // One provider's page: its name is in the header, not repeated per row.
              ...(providerName
                ? []
                : [
                    {
                      title: 'Provider',
                      key: 'provider',
                      render: (_: unknown, row: Branch) => row.provider_name ?? '—',
                    },
                  ]),
              {
                title: 'Pickup place',
                key: 'place',
                render: (_: unknown, row: Branch) =>
                  row.place_name ?? <span className="tw:text-red-700">Not set</span>,
              },
              {
                title: 'Phone',
                key: 'phone',
                render: (_: unknown, row: Branch) => row.phone ?? '—',
              },
              {
                title: 'Hours',
                key: 'hours',
                render: (_: unknown, row: Branch) => (
                  <a href={`/admin/rentals/locations/${row.id}/hours`}>
                    {row.hours_enabled ? 'Set' : 'Any time'}
                  </a>
                ),
              },
              { title: 'Vehicles', dataIndex: 'vehicle_count', key: 'vehicles' },
              {
                title: 'Status',
                key: 'active',
                width: 90,
                render: (_: unknown, row: Branch) => (
                  <Switch
                    aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${row.name_en}`}
                    checked={row.active}
                    loading={busy === row.id}
                    disabled={!can('rentals.update') || busy !== null}
                    onChange={(active) =>
                      router.post(
                        `/admin/rentals/locations/${row.id}/status`,
                        { active, returnTo: here, _csrf: csrfToken },
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
              {
                title: 'Actions',
                key: 'more',
                width: 90,
                render: (_: unknown, row: Branch) => (
                  <RowActionMenu
                    label={`More actions for ${row.name_en}`}
                    actions={[
                      ...(can('rentals.update')
                        ? [
                            {
                              label: 'Working hours',
                              href: `/admin/rentals/locations/${row.id}/hours`,
                            },
                          ]
                        : []),
                      ...(can('rentals.delete')
                        ? [{ label: 'Delete', danger: true, onClick: () => setDeleting(row) }]
                        : []),
                    ]}
                  />
                ),
              },
            ]}
          />
        </div>
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete branch"
        message={`Delete ${deleting?.name_en ?? 'this branch'}? Branches with bookings cannot be deleted; deactivate them instead.`}
        action={deleting ? `/admin/rentals/locations/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
