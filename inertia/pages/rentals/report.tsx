import { Button, Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import { Select } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import { useServerFilters } from '../../components/table_toolbar'
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
}
type Values = Record<string, string>

type Props = SharedProps & {
  report: { key: string; title: string; description: string }
  filterFields: Field[]
  values: Values
  problem: string | null
  columns: Column[]
  summary: { label: string; value: string; type: 'money' | 'int' | 'decimal' | 'percent' }[]
  note: string | null
  rows: Record<string, string>[]
  meta: { total: number; page: number; lastPage: number; perPage: number }
  exportBase: string | null
  exportQuery: string
}

const emptyValues: Values = {
  from: '',
  to: '',
  provider: '',
  status: '',
  view: '',
  date_by: '',
  method: '',
  q: '',
}

export default function RentalReport(props: Props) {
  const { adminName, csrfToken, success, error, report, filterFields, values, columns, meta } =
    props
  const path = `/admin/rentals/reports/${report.key}`
  // The dates always have a value, so "Reset" returns to the default range (empty = default).
  const filters = useServerFilters(path, { ...emptyValues, ...values }, emptyValues)
  const tableColumns: ColumnsType<Record<string, string>> = columns.map((column) => ({
    title: column.label,
    dataIndex: column.key,
    key: column.key,
    align: ['money', 'int', 'decimal', 'percent'].includes(column.type) ? 'right' : 'left',
    render: (value: string) => (
      <span className={column.type === 'text' ? '' : 'tw:whitespace-nowrap'}>{value || '—'}</span>
    ),
  }))
  const changePage = (pagination: TablePaginationConfig) => {
    if (pagination.current && pagination.current !== meta.page)
      router.get(path, { ...cleanParams(filters.values), page: pagination.current })
  }
  const exportLink = (format: 'csv' | 'xlsx') =>
    `${props.exportBase}?${props.exportQuery}&format=${format}`
  return (
    <AdminLayout
      title={report.title}
      active="rental-reports"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
        <div>
          <a href="/admin/rentals/reports" className="tw:text-[13px] tw:text-brand-muted">
            ← All reports
          </a>
          <h1>{report.title}</h1>
        </div>
        {props.exportBase && (
          <div className="tw:flex tw:gap-2">
            <Button href={exportLink('csv')}>Export CSV</Button>
            <Button type="primary" href={exportLink('xlsx')}>
              Export Excel
            </Button>
          </div>
        )}
      </div>

      <section className="panel tw:mb-6 tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-4">
        <div className="tw:flex tw:flex-wrap tw:items-end tw:gap-3">
          {filterFields.map((field) =>
            field.kind === 'date' ? (
              <label key={field.key} className="tw:flex tw:flex-col tw:gap-1 tw:text-[12px]">
                <span className="tw:text-brand-muted">{field.label}</span>
                <input
                  type="date"
                  className="tw:h-8 tw:rounded-md tw:border tw:border-brand-line tw:px-2 tw:text-[14px]"
                  value={filters.values[field.key] ?? ''}
                  onChange={(event) => filters.setSelect(field.key, event.target.value)}
                />
              </label>
            ) : field.kind === 'search' ? (
              <input
                key={field.key}
                aria-label={field.label}
                placeholder={field.label}
                className="tw:h-8 tw:w-[240px] tw:rounded-md tw:border tw:border-brand-line tw:px-2 tw:text-[14px]"
                value={filters.values[field.key] ?? ''}
                onChange={(event) => filters.setSearch(field.key, event.target.value)}
              />
            ) : (
              <Select
                key={field.key}
                allowClear
                showSearch={field.key === 'provider'}
                optionFilterProp="label"
                placeholder={field.label}
                className="tw:min-w-[200px]"
                value={filters.values[field.key] || undefined}
                options={field.options}
                onChange={(value) => filters.setSelect(field.key, value ?? '')}
              />
            )
          )}
          {filters.active && (
            <button
              type="button"
              className="tw:h-8 tw:text-[13px] tw:text-brand-muted tw:underline"
              onClick={filters.reset}
            >
              Reset filters
            </button>
          )}
        </div>
        <p className="tw:mt-3 tw:text-[12px] tw:text-brand-muted">{report.description}</p>
      </section>

      {props.problem ? (
        <div className="notice error tw:mb-6">{props.problem}</div>
      ) : (
        <>
          <div className="tw:mb-6 tw:grid tw:grid-cols-2 tw:gap-3 tw:md:grid-cols-3 tw:xl:grid-cols-5">
            {props.summary.map((item) => (
              <div
                key={item.label}
                className="tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-4"
              >
                <div className="tw:text-[12px] tw:text-brand-muted">{item.label}</div>
                <div className="tw:mt-1 tw:text-[20px] tw:font-semibold tw:text-brand-ink">
                  {item.value}
                  {item.type === 'money' && (
                    <span className="tw:ml-1 tw:text-[12px] tw:font-normal tw:text-brand-muted">
                      KWD
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {props.note && <p className="tw:mb-4 tw:text-[12px] tw:text-brand-muted">{props.note}</p>}
          <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
            <div className="panel-heading tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
              <h2>Results ({meta.total})</h2>
            </div>
            <div className="table-scroll">
              <Table<Record<string, string>>
                className="cms-antd-table"
                rowKey={(_, index) => String(index)}
                columns={tableColumns}
                dataSource={props.rows}
                pagination={{
                  current: meta.page,
                  pageSize: meta.perPage,
                  total: meta.total,
                  showSizeChanger: false,
                  hideOnSinglePage: true,
                }}
                onChange={changePage}
                locale={{ emptyText: 'Nothing matches these filters.' }}
              />
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  )
}

function cleanParams(values: Values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ''))
}
