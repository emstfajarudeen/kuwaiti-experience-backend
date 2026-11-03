import { useState } from 'react'
import { Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import { useAuthorization } from '../../lib/authorization'
import TableToolbar, { useServerFilters } from '../../components/table_toolbar'

type AppUser = {
  id: number
  first_name: string
  last_name: string
  phone_e164: string
  email: string | null
  phone_verified_at: string | null
  active: boolean
  created_at: string | null
}

type Props = {
  adminName: string
  csrfToken: string
  success?: string | null
  error?: string | null
  query: string
  users: AppUser[]
  meta: { page: number; per_page: number; total: number; last_page: number }
}

function userUrl(page: number, query: string) {
  const params = new URLSearchParams({ page: String(page) })
  if (query.trim()) params.set('q', query.trim())
  return `/admin/customers?${params.toString()}`
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}

function initials(firstName: string, lastName: string) {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase() || '?'
}

export default function CustomersIndex({
  adminName,
  csrfToken,
  success,
  error,
  query,
  users,
  meta,
}: Props) {
  const { can } = useAuthorization()
  const [changing, setChanging] = useState<number | null>(null)
  const changeStatus = (user: AppUser, active: boolean) => {
    router.post(
      `/admin/customers/${user.id}/status`,
      { active, _csrf: csrfToken, returnTo: window.location.pathname + window.location.search },
      {
        preserveScroll: true,
        onStart: () => setChanging(user.id),
        onFinish: () => setChanging(null),
      }
    )
  }
  const serverFilters = useServerFilters('/admin/customers', { q: query }, { q: '' })

  const columns: ColumnsType<AppUser> = [
    {
      title: 'User',
      key: 'name',
      render: (_, user) => (
        <div className="tw:flex tw:min-w-[240px] tw:items-center tw:gap-3">
          <span
            className="tw:grid tw:size-10 tw:shrink-0 tw:place-items-center tw:rounded-full tw:bg-brand-navy tw:text-sm tw:font-bold tw:text-brand-gold"
            aria-hidden="true"
          >
            {initials(user.first_name, user.last_name)}
          </span>
          <div className="tw:flex tw:flex-col">
            <strong>
              {user.first_name} {user.last_name}
            </strong>
            <span className="tw:text-[13px] tw:text-brand-muted">
              {user.email || 'No email added'}
            </span>
          </div>
        </div>
      ),
    },
    { title: 'Phone', dataIndex: 'phone_e164', key: 'phone' },
    {
      title: 'Phone verification',
      dataIndex: 'phone_verified_at',
      key: 'verified',
      render: (value: string | null) => (
        <span className={`status ${value ? 'published' : 'archived'}`}>
          {value ? 'Verified' : 'Unverified'}
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, user) => (
        <label className="tw:flex tw:items-center tw:gap-2">
          <Switch
            aria-label={`${user.active ? 'Deactivate' : 'Activate'} ${user.first_name} ${user.last_name}`}
            checked={user.active}
            loading={changing === user.id}
            disabled={!can('customers.update') || changing !== null}
            onChange={(checked) => changeStatus(user, checked)}
          />
          <span className="tw:text-[13px] tw:font-semibold">
            {user.active ? 'Active' : 'Inactive'}
          </span>
        </label>
      ),
    },
    {
      title: 'Registered',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string | null) => (
        <span className="tw:text-[13px] tw:text-brand-muted">{formatDate(value)}</span>
      ),
    },
  ]

  function changePage(pagination: TablePaginationConfig) {
    if (pagination.current && pagination.current !== meta.page) {
      router.visit(userUrl(pagination.current, query))
    }
  }

  return (
    <AdminLayout
      title="App users"
      active="customers"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div>
          <h1>Registered app users</h1>
        </div>
      </div>

      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>Users ({meta.total})</h2>
        </div>
        <TableToolbar
          search={{
            label: 'Search app users',
            placeholder: 'Search name, phone or email',
            value: serverFilters.values.q,
            onChange: (value) => serverFilters.setSearch('q', value),
          }}
          active={serverFilters.active}
          onReset={serverFilters.reset}
        />
        <Table<AppUser>
          className="cms-antd-table"
          rowKey="id"
          columns={columns}
          dataSource={users}
          pagination={{
            current: meta.page,
            pageSize: meta.per_page,
            total: meta.total,
            showSizeChanger: false,
            hideOnSinglePage: true,
            showTotal: () => `Page ${meta.page} of ${meta.last_page}`,
          }}
          onChange={changePage}
          locale={{
            emptyText: query ? 'No app users match this search.' : 'No registered app users yet.',
          }}
        />
      </section>
    </AdminLayout>
  )
}
