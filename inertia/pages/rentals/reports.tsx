import AdminLayout from '../../layouts/admin_layout'
import type { SharedProps } from '../../components/rental_ui'

type ReportCard = { key: string; title: string; group: string; description: string }
type Props = SharedProps & { reports: ReportCard[] }

export default function RentalReports({ adminName, csrfToken, success, error, reports }: Props) {
  const groups = [...new Set(reports.map((report) => report.group))]
  return (
    <AdminLayout
      title="Rental reports"
      active="rental-reports"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6">
        <h1>Rental reports</h1>
      </div>
      {groups.map((group) => (
        <section key={group} className="tw:mb-8">
          <h2 className="tw:mb-3 tw:text-[15px] tw:font-semibold tw:text-brand-muted">{group}</h2>
          <div className="tw:grid tw:gap-4 tw:sm:grid-cols-2 tw:xl:grid-cols-3">
            {reports
              .filter((report) => report.group === group)
              .map((report) => (
                <a
                  key={report.key}
                  href={`/admin/rentals/reports/${report.key}`}
                  className="tw:flex tw:flex-col tw:gap-2 tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:no-underline tw:transition-colors hover:tw:border-brand-navy-subtle"
                >
                  <strong className="tw:text-[16px] tw:text-brand-ink">{report.title}</strong>
                  <span className="tw:text-[13px] tw:leading-relaxed tw:text-brand-muted">
                    {report.description}
                  </span>
                </a>
              ))}
          </div>
        </section>
      ))}
    </AdminLayout>
  )
}
