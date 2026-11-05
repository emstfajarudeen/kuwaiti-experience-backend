import { Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import { ActionForm, RentalTabs, useCan, type SharedProps } from '../../components/rental_ui'

type Provider = {
  id: number
  name_en: string
  phone: string | null
  email: string | null
  active: boolean
  vehicle_count: number
  logo_url: string | null
}

export default function RentalProviders({
  adminName,
  csrfToken,
  success,
  error,
  rows,
}: SharedProps & { rows: Provider[] }) {
  const can = useCan()
  const columns: ColumnsType<Provider> = [
    {
      title: 'Provider',
      key: 'name',
      render: (_, row) => (
        <div className="tw:flex tw:items-center tw:gap-3">
          {row.logo_url ? (
            <img
              src={row.logo_url}
              alt=""
              className="tw:h-10 tw:w-10 tw:rounded tw:object-contain"
            />
          ) : (
            <div className="tw:h-10 tw:w-10 tw:rounded tw:bg-slate-100" />
          )}
          <a href={can('rentals.update') ? `/admin/rentals/providers/${row.id}/edit` : undefined}>
            <strong>{row.name_en}</strong>
          </a>
        </div>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      render: (_, row) => (
        <div className="tw:flex tw:flex-col tw:text-[13px]">
          <span>{row.phone ?? '—'}</span>
          <span className="tw:text-brand-muted">{row.email ?? ''}</span>
        </div>
      ),
    },
    { title: 'Vehicles', dataIndex: 'vehicle_count', key: 'vehicles' },
    {
      title: 'Status',
      key: 'active',
      render: (_, row) => (
        <span className={`status ${row.active ? 'published' : 'archived'}`}>
          {row.active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      render: (_, row) =>
        can('rentals.delete') && row.vehicle_count === 0 ? (
          <ActionForm
            action={`/admin/rentals/providers/${row.id}/delete`}
            csrfToken={csrfToken}
            confirm={`Delete ${row.name_en}?`}
          >
            <button type="submit" className="ant-btn ant-btn-default ant-btn-sm ant-btn-dangerous">
              Delete
            </button>
          </ActionForm>
        ) : null,
    },
  ]
  return (
    <AdminLayout
      title="Rental providers"
      active="rentals"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
        <h1>Rental providers</h1>
        {can('rentals.create') && (
          <a className="ant-btn ant-btn-primary" href="/admin/rentals/providers/new">
            Add provider
          </a>
        )}
      </div>
      <RentalTabs current="providers" />
      <section className="panel table-panel tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <Table<Provider>
          className="cms-antd-table"
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'No rental providers yet.' }}
        />
      </section>
    </AdminLayout>
  )
}
