import { useState } from 'react'
import { Button, Form, Input, Select, Table } from 'antd'
import type { ColumnType, ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import RowActionMenu from '../../components/row_action_menu'
import ConfirmModal from '../../components/confirm_modal'
import { usePage } from '@inertiajs/react'

type StaffRole = { id: number; slug: string; name: string }

type User = {
  id: number
  full_name: string
  email: string
  roles: StaffRole[]
  active: boolean
  must_change_password: boolean
  created_at: string | null
  updated_at: string | null
}

type Filters = { q: string; status: string | null; reset: string | null; role: number | null }
type FilterValues = { q?: string; status?: string | null; reset?: string | null; role?: number | null }

type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  currentAdminId: number
  filters: Filters
  rows: User[]
  roles: StaffRole[]
  meta: { page: number; per_page: number; total: number; last_page: number }
}

function usersUrl(page: number, filters: FilterValues) {
  const query = new URLSearchParams({ page: String(page) })
  if (filters.q?.trim()) query.set('q', filters.q.trim())
  if (filters.status) query.set('status', filters.status)
  if (filters.reset) query.set('reset', filters.reset)
  if (filters.role) query.set('role', String(filters.role))
  return '/admin/users?' + query.toString()
}

function date(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}

export default function UsersIndex({
  adminName,
  csrfToken,
  success,
  error,
  currentAdminId,
  filters,
  rows,
  roles,
  meta,
}: Props) {
  const page = usePage()
  const auth = (page.props as unknown as { auth?: { isFullAccessAdmin?: boolean } }).auth
  const canManage = Boolean(auth?.isFullAccessAdmin)
  const [filterForm] = Form.useForm<FilterValues>()
  const [deleting, setDeleting] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)

  function applyFilters(values: FilterValues) {
    window.location.assign(usersUrl(1, values))
  }

  function changePage(pagination: TablePaginationConfig) {
    if (pagination.current && pagination.current !== meta.page) {
      window.location.assign(usersUrl(pagination.current, filters))
    }
  }

  const actionColumn: ColumnType<User> = {
    title: 'Actions',
    key: 'actions',
    width: 88,
    align: 'right',
    render: (_value, user) => (
      <RowActionMenu
        label={`More actions for ${user.full_name}`}
        actions={[
          { href: `/admin/users/${user.id}/edit`, label: 'Edit staff member' },
          ...(user.active ? [{ label: 'Send reset link', onClick: () => setResetting(user) }] : []),
          ...(user.id !== currentAdminId
            ? [{ label: 'Delete staff member', danger: true, onClick: () => setDeleting(user) }]
            : []),
        ]}
      />
    ),
  }

  const columns: ColumnsType<User> = [
    {
      title: 'Staff member',
      key: 'administrator',
      render: (_, user) => (
        <div className="tw:flex tw:min-w-[220px] tw:flex-col">
          <strong>{user.full_name}</strong>
          <span className="tw:text-[13px] tw:text-brand-muted">{user.email}</span>
        </div>
      ),
    },
    {
      title: 'Roles',
      dataIndex: 'roles',
      render: (assigned: StaffRole[]) => assigned.map((role) => <span className="type-chip tw:mr-1" key={role.id}>{role.name}</span>),
    },
    {
      title: 'Access',
      dataIndex: 'active',
      render: (active: boolean) => (
        <span className={`status ${active ? 'published' : 'archived'}`}>
          {active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      title: 'Password',
      dataIndex: 'must_change_password',
      render: (required: boolean) => (
        <span className={`status ${required ? 'draft' : 'published'}`}>
          {required ? 'Change required' : 'Current'}
        </span>
      ),
    },
    { title: 'Created', dataIndex: 'created_at', render: date },
    ...(canManage ? [actionColumn] : []),
  ]

  return (
    <AdminLayout
      title="Staff"
      active="users"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div>
          <h1>Staff</h1>
        </div>
      </div>

      <section className="panel cms-filter-panel tw:mb-6">
        <Form<FilterValues>
          form={filterForm}
          layout="vertical"
          initialValues={{
            q: filters.q,
            status: filters.status ?? undefined,
            reset: filters.reset ?? undefined,
            role: filters.role ?? undefined,
          }}
          onFinish={applyFilters}
          className="cms-filter-grid"
        >
          <Form.Item label="Search" name="q" className="tw:mb-0">
            <Input allowClear placeholder="Name or email" />
          </Form.Item>
          <Form.Item label="Access" name="status" className="tw:mb-0">
            <Select
              allowClear
              placeholder="All access"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Password status" name="reset" className="tw:mb-0">
            <Select
              allowClear
              placeholder="Any status"
              options={[
                { value: 'current', label: 'Current' },
                { value: 'required', label: 'Change required' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Role" name="role" className="tw:mb-0">
            <Select allowClear placeholder="All roles" options={roles.map((role) => ({ value: role.id, label: role.name }))} />
          </Form.Item>
          <Button className="button secondary tw:mb-0" htmlType="submit">
            Apply filters
          </Button>
        </Form>
      </section>

      <section className="panel table-panel tw:overflow-hidden tw:p-0">
        <div className="panel-heading tw:flex tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>
            {meta.total} staff member{meta.total === 1 ? '' : 's'}
          </h2>
          {canManage && <a className="button primary" href="/admin/users/new">+ Add staff member</a>}
        </div>
        <Table<User>
          className="cms-antd-table"
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={{
            current: meta.page,
            pageSize: meta.per_page,
            total: meta.total,
            hideOnSinglePage: true,
            showSizeChanger: false,
            showTotal: () => `Page ${meta.page} of ${meta.last_page}`,
          }}
          onChange={changePage}
          scroll={{ x: 900 }}
          locale={{ emptyText: 'No staff members match these filters.' }}
        />
      </section>

      <ConfirmModal
        open={Boolean(resetting)}
        onClose={() => setResetting(null)}
        title="Send password-reset link"
        message={`Send a one-time password-reset link to ${resetting?.email ?? ''}?`}
        action={resetting ? `/admin/users/${resetting.id}/send-reset` : ''}
        csrfToken={csrfToken}
        confirmLabel="Send reset link"
      />
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete staff member"
        message={`Delete ${deleting?.full_name ?? ''}? Their sessions and reset links will stop working.`}
        action={deleting ? `/admin/users/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete staff member"
        danger
      />
    </AdminLayout>
  )
}
