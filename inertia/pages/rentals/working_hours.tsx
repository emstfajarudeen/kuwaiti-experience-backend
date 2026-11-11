import { Table } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import { useCan, type SharedProps } from '../../components/rental_ui'

type Day = { mode: 'closed' | 'open24' | 'shifts'; shifts: { opens: string; closes: string }[] }
type Closure = { startsOn: string; endsOn: string; reason: string | null }

type Row = {
  id: number
  name_en: string
  provider_name: string | null
  place_name: string | null
  active: boolean
  hours_enabled: boolean
  schedule: Day[]
  closures: Closure[]
}

type Props = SharedProps & {
  provider: string
  providers: { value: string; label: string }[]
  rows: Row[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function DayCell({ day }: { day: Day }) {
  if (day.mode === 'closed') return <span className="tw:text-red-700">Closed</span>
  if (day.mode === 'open24') return <span>24 hours</span>
  return (
    <span className="tw:flex tw:flex-col tw:whitespace-nowrap tw:text-[13px]">
      {day.shifts.map((shift) => (
        <span key={shift.opens}>
          {shift.opens}–{shift.closes}
        </span>
      ))}
    </span>
  )
}

const formatDay = (value: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(
    new Date(`${value}T00:00:00`)
  )

export default function RentalWorkingHours({
  adminName,
  csrfToken,
  success,
  error,
  provider,
  providers,
  rows,
}: Props) {
  const can = useCan()
  const providerName = providers.find((option) => option.value === provider)?.label
  return (
    <AdminLayout
      title={providerName ? `${providerName} · Working hours` : 'Working hours'}
      active="rental-providers"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/providers">
        ← Back to providers
      </a>
      <div className="page-head tw:mb-6">
        <h1>{providerName ? 'Working hours' : 'Working hours of all branches'}</h1>
      </div>
      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>{providerName ? `${providerName} - ` : ''}Branches ({rows.length})</h2>
          <a
            className="button secondary"
            href={
              provider
                ? `/admin/rentals/locations?provider=${provider}`
                : '/admin/rentals/locations'
            }
          >
            Branches
          </a>
        </div>
        <div className="table-scroll">
          <Table<Row>
            className="cms-antd-table"
            rowKey="id"
            dataSource={rows}
            pagination={false}
            locale={{ emptyText: 'No branches yet.' }}
            columns={[
              ...(can('rentals.update')
                ? [
                    {
                      title: '',
                      key: 'edit',
                      width: 70,
                      render: (_: unknown, row: Row) => (
                        <a
                          href={`/admin/rentals/locations/${row.id}/hours`}
                          className="action-pencil-btn"
                          aria-label={`Edit hours for ${row.name_en}`}
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
                fixed: 'left',
                render: (_: unknown, row: Row) => (
                  <div className="tw:flex tw:min-w-[180px] tw:flex-col">
                    <strong>{row.name_en}</strong>
                    <span className="tw:text-[12px] tw:text-brand-muted">
                      {(providerName ? [row.place_name] : [row.provider_name, row.place_name])
                        .filter(Boolean)
                        .join(' · ')}
                      {row.active ? '' : ' · inactive'}
                    </span>
                  </div>
                ),
              },
              ...DAYS.map((label, index) => ({
                title: label,
                key: label,
                render: (_: unknown, row: Row) =>
                  row.hours_enabled ? (
                    <DayCell day={row.schedule[index]} />
                  ) : index === 0 ? (
                    <span className="tw:whitespace-nowrap tw:text-brand-muted">Any time</span>
                  ) : null,
                onCell: (row: Row) => (!row.hours_enabled ? { colSpan: index === 0 ? 7 : 0 } : {}),
              })),
              {
                title: 'Closed dates',
                key: 'closures',
                render: (_: unknown, row: Row) =>
                  row.closures.length ? (
                    <span className="tw:flex tw:flex-col tw:text-[13px]">
                      {row.closures.slice(0, 3).map((closure) => (
                        <span key={closure.startsOn} className="tw:whitespace-nowrap">
                          {closure.startsOn === closure.endsOn
                            ? formatDay(closure.startsOn)
                            : `${formatDay(closure.startsOn)} – ${formatDay(closure.endsOn)}`}
                          {closure.reason ? ` · ${closure.reason}` : ''}
                        </span>
                      ))}
                      {row.closures.length > 3 && (
                        <span className="tw:text-brand-muted">+{row.closures.length - 3} more</span>
                      )}
                    </span>
                  ) : (
                    <span className="tw:text-brand-muted">—</span>
                  ),
              },
            ]}
          />
        </div>
      </section>
    </AdminLayout>
  )
}
