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
  archivedCount,
  newContactsCount,
  visibility,
  analytics,
}: Props) {
  const publishedRate =
    analytics?.publishedRate ??
    (totalPlaces > 0 ? Math.round((publishedCount / totalPlaces) * 100) : 0)
  const archivedRate =
    analytics?.archivedRate ??
    (totalPlaces > 0 ? Math.round((archivedCount / totalPlaces) * 100) : 0)
  const totalCustomers = analytics?.totalCustomers ?? 0
  const verifiedCustomers = analytics?.verifiedCustomers ?? 0
  const activeCategories = analytics?.activeCategories ?? 0
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
              {publishedRate}% are live
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
              Active
            </span>
            <strong className="stat-value tw:my-2 tw:text-3xl tw:font-bold tw:leading-none tw:text-brand-success-text">
              {publishedCount}
            </strong>
            <span className="tw:text-[11px] tw:font-medium tw:text-brand-muted">
              Visible in the app
            </span>
          </a>
        )}

        {/* Inactive */}
        {visibility.places && (
          <a
            href="/admin/places?status=inactive"
            className="stat-card tw:relative tw:flex tw:flex-col tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm tw:transition-all hover:tw:-translate-y-0.5 hover:tw:shadow-md"
          >
            <span className="stat-label tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
              Inactive
            </span>
            <strong className="stat-value tw:my-2 tw:text-3xl tw:font-bold tw:leading-none tw:text-brand-danger-text">
              {archivedCount}
            </strong>
            <span className="tw:text-[11px] tw:font-medium tw:text-brand-muted">
              Turned off or not yet activated
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
            In use
          </span>
        </a>
      </div>

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
              <span className="tw:font-bold tw:text-brand-success-text">{publishedRate}% Active</span>
            </div>
            <div className="tw:flex tw:h-3 tw:w-full tw:overflow-hidden tw:rounded-full tw:bg-brand-surface-subtle tw:border tw:border-brand-line">
              <div
                style={{ width: `${publishedRate}%` }}
                className="tw:bg-brand-success-text tw:transition-all tw:duration-500"
                title={`Active: ${publishedCount} (${publishedRate}%)`}
              />
              <div
                style={{ width: `${archivedRate}%` }}
                className="tw:bg-brand-danger-border tw:transition-all tw:duration-500"
                title={`Inactive: ${archivedCount} (${archivedRate}%)`}
              />
            </div>
          </div>

          {/* Legend items */}
          <div className="tw:grid tw:grid-cols-2 tw:gap-2 tw:pt-2 tw:border-t tw:border-brand-line-subtle tw:text-xs">
            <div className="tw:flex tw:flex-col">
              <span className="tw:flex tw:items-center tw:gap-1.5 tw:text-brand-muted">
                <span className="tw:size-2 tw:rounded-full tw:bg-brand-success-text" /> Active
              </span>
              <span className="tw:font-bold tw:text-brand-ink tw:mt-0.5">{publishedCount}</span>
            </div>
            <div className="tw:flex tw:flex-col">
              <span className="tw:flex tw:items-center tw:gap-1.5 tw:text-brand-muted">
                <span className="tw:size-2 tw:rounded-full tw:bg-brand-danger-border" /> Inactive
              </span>
              <span className="tw:font-bold tw:text-brand-ink tw:mt-0.5">{archivedCount}</span>
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

        </div>
      </div>
    </AdminLayout>
  )
}
