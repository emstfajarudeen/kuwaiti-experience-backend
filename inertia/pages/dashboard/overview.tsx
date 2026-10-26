import AdminLayout from '../../layouts/admin_layout'

type PlaceType = {
  code: string
  name: string
  count: number
}

type RecentEvent = {
  id: number
  actionLabel: string
  entityName: string
  editUrl: string | null
  isDeleted: boolean
  created_at: string
}

type Props = {
  adminName: string
  csrfToken: string
  totalPlaces: number
  publishedCount: number
  draftCount: number
  archivedCount: number
  newContactsCount: number
  typeBreakdown: PlaceType[]
  recent: RecentEvent[]
  visibility: { places: boolean; contacts: boolean; types: boolean; audit: boolean }
  permissions: string[]
}

const quickTasks = [
  { href: '/admin/places/new', label: 'Add new place', permission: 'places.create' },
  { href: '/admin/places', label: 'Places', permission: 'places.view' },
  { href: '/admin/category-types', label: 'Category types', permission: 'category_types.view' },
  { href: '/admin/categories', label: 'Categories', permission: 'categories.view' },
  { href: '/admin/place-features', label: 'Place features', permission: 'place_features.view' },
  { href: '/admin/contact-requests', label: 'Contact inbox', permission: 'contact_requests.view' },
  { href: '/admin/settings', label: 'Settings', permission: 'settings.view' },
] as const

export default function Overview({
  adminName,
  csrfToken,
  totalPlaces,
  publishedCount,
  draftCount,
  archivedCount,
  newContactsCount,
  typeBreakdown,
  recent,
  visibility,
  permissions: permissionList,
}: Props) {
  const permissions = new Set(permissionList)
  return (
    <AdminLayout title="Overview" active="dashboard" adminName={adminName} csrfToken={csrfToken}>
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div>
          <h1>Overview</h1>
        </div>
      </div>

      {visibility.places && <div className="overview-stats tw:mb-6 tw:grid tw:grid-cols-4 tw:gap-4 tw:max-[1024px]:grid-cols-2 tw:max-[600px]:grid-cols-1 tw:max-[600px]:[grid-template-columns:1fr] tw:max-[1024px]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] tw:[display:grid] tw:[grid-template-columns:repeat(4,_minmax(0,_1fr))] tw:[gap:var(--space-4)] tw:[margin-bottom:var(--space-6)]">
        <a
          href="/admin/places"
          className="stat-card accent tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-gold-border tw:bg-[linear-gradient(180deg,#fff_0%,var(--gold-subtle)_100%)] tw:p-5 tw:shadow-sm tw:transition-all tw:hover:-translate-y-0.5 tw:hover:shadow-md tw:[background:var(--surface)] tw:[border:1px_solid_var(--line)] tw:[border-radius:var(--radius-lg)] tw:[padding:var(--space-5)] tw:[box-shadow:var(--shadow-sm)] tw:[display:flex] tw:[flex-direction:column] tw:[position:relative] tw:[overflow:hidden] tw:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease]"
        >
          <span className="stat-label tw:[font-size:11px] tw:[font-weight:700] tw:[letter-spacing:0.12em] tw:[color:var(--muted)] tw:[text-transform:uppercase]">
            Total Places
          </span>
          <strong className="stat-value tw:[font-size:34px] tw:[line-height:1.1] tw:[font-weight:700] tw:[color:var(--ink)] tw:[margin:var(--space-3)_0_var(--space-2)]">
            {totalPlaces}
          </strong>
        </a>
        <a
          href="/admin/places?status=published"
          className="stat-card tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all tw:hover:-translate-y-0.5 tw:hover:shadow-md tw:[background:var(--surface)] tw:[border:1px_solid_var(--line)] tw:[border-radius:var(--radius-lg)] tw:[padding:var(--space-5)] tw:[box-shadow:var(--shadow-sm)] tw:[display:flex] tw:[flex-direction:column] tw:[position:relative] tw:[overflow:hidden] tw:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease]"
        >
          <span className="stat-label tw:[font-size:11px] tw:[font-weight:700] tw:[letter-spacing:0.12em] tw:[color:var(--muted)] tw:[text-transform:uppercase]">
            Published
          </span>
          <strong className="stat-value tw:my-3 tw:text-[34px] tw:font-bold tw:leading-[1.1] tw:text-brand-success-text tw:[font-size:34px] tw:[line-height:1.1] tw:[font-weight:700] tw:[color:var(--ink)] tw:[margin:var(--space-3)_0_var(--space-2)]">
            {publishedCount}
          </strong>
        </a>
        <a
          href="/admin/places?status=draft"
          className="stat-card tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all tw:hover:-translate-y-0.5 tw:hover:shadow-md tw:[background:var(--surface)] tw:[border:1px_solid_var(--line)] tw:[border-radius:var(--radius-lg)] tw:[padding:var(--space-5)] tw:[box-shadow:var(--shadow-sm)] tw:[display:flex] tw:[flex-direction:column] tw:[position:relative] tw:[overflow:hidden] tw:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease]"
        >
          <span className="stat-label tw:[font-size:11px] tw:[font-weight:700] tw:[letter-spacing:0.12em] tw:[color:var(--muted)] tw:[text-transform:uppercase]">
            Drafts
          </span>
          <strong className="stat-value tw:my-3 tw:text-[34px] tw:font-bold tw:leading-[1.1] tw:text-brand-warning-text tw:[font-size:34px] tw:[line-height:1.1] tw:[font-weight:700] tw:[color:var(--ink)] tw:[margin:var(--space-3)_0_var(--space-2)]">
            {draftCount}
          </strong>
        </a>
        <a
          href="/admin/places?status=archived"
          className="stat-card tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all tw:hover:-translate-y-0.5 tw:hover:shadow-md tw:[background:var(--surface)] tw:[border:1px_solid_var(--line)] tw:[border-radius:var(--radius-lg)] tw:[padding:var(--space-5)] tw:[box-shadow:var(--shadow-sm)] tw:[display:flex] tw:[flex-direction:column] tw:[position:relative] tw:[overflow:hidden] tw:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease]"
        >
          <span className="stat-label tw:[font-size:11px] tw:[font-weight:700] tw:[letter-spacing:0.12em] tw:[color:var(--muted)] tw:[text-transform:uppercase]">
            Archived
          </span>
          <strong className="stat-value tw:my-3 tw:text-[34px] tw:font-bold tw:leading-[1.1] tw:text-brand-danger-text tw:[font-size:34px] tw:[line-height:1.1] tw:[font-weight:700] tw:[color:var(--ink)] tw:[margin:var(--space-3)_0_var(--space-2)]">
            {archivedCount}
          </strong>
        </a>
      </div>}

      {(visibility.places || visibility.contacts) && <div className="attention-grid tw:mb-6 tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1 tw:max-[900px]:[grid-template-columns:1fr] tw:[display:grid] tw:[grid-template-columns:repeat(2,_minmax(0,_1fr))] tw:[gap:var(--space-4)] tw:[margin-bottom:var(--space-6)]">
        {visibility.places && <div className={`attention-card${draftCount > 0 ? ' urgent' : ''} tw:[background:var(--surface)] tw:[border:1px_solid_var(--line)] tw:[border-left:4px_solid_var(--gold)] tw:[border-radius:var(--radius)] tw:[padding:var(--space-4)_var(--space-5)] tw:[box-shadow:var(--shadow-sm)] tw:[display:flex] tw:[align-items:center] tw:[justify-content:space-between] tw:[gap:var(--space-4)]`}>
          <div className="attention-content"><h3>Draft Places</h3><p>{draftCount} {draftCount === 1 ? 'place' : 'places'} in draft mode</p></div>
          <div className="tw:flex tw:items-center tw:gap-3"><span className="attention-badge tw:[font-size:20px] tw:[font-weight:700] tw:[color:var(--navy)] tw:[background:var(--navy-surface)] tw:[padding:4px_12px] tw:[border-radius:var(--radius-sm)] tw:[min-width:38px] tw:[text-align:center]">{draftCount}</span><a href="/admin/places?status=draft" className="button secondary tw:min-h-9 tw:px-3.5 tw:py-1.5">Review drafts</a></div>
        </div>}
        {visibility.contacts && <div className={`attention-card${newContactsCount > 0 ? ' urgent' : ''} tw:[background:var(--surface)] tw:[border:1px_solid_var(--line)] tw:[border-left:4px_solid_var(--gold)] tw:[border-radius:var(--radius)] tw:[padding:var(--space-4)_var(--space-5)] tw:[box-shadow:var(--shadow-sm)] tw:[display:flex] tw:[align-items:center] tw:[justify-content:space-between] tw:[gap:var(--space-4)]`}>
          <div className="attention-content"><h3>Contact Requests</h3><p>{newContactsCount} new {newContactsCount === 1 ? 'message' : 'messages'}</p></div>
          <div className="tw:flex tw:items-center tw:gap-3"><span className="attention-badge tw:[font-size:20px] tw:[font-weight:700] tw:[color:var(--navy)] tw:[background:var(--navy-surface)] tw:[padding:4px_12px] tw:[border-radius:var(--radius-sm)] tw:[min-width:38px] tw:[text-align:center]">{newContactsCount}</span><a href="/admin/contact-requests" className="button secondary tw:min-h-9 tw:px-3.5 tw:py-1.5">View inbox</a></div>
        </div>}
      </div>}

      {visibility.types && typeBreakdown.length > 0 && (
        <section className="panel type-chips-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:[padding:var(--space-4)_var(--space-6)] tw:[margin-bottom:var(--space-6)]">
          <div className="tw:mb-3 tw:flex tw:items-center tw:justify-between">
            <h2 className="tw:m-0 tw:text-base">Place types</h2>
            <a
              href="/admin/category-types"
              className="text-button tw:text-[13px] tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:8px_12px] tw:[background:transparent] tw:[border:none] tw:[color:var(--navy)] tw:[font-size:14px] tw:[font-weight:600] tw:[cursor:pointer] tw:[border-radius:var(--radius-sm)] tw:[transition:all_0.15s_ease]"
            >
              Manage types
            </a>
          </div>
          <div className="type-chips-grid tw:[display:flex] tw:[flex-wrap:wrap] tw:[gap:var(--space-2)] tw:[margin-top:var(--space-3)]">
            {typeBreakdown.map((type) => (
              <a
                key={type.code}
                href={`/admin/places?type=${encodeURIComponent(type.code)}`}
                className="type-chip tw:[display:inline-flex] tw:[align-items:center] tw:[gap:8px] tw:[padding:6px_14px] tw:[border-radius:var(--radius-full)] tw:[background:var(--surface-subtle)] tw:[border:1px_solid_var(--line)] tw:[font-size:13px] tw:[font-weight:600] tw:[color:var(--ink-secondary)] tw:[transition:all_0.15s_ease]"
              >
                <span>{type.name}</span>
                <span className="type-chip-count tw:[font-size:11px] tw:[font-weight:700] tw:[background:var(--surface)] tw:[border:1px_solid_var(--line)] tw:[padding:2px_6px] tw:[border-radius:var(--radius-full)]">
                  {type.count}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <div className="content-grid tw:grid tw:[grid-template-columns:minmax(0,1.6fr)_minmax(300px,1fr)] tw:gap-6 tw:max-[1024px]:grid-cols-1">
        {visibility.audit && <section className="panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)]">
          <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
            <h2>Latest activity</h2>
          </div>
          {recent.length > 0 ? (
            <div className="activity-list tw:[padding:0]">
              {recent.map((event) => (
                <div
                  key={event.id}
                  className="activity-item tw:[display:flex] tw:[align-items:center] tw:[gap:var(--space-3)] tw:[padding:var(--space-4)_var(--space-6)] tw:[border-bottom:1px_solid_var(--line-subtle)] tw:[transition:background_0.15s_ease]"
                >
                  <span
                    className="activity-icon tw:[width:36px] tw:[height:36px] tw:[border-radius:var(--radius-full)] tw:[background:var(--navy-surface)] tw:[color:var(--navy)] tw:[display:grid] tw:[place-items:center] tw:[font-size:14px] tw:[flex-shrink:0]"
                    aria-hidden="true"
                  >
                    ✎
                  </span>
                  <div className="activity-info tw:[display:flex] tw:[flex-direction:column] tw:[min-width:0] tw:[flex-grow:1]">
                    <strong>{event.actionLabel}</strong>
                    <small>
                      {event.editUrl && !event.isDeleted ? (
                        <a href={event.editUrl}>{event.entityName}</a>
                      ) : (
                        <>
                          <span className="tw:text-brand-ink-secondary">{event.entityName}</span>
                          {event.isDeleted && (
                            <span className="status archived tw:ml-1.5 tw:px-1.5 tw:py-0.5 tw:text-[10px] tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:4px_10px] tw:[border-radius:var(--radius-full)] tw:[font-size:12px] tw:[font-weight:700] tw:[text-transform:capitalize] tw:[letter-spacing:0.02em] tw:[border:1px_solid_transparent] tw:[line-height:1.2]">
                              Deleted
                            </span>
                          )}
                        </>
                      )}
                    </small>
                  </div>
                  <time className="activity-time tw:[margin-left:auto] tw:[color:var(--muted)] tw:[font-size:12px] tw:[white-space:nowrap]">
                    {event.created_at}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state tw:[padding:var(--space-10)_var(--space-6)] tw:[text-align:center] tw:[color:var(--muted)] tw:[display:flex] tw:[flex-direction:column] tw:[align-items:center] tw:[gap:var(--space-3)]">
              <p>No recent activity recorded.</p>
            </div>
          )}
        </section>}

        <section className="panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)]">
          <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
            <h2>Quick tasks</h2>
          </div>
          <div className="quick-links-group tw:[display:flex] tw:[flex-direction:column] tw:[gap:var(--space-2)] tw:[padding:var(--space-5)_var(--space-6)]">
            {quickTasks.filter((task) => permissions.has(task.permission)).map((task) => (
              <a
                key={task.href}
                href={task.href}
                className="quick-link-item tw:[display:flex] tw:[align-items:center] tw:[justify-content:space-between] tw:[padding:10px_14px] tw:[border-radius:var(--radius-sm)] tw:[background:var(--surface-subtle)] tw:[border:1px_solid_var(--line-subtle)] tw:[font-size:13px] tw:[font-weight:600] tw:[color:var(--ink)] tw:[transition:all_0.15s_ease]"
              >
                <span>{task.label}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </AdminLayout>
  )
}
