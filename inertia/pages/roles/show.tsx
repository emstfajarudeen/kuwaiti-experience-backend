import { Button, Tag } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import { useAuthorization } from '../../lib/authorization'

type Role = {
  id: number
  slug: string
  name: string
  description: string | null
  is_system: boolean
  permissions: Array<{ key: string; module: string; action: string; label: string }>
}
type Props = { adminName: string; csrfToken: string; error: string | null; role: Role }

export default function RoleShow({ adminName, csrfToken, error, role }: Props) {
  const { can } = useAuthorization()
  const groups = Object.groupBy(role.permissions, (permission) => permission.module)
  return (
    <AdminLayout title={role.name} active="roles" adminName={adminName} csrfToken={csrfToken} error={error}>
      <a className="back-link" href="/admin/roles">← Back to roles</a>
      <div className="page-head tw:mb-6"><h1>{role.name} {role.is_system && <Tag color="gold">System</Tag>}</h1>{role.description && <p className="subtitle">{role.description}</p>}</div>
      {role.is_system && <div className="panel tw:mb-5 tw:p-5">{role.slug === 'super_admin' ? 'Super Admin' : 'Administrator'} receives all active permissions declared in the permission catalogue. Its grants cannot be edited here.</div>}
      <div className="cms-permission-grid tw:mb-5">{Object.entries(groups).map(([module, permissions]) => <section className="cms-permission-group" key={module}><h2 className="tw:capitalize">{module.replaceAll('_', ' ')}</h2><div className="tw:flex tw:flex-wrap tw:gap-2">{permissions?.map((permission) => <Tag key={permission.key}>{permission.label}</Tag>)}</div></section>)}</div>
      {!role.permissions.length && <section className="panel tw:p-5">This role has no permissions.</section>}
      {!role.is_system && can('roles.manage') && <Button href={`/admin/roles/${role.id}/edit`}>Edit role</Button>}
    </AdminLayout>
  )
}
