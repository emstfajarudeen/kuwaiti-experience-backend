import { useState } from 'react'
import { Button, Modal, Table } from 'antd'
import { EyeOutlined } from '@ant-design/icons'
import { router } from '@inertiajs/react'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import TableToolbar, { useServerFilters, type ToolbarSelect } from '../../components/table_toolbar'
import type { SharedProps } from '../../components/rental_ui'

type Field = {
  key: string
  label: string
  kind: 'date' | 'select' | 'search'
  options?: { value: string; label: string }[]
}
type Column = {
  key: string
  label: string
  type: 'text' | 'money' | 'int' | 'decimal' | 'percent' | 'datetime' | 'date'
  /** Only in the row's detail view (and exports), not a table column. */
  detail?: true
}
type Row = Record<string, string>
type Values = Record<string, string>
type Summary = {
  label: string
  value: string
  type: 'money' | 'int' | 'decimal' | 'percent'
  hint: string
}

type Props = SharedProps & {
  report: { key: string; title: string }
  filterFields: Field[]
  values: Values
  /** The date range the report opens with; "Reset filters" returns to it. */
  defaults: { from: string; to: string }
  problem: string | null
  columns: Column[]
  summary: Summary[]
  rows: Row[]
  meta: { total: number; page: number; lastPage: number; perPage: number }
  exportBase: string | null
  exportQuery: string
}

const blank: Values = {
  from: '',
  to: '',
  provider: '',
  status: '',
  view: '',
  date_by: '',
  method: '',
  q: '',
}

const numeric = (type: Column['type']) => ['money', 'int', 'decimal', 'percent'].includes(type)

export default function RentalReport(props: Props) {
  const { adminName, csrfToken, success, error, report, filterFields, meta } = props
  const path = `/admin/rentals/reports/${report.key}`
  const defaults: Values = { ...blank, ...props.defaults }
  const filters = useServerFilters<Values>(path, { ...blank, ...props.values }, defaults)

  const selects: ToolbarSelect[] = filterFields
    .filter((field) => field.kind === 'select')
    .map((field) => ({
      key: field.key,
      value: filters.values[field.key] ?? '',
      placeholder: field.label,
      options: field.options ?? [],
      searchable: field.key === 'provider',
      onChange: (value) => filters.setSelect(field.key, value),
    }))
  const searchField = filterFields.find((field) => field.kind === 'search')

  const [viewing, setViewing] = useState<Row | null>(null)
  // The table shows the main columns; a row's detail view shows every field.
  const hasDetail = props.columns.some((column) => column.detail)
  // Rows about a booking are named by its reference; others by their first column.
  const titleOf = (row: Row) => row.reference || row[props.columns[0]?.key] || report.title

  const columns: ColumnsType<Row> = [
    ...(hasDetail
      ? [
          {
            title: 'View',
            key: 'view',
            width: 70,
            render: (_: unknown, row: Row) => (
              <button
                type="button"
                className="action-pencil-btn tw:cursor-pointer"
                aria-label={`View ${titleOf(row)}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setViewing(row)
                }}
              >
                <EyeOutlined />
              </button>
            ),
          },
        ]
      : []),
    ...props.columns
      .filter((column) => !column.detail)
      .map((column) => ({
        title: column.label,
        dataIndex: column.key,
        key: column.key,
        align: numeric(column.type) ? ('right' as const) : ('left' as const),
        // Short values (names, phones, dates) stay on one line; only long text wraps.
        render: (value: string) => (
          <span
            className={
              (value ?? '').length > 40
                ? 'tw:block tw:min-w-[220px] tw:text-[13px]'
                : 'tw:whitespace-nowrap tw:text-[13px]'
            }
          >
            {value || '—'}
          </span>
        ),
      })),
  ]

  const changePage = (pagination: TablePaginationConfig) => {
    if (pagination.current && pagination.current !== meta.page)
      router.get(
        path,
        { ...cleanParams(filters.values), page: pagination.current },
        { preserveState: true, preserveScroll: true }
      )
  }
  const exportLink = (format: 'csv' | 'xlsx') =>
    `${props.exportBase}?${props.exportQuery}&format=${format}`

  return (
    <AdminLayout
      title={report.title}
      active={`report-${report.key}`}
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div>
          <h1>{report.title}</h1>
        </div>
        {props.exportBase && (
          <div className="tw:ml-auto tw:flex tw:gap-2">
            {/* `download` makes these real file downloads: without it the app's link
                handler would open them as Inertia page visits and show the raw file. */}
            <Button href={exportLink('csv')} download>
              Export CSV
            </Button>
            <Button type="primary" href={exportLink('xlsx')} download>
              Export Excel
            </Button>
          </div>
        )}
      </div>

      {!props.problem && props.summary.length > 0 && (
        <div className="tw:mb-6 tw:grid tw:grid-cols-2 tw:gap-4 tw:md:grid-cols-3 tw:xl:grid-cols-5">
          {props.summary.map((item) => (
            <div
              key={item.label}
              className="stat-card tw:flex tw:flex-col tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-5 tw:shadow-sm"
            >
              <span className="stat-label tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
                {item.label}
              </span>
              <strong className="stat-value tw:mt-2 tw:text-2xl tw:font-bold tw:leading-none tw:text-brand-ink">
                {item.value}
                {item.type === 'money' && (
                  <span className="tw:ml-1 tw:text-[12px] tw:font-semibold tw:text-brand-muted">
                    KWD
                  </span>
                )}
              </strong>
              <span className="tw:mt-2 tw:text-[11px] tw:font-medium tw:text-brand-muted">
                {item.hint}
              </span>
            </div>
          ))}
        </div>
      )}

      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-0">
        <div className="panel-heading tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>
            {report.title} ({meta.total})
          </h2>
        </div>
        <TableToolbar
          dateRange={{
            label: 'Date range',
            from: filters.values.from || defaults.from,
            to: filters.values.to || defaults.to,
            onChange: (from, to) => filters.setMany({ from, to }),
          }}
          search={
            searchField && {
              label: searchField.label,
              placeholder: `Search ${searchField.label.toLowerCase()}`,
              value: filters.values[searchField.key] ?? '',
              onChange: (value) => filters.setSearch(searchField.key, value),
            }
          }
          selects={selects}
          active={filters.active}
          onReset={filters.reset}
        />
        {props.problem ? (
          <div className="tw:px-6 tw:py-10 tw:text-center tw:text-[14px] tw:text-brand-muted">
            {props.problem}
          </div>
        ) : (
          <div className="table-scroll">
            <Table<Row>
              className="cms-antd-table"
              rowKey="__key"
              rowClassName={() => (hasDetail ? 'tw:cursor-pointer' : '')}
              onRow={(row) => (hasDetail ? { onClick: () => setViewing(row) } : {})}
              columns={columns}
              dataSource={props.rows.map((row, index) => ({ ...row, __key: String(index) }))}
              pagination={{
                current: meta.page,
                pageSize: meta.perPage,
                total: meta.total,
                showSizeChanger: false,
                hideOnSinglePage: true,
                showTotal: () => `Page ${meta.page} of ${meta.lastPage}`,
              }}
              onChange={changePage}
              locale={{ emptyText: 'Nothing matches these filters.' }}
            />
          </div>
        )}
      </section>

      <Modal
        open={Boolean(viewing)}
        title={viewing ? titleOf(viewing) : ''}
        onCancel={() => setViewing(null)}
        footer={
          viewing?._href ? (
            <Button type="primary" href={viewing._href}>
              Open booking
            </Button>
          ) : null
        }
        width={640}
        destroyOnHidden
      >
        {viewing && (
          <dl className="tw:m-0 tw:grid tw:grid-cols-1 tw:gap-x-6 tw:gap-y-3 tw:sm:grid-cols-2">
            {props.columns.map((column) => (
              <div
                key={column.key}
                className="tw:flex tw:flex-col tw:gap-0.5 tw:border-b tw:border-brand-line-subtle tw:pb-2"
              >
                <dt className="tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-brand-muted">
                  {column.label}
                </dt>
                <dd className="tw:m-0 tw:break-words tw:text-[14px] tw:text-brand-ink">
                  {viewing[column.key] || '—'}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>
    </AdminLayout>
  )
}

function cleanParams(values: Values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ''))
}
