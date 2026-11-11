import { useState } from 'react'
import { Select, Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import { useCan, usePortal, type SharedProps } from '../../components/rental_ui'

type Driver = {
  id: number
  name: string
  phone: string | null
  photo_url: string | null
  provider_name: string
  active: boolean
  upcoming_count: number
}

type Props = SharedProps & {
  provider: string
  providers: { value: string; label: string }[]
  rows: Driver[]
}

export default function RentalDrivers({
  adminName,
  csrfToken,
  success,
  error,
  provider,
  providers,
  rows,
}: Props) {
  const can = useCan()
  // Provider portal: the whole page is the provider's own, so no provider name or filter.
  const portal = usePortal()
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Driver | null>(null)
  const here =
    typeof window === 'undefined' ? '' : window.location.pathname + window.location.search
  const providerName = portal ? '' : providers.find((option) => option.value === provider)?.label
  const addHref =
    provider && !portal
      ? `/admin/rentals/drivers/new?providerId=${provider}`
      : '/admin/rentals/drivers/new'
  return (
    <AdminLayout
      title={providerName ? `${providerName} · Drivers` : 'Drivers'}
      active="rental-drivers"
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
        <h1>Drivers</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <div className="tw:flex tw:flex-col tw:gap-1">
            <h2>
              {providerName ? `${providerName} - ` : ''}Drivers ({rows.length})
            </h2>
            <span className="tw:text-[13px] tw:text-brand-muted">
              Assign a driver on each with-driver booking. The customer sees the driver&apos;s name,
              photo and phone in the app.
            </span>
          </div>
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            {!portal && (
              <Select
                className="tw:min-w-[200px]"
                value={provider || undefined}
                allowClear
                placeholder="All providers"
                options={providers}
                onChange={(value) =>
                  router.get('/admin/rentals/drivers', value ? { provider: value } : {})
                }
              />
            )}
            {can('rentals.create') && (
              <a className="button primary" href={addHref}>
                + Add driver
              </a>
            )}
          </div>
        </div>
        <div className="table-scroll">
          <Table<Driver>
            className="cms-antd-table"
            rowKey="id"
            dataSource={rows}
            pagination={false}
            locale={{
              emptyText: 'No drivers yet. Add the drivers who drive your with-driver rentals.',
            }}
            columns={[
              ...(can('rentals.update')
                ? [
                    {
                      title: 'Edit',
                      key: 'edit',
                      width: 70,
                      render: (_: unknown, row: Driver) => (
                        <a
                          href={`/admin/rentals/drivers/${row.id}/edit`}
                          className="action-pencil-btn"
                          aria-label={`Edit ${row.name}`}
                        >
                          ✎
                        </a>
                      ),
                    },
                  ]
                : []),
              {
                title: 'Driver',
                key: 'driver',
                render: (_: unknown, row: Driver) => (
                  <div className="tw:flex tw:min-w-[200px] tw:items-center tw:gap-3">
                    {row.photo_url ? (
                      <img
                        src={row.photo_url}
                        alt=""
                        className="tw:size-10 tw:rounded-full tw:object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="tw:grid tw:size-10 tw:place-items-center tw:rounded-full tw:bg-brand-navy tw:text-[14px] tw:font-bold tw:text-white"
                      >
                        {row.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <strong>{row.name}</strong>
                  </div>
                ),
              },
              ...(providerName || portal
                ? []
                : [
                    {
                      title: 'Provider',
                      key: 'provider',
                      render: (_: unknown, row: Driver) => row.provider_name,
                    },
                  ]),
              {
                title: 'Phone',
                key: 'phone',
                render: (_: unknown, row: Driver) => (
                  <span className="tw:whitespace-nowrap">{row.phone ?? '—'}</span>
                ),
              },
              {
                title: 'Upcoming trips',
                key: 'upcoming',
                render: (_: unknown, row: Driver) => row.upcoming_count,
              },
              {
                title: 'Status',
                key: 'active',
                width: 90,
                render: (_: unknown, row: Driver) => (
                  <Switch
                    aria-label={`${row.active ? 'Turn off' : 'Turn on'} ${row.name}`}
                    checked={row.active}
                    loading={busy === row.id}
                    disabled={!can('rentals.update') || busy !== null}
                    onChange={(active) =>
                      router.post(
                        `/admin/rentals/drivers/${row.id}/status`,
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
              ...(can('rentals.delete')
                ? [
                    {
                      title: '',
                      key: 'more',
                      width: 90,
                      render: (_: unknown, row: Driver) => (
                        <RowActionMenu
                          label={`More actions for ${row.name}`}
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
        title="Delete driver"
        message={`Delete ${deleting?.name ?? 'this driver'}? Drivers who were assigned to bookings cannot be deleted; turn them off instead.`}
        action={deleting ? `/admin/rentals/drivers/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
