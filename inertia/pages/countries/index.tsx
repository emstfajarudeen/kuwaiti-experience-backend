import { useMemo, useState } from 'react'
import { Input, Select, Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import RowActionMenu from '../../components/row_action_menu'
import ConfirmModal from '../../components/confirm_modal'
import { useAuthorization } from '../../lib/authorization'

type Country = {
  code: string
  name_en: string
  name_ar: string | null
  active: boolean
  sort_order: number
}

type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  rows: Country[]
}

export default function CountriesIndex({ adminName, csrfToken, success, error, rows }: Props) {
  const { can } = useAuthorization()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [deleting, setDeleting] = useState<Country | null>(null)
  const [changingStatus, setChangingStatus] = useState<string | null>(null)
  const changeStatus = (country: Country, active: boolean) => {
    router.post(
      `/admin/countries/${encodeURIComponent(country.code)}/status`,
      { active, _csrf: csrfToken },
      {
        preserveScroll: true,
        onStart: () => setChangingStatus(country.code),
        onFinish: () => setChangingStatus(null),
      }
    )
  }
  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return rows.filter(
      (row) =>
        (status === 'all' || (status === 'active') === row.active) &&
        (!query ||
          [row.code, row.name_en, row.name_ar ?? ''].some((value) =>
            value.toLocaleLowerCase().includes(query)
          ))
    )
  }, [rows, search, status])

  return (
    <AdminLayout
      title="Countries"
      active="countries"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6">
        <h1>Countries</h1>
      </div>
      <section className="panel table-panel tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <div>
            <h2>Countries ({rows.length})</h2>
          </div>
          {can('countries.create') && (
            <a className="button primary" href="/admin/countries/new">
              + Add country
            </a>
          )}
        </div>
        <div className="tw:flex tw:flex-wrap tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-4">
          <Input.Search
            aria-label="Search countries"
            placeholder="Search name or code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            allowClear
            className="tw:max-w-[320px]"
          />
          <Select
            aria-label="Filter countries by status"
            value={status}
            onChange={setStatus}
            className="tw:min-w-[160px]"
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        </div>
        <div className="table-scroll tw:overflow-x-auto">
          <Table<Country>
            rowKey="code"
            dataSource={visibleRows}
            pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
            scroll={{ x: 650 }}
            locale={{
              emptyText: rows.length
                ? 'No countries match these filters.'
                : 'No countries configured yet.',
            }}
            columns={[
              ...(can('countries.update')
                ? [
                    {
                      title: 'Edit',
                      key: 'edit',
                      width: 70,
                      render: (_: unknown, row: Country) => (
                        <a
                          href={`/admin/countries/${encodeURIComponent(row.code)}/edit`}
                          className="action-pencil-btn"
                          aria-label={`Edit ${row.name_en}`}
                        >
                          ✎
                        </a>
                      ),
                    },
                  ]
                : []),
              { title: 'Order', dataIndex: 'sort_order', width: 90 },
              { title: 'Country', key: 'name', render: (_, row) => <strong>{row.name_en}</strong> },
              {
                title: 'Code',
                dataIndex: 'code',
                width: 100,
                render: (code: string) => <code>{code}</code>,
              },
              {
                title: 'Arabic name',
                dataIndex: 'name_ar',
                render: (name: string | null) => <span dir="rtl">{name || '—'}</span>,
              },
              {
                title: 'Status',
                dataIndex: 'active',
                width: 120,
                render: (active: boolean, row: Country) => (
                  <Switch
                    aria-label={`${active ? 'Deactivate' : 'Activate'} ${row.name_en}`}
                    checked={active}
                    loading={changingStatus === row.code}
                    disabled={!can('countries.update') || changingStatus !== null}
                    onChange={(checked) => changeStatus(row, checked)}
                  />
                ),
              },
              ...(can('countries.delete')
                ? [
                    {
                      title: 'Actions',
                      key: 'actions',
                      width: 90,
                      render: (_: unknown, row: Country) => (
                        <RowActionMenu
                          label={`More actions for ${row.name_en}`}
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
        title="Delete country"
        message={`Delete ${deleting?.name_en ?? 'this country'}? This cannot be undone.`}
        action={deleting ? `/admin/countries/${encodeURIComponent(deleting.code)}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
