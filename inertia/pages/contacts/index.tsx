import { Table } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import RowActionMenu from '../../components/row_action_menu'
import AdminLayout from '../../layouts/admin_layout'

type Contact = {
  id: number
  full_name: string
  email: string
  phone_number: string | null
  inquiry_type: string | null
  status: 'new' | 'in_progress' | 'resolved'
  created_at: string | null
}

type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  status: string | null
  contacts: Contact[]
  meta: {
    page: number
    per_page: number
    total: number
    last_page: number
  }
}

function pageUrl(page: number, status: string | null) {
  const query = new URLSearchParams({ page: String(page) })
  if (status) query.set('status', status)
  return `/admin/contact-requests?${query.toString()}`
}

function viewIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default function ContactInbox({
  adminName,
  csrfToken,
  success,
  status,
  contacts,
  meta,
}: Props) {
  const columns: ColumnsType<Contact> = [
    {
      title: 'View',
      key: 'view',
      width: 64,
      render: (_, contact) => {
        const href = `/admin/contact-requests/${contact.id}`
        return (
          <a
            href={href}
            className="action-pencil-btn"
            title={`View request from ${contact.full_name}`}
            aria-label={`View request from ${contact.full_name}`}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </a>
        )
      },
    },
    {
      title: 'Visitor',
      key: 'visitor',
      render: (_, contact) => (
        <div className="place-title-wrap tw:[display:flex] tw:[flex-direction:column]">
          <strong>{contact.full_name}</strong>
          <small>
            {contact.email}
            {contact.phone_number ? ` · ${contact.phone_number}` : ''}
          </small>
        </div>
      ),
    },
    {
      title: 'Inquiry Type',
      dataIndex: 'inquiry_type',
      key: 'inquiry_type',
      render: (inquiryType: Contact['inquiry_type']) =>
        inquiryType ? (
          <span className="type-chip tw:px-1.5 tw:py-0.5 tw:text-[11px] tw:[display:inline-flex] tw:[align-items:center] tw:[gap:8px] tw:[padding:6px_14px] tw:[border-radius:var(--radius-full)] tw:[background:var(--surface-subtle)] tw:[border:1px_solid_var(--line)] tw:[font-size:13px] tw:[font-weight:600] tw:[color:var(--ink-secondary)] tw:[transition:all_0.15s_ease]">
            {inquiryType}
          </span>
        ) : (
          <span className="tw:text-[13px] tw:text-brand-muted">General</span>
        ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (contactStatus: Contact['status']) => (
        <span
          className={`status ${
            contactStatus === 'resolved'
              ? 'published'
              : contactStatus === 'in_progress'
                ? 'draft'
                : 'archived'
          } tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:4px_10px] tw:[border-radius:var(--radius-full)] tw:[font-size:12px] tw:[font-weight:700] tw:[text-transform:capitalize] tw:[letter-spacing:0.02em] tw:[border:1px_solid_transparent] tw:[line-height:1.2]`}
        >
          {contactStatus.replace('_', ' ')}
        </span>
      ),
    },
    {
      title: 'Received (Kuwait)',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (createdAt: Contact['created_at']) => (
        <span className="tw:text-[13px] tw:text-brand-muted">{createdAt}</span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 88,
      align: 'right',
      render: (_, contact) => {
        const href = `/admin/contact-requests/${contact.id}`
        return (
          <RowActionMenu
            label={`More actions for request from ${contact.full_name}`}
            actions={[{ href, label: 'View inquiry', icon: viewIcon() }]}
          />
        )
      },
    },
  ]

  function changePage(pagination: TablePaginationConfig) {
    if (pagination.current && pagination.current !== meta.page) {
      window.location.assign(pageUrl(pagination.current, status))
    }
  }

  return (
    <AdminLayout
      title="Contact requests"
      active="contacts"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
    >
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div>
          <h1>Contact requests</h1>
        </div>
      </div>

      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:overflow-hidden tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>Messages ({meta.total})</h2>
        </div>
        <Table<Contact>
          className="cms-antd-table"
          rowKey="id"
          columns={columns}
          dataSource={contacts}
          pagination={{
            current: meta.page,
            pageSize: meta.per_page,
            total: meta.total,
            showSizeChanger: false,
            hideOnSinglePage: true,
            showTotal: () => `Page ${meta.page} of ${meta.last_page}`,
          }}
          onChange={changePage}
          scroll={{ x: 760 }}
          locale={{ emptyText: 'No contact inquiries received yet.' }}
        />
      </section>
    </AdminLayout>
  )
}
