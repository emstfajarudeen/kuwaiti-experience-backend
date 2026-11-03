import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import TableToolbar, { useServerFilters } from '../../components/table_toolbar'

type ActivityLog = {
  id: number
  action: string
  actionLabel: string
  entity_type: string
  entity_id: string | null
  entityName: string
  editUrl: string | null
  isDeleted: boolean
  actorName: string
  actorEmail: string | null
  created_at: string
}

type Props = {
  adminName: string
  csrfToken: string
  logs: ActivityLog[]
  filters: {
    q: string
    entity_type: string | null
  }
  meta: {
    page: number
    per_page: number
    total: number
    last_page: number
  }
}

const entityTypes = [
  { value: 'place', label: 'Places' },
  { value: 'category', label: 'Categories' },
  { value: 'category_type', label: 'Category Types' },
  { value: 'page', label: 'Pages' },
  { value: 'contact', label: 'Contact Requests' },
  { value: 'user', label: 'Staff' },
  { value: 'role', label: 'Roles' },
  { value: 'home_content', label: 'Homepage' },
  { value: 'site_settings', label: 'Settings' },
]

export default function ActivityLogsIndex({ adminName, csrfToken, logs, filters, meta }: Props) {
  const serverFilters = useServerFilters(
    '/admin/activity-logs',
    { q: filters.q || '', entity_type: filters.entity_type || '' },
    { q: '', entity_type: '' }
  )

  function goToPage(targetPage: number) {
    const query = new URLSearchParams(window.location.search)
    query.set('page', String(targetPage))
    router.visit(`/admin/activity-logs?${query.toString()}`)
  }

  return (
    <AdminLayout
      title="Activity Logs"
      active="activity-logs"
      adminName={adminName}
      csrfToken={csrfToken}
    >
      {/* Header */}
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
        <div>
          <h1 className="tw:text-2xl tw:font-bold tw:tracking-tight tw:text-brand-ink">
            Activity Logs
          </h1>
        </div>
        <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:bg-brand-surface-subtle tw:border tw:border-brand-line tw:px-3 tw:py-1 tw:text-xs tw:font-semibold tw:text-brand-ink">
          {meta.total} {meta.total === 1 ? 'event' : 'events'} recorded
        </span>
      </div>

      {/* Logs Table / List Panel */}
      <section className="panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-sm">
        <div className="panel-heading tw:flex tw:items-center tw:justify-between tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-4">
          <h2 className="tw:text-base tw:font-bold tw:text-brand-ink">Audit Trail</h2>
          <span className="tw:text-xs tw:text-brand-muted">
            Page {meta.page} of {meta.last_page}
          </span>
        </div>

        <TableToolbar
          search={{
            label: 'Search activity logs',
            placeholder: 'Search action, actor or entity ID',
            value: serverFilters.values.q,
            onChange: (value) => serverFilters.setSearch('q', value),
          }}
          selects={[
            {
              key: 'entity_type',
              value: serverFilters.values.entity_type,
              placeholder: 'All entity types',
              onChange: (value) => serverFilters.setSelect('entity_type', value),
              options: entityTypes,
            },
          ]}
          active={serverFilters.active}
          onReset={serverFilters.reset}
        />
        {logs.length > 0 ? (
          <div className="activity-list tw:divide-y tw:divide-brand-line-subtle">
            {logs.map((log) => (
              <div
                key={log.id}
                className="tw:flex tw:flex-col sm:tw:flex-row sm:tw:items-center tw:justify-between tw:gap-4 tw:px-6 tw:py-4 hover:tw:bg-brand-surface-subtle/50 tw:transition-colors"
              >
                <div className="tw:flex tw:items-center tw:gap-3.5 tw:min-w-0">
                  <span
                    className="activity-icon tw:size-9 tw:rounded-full tw:bg-brand-navy-surface tw:text-brand-navy tw:flex tw:items-center tw:justify-center tw:text-sm tw:shrink-0"
                    aria-hidden="true"
                  >
                    ✎
                  </span>
                  <div className="tw:flex tw:flex-col tw:min-w-0">
                    <div className="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
                      <strong className="tw:text-sm tw:font-bold tw:text-brand-ink">
                        {log.actionLabel}
                      </strong>
                      <span className="tw:rounded-full tw:bg-brand-surface-subtle tw:border tw:border-brand-line tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
                        {log.entity_type}
                      </span>
                    </div>
                    <div className="tw:mt-0.5 tw:text-xs tw:text-brand-muted tw:truncate">
                      {log.editUrl && !log.isDeleted ? (
                        <a
                          href={log.editUrl}
                          className="tw:font-medium tw:text-brand-navy hover:tw:underline"
                        >
                          {log.entityName}
                        </a>
                      ) : (
                        <span>
                          {log.entityName}
                          {log.isDeleted && (
                            <span className="tw:ml-1.5 tw:inline-block tw:rounded tw:bg-rose-50 tw:border tw:border-rose-200 tw:px-1.5 tw:py-0.2 tw:text-[10px] tw:font-bold tw:text-rose-700">
                              Deleted
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="tw:flex sm:tw:flex-col sm:tw:items-end tw:justify-between tw:shrink-0 tw:gap-1 tw:text-xs">
                  <span className="tw:font-semibold tw:text-brand-ink">{log.actorName}</span>
                  <time className="tw:text-brand-muted">{log.created_at}</time>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="tw:p-12 tw:text-center tw:text-brand-muted">
            <span className="tw:text-3xl tw:mb-2 tw:block">📋</span>
            <p className="tw:m-0 tw:text-sm">
              No activity logs found matching the selected filters.
            </p>
          </div>
        )}

        {/* Pagination footer */}
        {meta.last_page > 1 && (
          <div className="tw:flex tw:items-center tw:justify-between tw:border-t tw:border-brand-line-subtle tw:bg-brand-surface-subtle/30 tw:px-6 tw:py-3.5">
            <button
              type="button"
              disabled={meta.page <= 1}
              onClick={() => goToPage(meta.page - 1)}
              className="button secondary tw:min-h-8 tw:px-3 tw:py-1 tw:text-xs disabled:tw:opacity-50 disabled:tw:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="tw:text-xs tw:font-medium tw:text-brand-muted">
              Page {meta.page} of {meta.last_page}
            </span>
            <button
              type="button"
              disabled={meta.page >= meta.last_page}
              onClick={() => goToPage(meta.page + 1)}
              className="button secondary tw:min-h-8 tw:px-3 tw:py-1 tw:text-xs disabled:tw:opacity-50 disabled:tw:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </AdminLayout>
  )
}
