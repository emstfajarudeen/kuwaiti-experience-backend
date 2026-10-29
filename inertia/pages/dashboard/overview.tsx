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

type TopCategory = {
  name: string
  slug: string
  count: number
}

type Analytics = {
  featuredCount: number
  geocodedCount: number
  geocodedRate: number
  publishedRate: number
  draftRate: number
  archivedRate: number
  totalContacts: number
  resolvedContacts: number
  contactsResolutionRate: number
  totalCustomers: number
  verifiedCustomers: number
  activeCategories: number
  topCategories: TopCategory[]
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
  visibility: {
    places: boolean
    contacts: boolean
    types: boolean
    audit: boolean
    customers?: boolean
    categories?: boolean
  }
  analytics?: Analytics
  permissions: string[]
}

export default function Overview({
  adminName,
  csrfToken,
  totalPlaces,
  publishedCount,
  draftCount,
  archivedCount,
  newContactsCount,
  visibility,
  analytics,
}: Props) {
  const publishedRate =
    analytics?.publishedRate ??
    (totalPlaces > 0 ? Math.round((publishedCount / totalPlaces) * 100) : 0)
  const draftRate =
    analytics?.draftRate ?? (totalPlaces > 0 ? Math.round((draftCount / totalPlaces) * 100) : 0)
  const archivedRate =
    analytics?.archivedRate ??
    (totalPlaces > 0 ? Math.round((archivedCount / totalPlaces) * 100) : 0)
  const totalCustomers = analytics?.totalCustomers ?? 0
  const verifiedCustomers = analytics?.verifiedCustomers ?? 0
  const activeCategories = analytics?.activeCategories ?? 0
  const featuredCount = analytics?.featuredCount ?? 0
  const geocodedCount = analytics?.geocodedCount ?? 0
  const geocodedRate = analytics?.geocodedRate ?? 0
  const totalContacts = analytics?.totalContacts ?? newContactsCount
  const resolvedContacts = analytics?.resolvedContacts ?? 0
  const contactsResolutionRate = analytics?.contactsResolutionRate ?? 0
  const topCategories = analytics?.topCategories ?? []
  const maxCategoryCount =
    topCategories.length > 0 ? Math.max(...topCategories.map((c) => c.count), 1) : 1

  return (
    <AdminLayout title="Overview" active="dashboard" adminName={adminName} csrfToken={csrfToken}>
      {/* Header Banner */}
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
        <div>
          <h1 className="tw:text-2xl tw:font-bold tw:tracking-tight tw:text-brand-ink">
            Executive Overview
          </h1>
        </div>
      </div>
      {/* KPI Cards Grid */}
      <div className="overview-stats tw:mb-6 tw:grid tw:grid-cols-3 tw:gap-4 tw:max-[900px]:grid-cols-1">
        {/* Total Places */}
        {visibility.places && (
          <a
            href="/admin/places"
            className="stat-card accent tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-gold-border tw:bg-[linear-gradient(180deg,#fff_0%,var(--gold-subtle)_100%)] tw:p-5 tw:shadow-sm tw:transition-all hover:tw:-translate-y-0.5 hover:tw:shadow-md"
          >
            <span className="stat-label tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
              Total Places
            </span>
            <strong className="stat-value tw:my-2 tw:text-3xl tw:font-bold tw:leading-none tw:text-brand-ink">
              {totalPlaces}
            </strong>
            <span className="tw:text-[11px] tw:font-medium tw:text-brand-gold-deep">
              {publishedRate}% live catalog
            </span>
          </a>
        )}

        {/* Active Places */}
        {visibility.places && (
          <a
            href="/admin/places?status=published"
            className="stat-card tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all hover:tw:-translate-y-0.5 hover:tw:shadow-md"
          >
            <span className="stat-label tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
              Published
            </span>
            <strong className="stat-value tw:my-2 tw:text-3xl tw:font-bold tw:leading-none tw:text-brand-success-text">
              {publishedCount}
            </strong>
            <span className="tw:text-[11px] tw:font-medium tw:text-brand-muted">
              Live on app & web
            </span>
          </a>
        )}

        {/* Drafts */}
        {visibility.places && (
          <a
            href="/admin/places?status=draft"
            className="stat-card tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all hover:tw:-translate-y-0.5 hover:tw:shadow-md"
          >
            <span className="stat-label tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
              Drafts
            </span>
            <strong className="stat-value tw:my-2 tw:text-3xl tw:font-bold tw:leading-none tw:text-brand-warning-text">
              {draftCount}
            </strong>
            <span className="tw:text-[11px] tw:font-medium tw:text-brand-muted">
              Awaiting review
            </span>
          </a>
        )}

        {/* Inactive */}
        {visibility.places && (
          <a
            href="/admin/places?status=archived"
            className="stat-card tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all hover:tw:-translate-y-0.5 hover:tw:shadow-md"
          >
            <span className="stat-label tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
              Inactive
            </span>
            <strong className="stat-value tw:my-2 tw:text-3xl tw:font-bold tw:leading-none tw:text-brand-danger-text">
              {archivedCount}
            </strong>
            <span className="tw:text-[11px] tw:font-medium tw:text-brand-muted">
              Archived records
            </span>
          </a>
        )}

        {/* App Users */}
        <a
          href="/admin/customers"
          className="stat-card tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all hover:tw:-translate-y-0.5 hover:tw:shadow-md"
        >
          <span className="stat-label tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
            App Members
          </span>
          <strong className="stat-value tw:my-2 tw:text-3xl tw:font-bold tw:leading-none tw:text-brand-navy">
            {totalCustomers}
          </strong>
          <span className="tw:text-[11px] tw:font-medium tw:text-brand-muted">
            {verifiedCustomers} verified
          </span>
        </a>

        {/* Active Categories */}
        <a
          href="/admin/categories"
          className="stat-card tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all hover:tw:-translate-y-0.5 hover:tw:shadow-md"
        >
          <span className="stat-label tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
            Categories
          </span>
          <strong className="stat-value tw:my-2 tw:text-3xl tw:font-bold tw:leading-none tw:text-brand-ink">
            {activeCategories}
          </strong>
          <span className="tw:text-[11px] tw:font-medium tw:text-brand-muted">
            Active taxonomies
          </span>
        </a>
      </div>

      {/* Action / Attention Items */}
      {(visibility.places || visibility.contacts) && (
        <div className="attention-grid tw:mb-6 tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
          {visibility.places && (
            <div
              className={`attention-card group tw:relative tw:flex tw:items-center tw:justify-between tw:gap-4 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all tw:duration-150 hover:-tw:translate-y-0.5 hover:tw:shadow-md hover:tw:border-brand-line-strong ${
                draftCount > 0
                  ? 'tw:border-l-4 tw:border-l-brand-gold'
                  : 'tw:border-l-4 tw:border-l-brand-line-strong'
              }`}
            >
              <div className="tw:flex tw:items-center tw:gap-3.5 tw:min-w-0">
                <div
                  className={`tw:flex tw:size-11 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-xl tw:transition-transform group-hover:tw:scale-105 ${
                    draftCount > 0
                      ? 'tw:bg-brand-gold-subtle tw:text-brand-gold-deep tw:border tw:border-brand-gold-border/70'
                      : 'tw:bg-brand-surface-subtle tw:text-brand-muted tw:border tw:border-brand-line'
                  }`}
                  aria-hidden="true"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </div>
                <div className="tw:min-w-0">
                  <h3 className="tw:m-0 tw:text-sm tw:font-bold tw:text-brand-ink">Draft Places</h3>
                  <p className="tw:m-0 tw:mt-0.5 tw:text-xs tw:text-brand-muted">
                    Places in draft mode
                  </p>
                </div>
              </div>
              <div className="tw:flex tw:items-center tw:gap-3 tw:shrink-0">
                <span
                  className={`tw:inline-flex tw:min-w-9 tw:h-9 tw:items-center tw:justify-center tw:rounded-cms-sm tw:px-3 tw:text-base tw:font-bold ${
                    draftCount > 0
                      ? 'tw:bg-brand-warning-bg tw:border tw:border-brand-warning-border tw:text-brand-warning-text'
                      : 'tw:bg-brand-surface-subtle tw:border tw:border-brand-line tw:text-brand-muted'
                  }`}
                >
                  {draftCount}
                </span>
                <a
                  href="/admin/places?status=draft"
                  className="button secondary tw:min-h-9 tw:px-4 tw:py-1.5 tw:text-xs tw:font-semibold tw:gap-1.5 group-hover:tw:border-brand-navy group-hover:tw:text-brand-navy"
                >
                  <span>Review drafts</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="tw:transition-transform group-hover:tw:translate-x-0.5"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </a>
              </div>
            </div>
          )}
          {visibility.contacts && (
            <div
              className={`attention-card group tw:relative tw:flex tw:items-center tw:justify-between tw:gap-4 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all tw:duration-150 hover:-tw:translate-y-0.5 hover:tw:shadow-md hover:tw:border-brand-line-strong ${
                newContactsCount > 0
                  ? 'tw:border-l-4 tw:border-l-brand-navy'
                  : 'tw:border-l-4 tw:border-l-brand-line-strong'
              }`}
            >
              <div className="tw:flex tw:items-center tw:gap-3.5 tw:min-w-0">
                <div
                  className={`tw:flex tw:size-11 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-xl tw:transition-transform group-hover:tw:scale-105 ${
                    newContactsCount > 0
                      ? 'tw:bg-brand-navy-surface tw:text-brand-navy tw:border tw:border-brand-navy-subtle/30'
                      : 'tw:bg-brand-surface-subtle tw:text-brand-muted tw:border tw:border-brand-line'
                  }`}
                  aria-hidden="true"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
                <div className="tw:min-w-0">
                  <h3 className="tw:m-0 tw:text-sm tw:font-bold tw:text-brand-ink">
                    Contact Requests
                  </h3>
                  <p className="tw:m-0 tw:mt-0.5 tw:text-xs tw:text-brand-muted">New messages</p>
                </div>
              </div>
              <div className="tw:flex tw:items-center tw:gap-3 tw:shrink-0">
                <span
                  className={`tw:inline-flex tw:min-w-9 tw:h-9 tw:items-center tw:justify-center tw:rounded-cms-sm tw:px-3 tw:text-base tw:font-bold ${
                    newContactsCount > 0
                      ? 'tw:bg-brand-navy-surface tw:border tw:border-brand-navy-subtle/30 tw:text-brand-navy'
                      : 'tw:bg-brand-surface-subtle tw:border tw:border-brand-line tw:text-brand-muted'
                  }`}
                >
                  {newContactsCount}
                </span>
                <a
                  href="/admin/contact-requests"
                  className="button secondary tw:min-h-9 tw:px-4 tw:py-1.5 tw:text-xs tw:font-semibold tw:gap-1.5 group-hover:tw:border-brand-navy group-hover:tw:text-brand-navy"
                >
                  <span>View inbox</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="tw:transition-transform group-hover:tw:translate-x-0.5"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analytics & Insights 3-Column Panels */}
      <div className="analytics-grid tw:mb-6 tw:grid tw:grid-cols-3 tw:gap-6 tw:max-[1024px]:grid-cols-1">
        {/* Panel 1: Content Publication & Catalog Health */}
        <div className="tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm">
          <div className="tw:mb-4 tw:flex tw:items-center tw:justify-between">
            <h2 className="tw:m-0 tw:text-base tw:font-bold tw:text-brand-ink">Catalog Health</h2>
            <span className="tw:text-xs tw:font-semibold tw:text-brand-muted">
              {totalPlaces} total
            </span>
          </div>

          {/* Publication Distribution Progress Bar */}
          <div className="tw:mb-3">
            <div className="tw:mb-1.5 tw:flex tw:justify-between tw:text-xs">
              <span className="tw:font-medium tw:text-brand-ink">Publication Ratio</span>
              <span className="tw:font-bold tw:text-brand-success-text">{publishedRate}% Live</span>
            </div>
            <div className="tw:flex tw:h-3 tw:w-full tw:overflow-hidden tw:rounded-full tw:bg-brand-surface-subtle tw:border tw:border-brand-line">
              <div
                style={{ width: `${publishedRate}%` }}
                className="tw:bg-brand-success-text tw:transition-all tw:duration-500"
                title={`Published: ${publishedCount} (${publishedRate}%)`}
              />
              <div
                style={{ width: `${draftRate}%` }}
                className="tw:bg-brand-gold tw:transition-all tw:duration-500"
                title={`Draft: ${draftCount} (${draftRate}%)`}
              />
              <div
                style={{ width: `${archivedRate}%` }}
                className="tw:bg-brand-danger-border tw:transition-all tw:duration-500"
                title={`Archived: ${archivedCount} (${archivedRate}%)`}
              />
            </div>
          </div>

          {/* Legend items */}
          <div className="tw:grid tw:grid-cols-3 tw:gap-2 tw:pt-2 tw:border-t tw:border-brand-line-subtle tw:text-xs">
            <div className="tw:flex tw:flex-col">
              <span className="tw:flex tw:items-center tw:gap-1.5 tw:text-brand-muted">
                <span className="tw:size-2 tw:rounded-full tw:bg-brand-success-text" /> Published
              </span>
              <span className="tw:font-bold tw:text-brand-ink tw:mt-0.5">{publishedCount}</span>
            </div>
            <div className="tw:flex tw:flex-col">
              <span className="tw:flex tw:items-center tw:gap-1.5 tw:text-brand-muted">
                <span className="tw:size-2 tw:rounded-full tw:bg-brand-gold" /> Drafts
              </span>
              <span className="tw:font-bold tw:text-brand-ink tw:mt-0.5">{draftCount}</span>
            </div>
            <div className="tw:flex tw:flex-col">
              <span className="tw:flex tw:items-center tw:gap-1.5 tw:text-brand-muted">
                <span className="tw:size-2 tw:rounded-full tw:bg-brand-danger-border" /> Inactive
              </span>
              <span className="tw:font-bold tw:text-brand-ink tw:mt-0.5">{archivedCount}</span>
            </div>
          </div>

          {/* Quality & Enrichment metrics */}
          <div className="tw:mt-4 tw:space-y-2.5 tw:border-t tw:border-brand-line-subtle tw:pt-4">
            <div className="tw:flex tw:items-center tw:justify-between tw:text-xs">
              <span className="tw:flex tw:items-center tw:gap-1.5 tw:text-brand-muted">
                <span className="tw:text-sm">📍</span> GPS Map Coordinates
              </span>
              <span className="tw:font-bold tw:text-brand-ink">
                {geocodedCount}{' '}
                <span className="tw:font-normal tw:text-brand-muted">({geocodedRate}%)</span>
              </span>
            </div>
            <div className="tw:flex tw:items-center tw:justify-between tw:text-xs">
              <span className="tw:flex tw:items-center tw:gap-1.5 tw:text-brand-muted">
                <span className="tw:text-sm">⭐</span> Featured Highlights
              </span>
              <span className="tw:font-bold tw:text-brand-ink">
                {featuredCount} <span className="tw:font-normal tw:text-brand-muted">curated</span>
              </span>
            </div>
          </div>
        </div>

        {/* Panel 2: Top Categories Breakdown */}
        <div className="tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm">
          <div className="tw:mb-4 tw:flex tw:items-center tw:justify-between">
            <h2 className="tw:m-0 tw:text-base tw:font-bold tw:text-brand-ink">Category Volume</h2>
            <a
              href="/admin/categories"
              className="tw:text-xs tw:font-semibold tw:text-brand-navy hover:tw:underline"
            >
              View all →
            </a>
          </div>

          {topCategories.length > 0 ? (
            <div className="tw:flex tw:flex-col tw:gap-3.5 tw:flex-1 tw:justify-around">
              {topCategories.map((category) => {
                const percent = Math.round((category.count / maxCategoryCount) * 100)
                return (
                  <div key={category.slug} className="tw:flex tw:flex-col tw:gap-1">
                    <div className="tw:flex tw:items-center tw:justify-between tw:text-xs">
                      <span className="tw:font-semibold tw:text-brand-ink">{category.name}</span>
                      <span className="tw:font-bold tw:text-brand-muted">
                        {category.count} {category.count === 1 ? 'place' : 'places'}
                      </span>
                    </div>
                    <div className="tw:h-2 tw:w-full tw:overflow-hidden tw:rounded-full tw:bg-brand-surface-subtle tw:border tw:border-brand-line">
                      <div
                        style={{ width: `${percent}%` }}
                        className="tw:h-full tw:rounded-full tw:bg-brand-navy tw:transition-all tw:duration-500"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="tw:flex tw:flex-col tw:items-center tw:justify-center tw:flex-1 tw:py-6 tw:text-center tw:text-brand-muted">
              <span className="tw:text-2xl tw:mb-2">📁</span>
              <p className="tw:m-0 tw:text-xs">
                Categories will appear here once places are assigned.
              </p>
            </div>
          )}
        </div>

        {/* Panel 3: Engagement & Operations */}
        <div className="tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm">
          <div className="tw:mb-4 tw:flex tw:items-center tw:justify-between">
            <h2 className="tw:m-0 tw:text-base tw:font-bold tw:text-brand-ink">
              Engagement & Response
            </h2>
            <a
              href="/admin/contact-requests"
              className="tw:text-xs tw:font-semibold tw:text-brand-navy hover:tw:underline"
            >
              Inbox →
            </a>
          </div>

          {/* Contact Requests Resolution Rate */}
          <div className="tw:mb-4">
            <div className="tw:mb-1.5 tw:flex tw:justify-between tw:text-xs">
              <span className="tw:font-medium tw:text-brand-ink">Inquiries Handled</span>
              <span className="tw:font-bold tw:text-brand-navy">{contactsResolutionRate}%</span>
            </div>
            <div className="tw:h-2.5 tw:w-full tw:overflow-hidden tw:rounded-full tw:bg-brand-surface-subtle tw:border tw:border-brand-line">
              <div
                style={{ width: `${contactsResolutionRate}%` }}
                className="tw:h-full tw:rounded-full tw:bg-brand-navy-soft tw:transition-all tw:duration-500"
              />
            </div>
            <div className="tw:mt-2 tw:flex tw:items-center tw:justify-between tw:text-xs tw:text-brand-muted">
              <span>{resolvedContacts} resolved</span>
              <span>{totalContacts} total requests</span>
            </div>
          </div>

          {/* Customer Community Summary */}
          <div className="tw:mt-auto tw:border-t tw:border-brand-line-subtle tw:pt-4">
            <span className="tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
              Registered App Community
            </span>
            <div className="tw:mt-2.5 tw:grid tw:grid-cols-2 tw:gap-3">
              <div className="tw:rounded-cms-sm tw:bg-brand-surface-subtle tw:border tw:border-brand-line tw:p-3">
                <span className="tw:text-xs tw:text-brand-muted">Total Users</span>
                <div className="tw:text-xl tw:font-bold tw:text-brand-ink tw:mt-0.5">
                  {totalCustomers}
                </div>
              </div>
              <div className="tw:rounded-cms-sm tw:bg-brand-surface-subtle tw:border tw:border-brand-line tw:p-3">
                <span className="tw:text-xs tw:text-brand-muted">Verified</span>
                <div className="tw:text-xl tw:font-bold tw:text-emerald-700 tw:mt-0.5">
                  {verifiedCustomers}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
