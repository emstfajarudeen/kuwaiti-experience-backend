import { Table, Tag } from 'antd'
import AdminLayout from '../../layouts/admin_layout'

type Permission = { key: string; module: string; action: string; label: string }
type Role = {
  id: number
  slug: string
  name: string
  description: string | null
  is_system: boolean
  staff_count: number
  permissions: Permission[]
}
type Props = {
  adminName: string
  csrfToken: string
  roles: Role[]
  canManage: boolean
  success: string | null
  error: string | null
}

export default function RolesIndex({ adminName, csrfToken, roles, canManage, success, error }: Props) {
  return (
    <AdminLayout title="Roles & Permissions" active="roles" adminName={adminName} csrfToken={csrfToken} success={success} error={error}>
      <div className="page-head tw:mb-6 tw:flex tw:items-center tw:justify-between tw:gap-4">
        <h1>Roles &amp; Permissions</h1>
      </div>
      <section className="panel table-panel tw:overflow-hidden tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>Roles ({roles.length})</h2>
          {canManage && <a className="button primary" href="/admin/roles/new">+ Create role</a>}
        </div>
        <Table<Role> className="cms-antd-table" rowKey="id" dataSource={roles} pagination={false} scroll={{ x: 700 }} columns={[
          { title: 'Role', dataIndex: 'name', render: (_: unknown, role) => <a href={`/admin/roles/${role.id}`}>{role.name}</a> },
          { title: 'Staff', dataIndex: 'staff_count', width: 90 },
          { title: 'Permissions', render: (_: unknown, role) => `${role.permissions.length} permissions` },
          { title: 'Type', render: (_: unknown, role) => role.is_system ? <Tag color="gold">System</Tag> : <Tag>Custom</Tag> },
          ...(canManage ? [{ title: '', key: 'action', render: (_: unknown, role: Role) => role.is_system ? <Tag>Protected</Tag> : <a href={`/admin/roles/${role.id}/edit`}>Edit</a> }] : []),
        ]} />
      </section>
    </AdminLayout>
  )
}
