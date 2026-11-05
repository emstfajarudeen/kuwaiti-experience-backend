import { Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import { ActionForm, RentalTabs, useCan, type SharedProps } from '../../components/rental_ui'

type Location = {
  id: number
  name_en: string
  name_ar: string | null
  address: string | null
  active: boolean
  sort_order: number
  vehicle_count: number
}

export default function RentalLocations({
  adminName,
  csrfToken,
  success,
  error,
  rows,
}: SharedProps & { rows: Location[] }) {
  const can = useCan()
  const columns: ColumnsType<Location> = [
    {
      title: 'Location',
      key: 'name',
      render: (_, row) => (
        <div className="tw:flex tw:flex-col">
          <a href={can('rentals.update') ? `/admin/rentals/locations/${row.id}/edit` : undefined}>
            <strong>{row.name_en}</strong>
          </a>
          <span className="tw:text-[12px] tw:text-brand-muted">{row.address ?? ''}</span>
        </div>
      ),
    },
    { title: 'Vehicles', dataIndex: 'vehicle_count', key: 'vehicles' },
    { title: 'Order', dataIndex: 'sort_order', key: 'order' },
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
        can('rentals.delete') ? (
          <ActionForm
            action={`/admin/rentals/locations/${row.id}/delete`}
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
      title="Rental locations"
      active="rentals"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
        <h1>Pickup and return locations</h1>
        {can('rentals.create') && (
          <a className="ant-btn ant-btn-primary" href="/admin/rentals/locations/new">
            Add location
          </a>
        )}
      </div>
      <RentalTabs current="locations" />
      <section className="panel table-panel tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <Table<Location>
          className="cms-antd-table"
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'No rental locations yet.' }}
        />
      </section>
    </AdminLayout>
  )
}
