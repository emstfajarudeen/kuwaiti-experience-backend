import { useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { App, Button, Form, Input, Radio, Select, Table } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import AdminLayout from '../../layouts/admin_layout'
import { postCmsForm } from '../../lib/cms_form'

type Audience = 'all' | 'ios' | 'android' | 'customer'
type Platform = { users: number; devices: number }

type Broadcast = {
  id: number
  title: string
  body: string
  title_ar: string | null
  body_ar: string | null
  audience: Audience
  status: 'queued' | 'processing' | 'completed' | 'failed'
  recipients: number
  devices: number
  delivered: number
  failed: number
  pending: number
  removed: number
  error: string | null
  sent_by: string | null
  created_at: string
}

type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  canSend: boolean
  customers: Array<{ value: number; label: string }>
  requestKey: string
  overview: {
    configured: boolean
    audiences: { all: Platform; ios: Platform; android: Platform }
    queue: { pending: number; overdue: number; stalledBroadcasts: number }
  }
  broadcasts: Broadcast[]
  meta: { page: number; per_page: number; total: number; last_page: number }
}

type Values = {
  audience: Audience
  customer_id?: number
  title: string
  body: string
  title_ar?: string
  body_ar?: string
}

const audienceLabel: Record<Audience, string> = {
  all: 'Everyone',
  ios: 'iOS users',
  android: 'Android users',
  customer: 'Single user',
}

const panel =
  'panel form-panel tw:mb-6 tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-6'
const tile =
  'tw:flex tw:flex-col tw:gap-1 tw:rounded-cms tw:border tw:border-brand-line-subtle tw:bg-white tw:px-4 tw:py-3'
const tileLabel = 'tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-[0.1em] tw:text-brand-muted'

function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`
}

export default function NotificationsPage({
  adminName,
  csrfToken,
  success,
  error,
  canSend,
  customers,
  requestKey,
  overview,
  broadcasts,
  meta,
}: Props) {
  const { modal } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [processing, setProcessing] = useState(false)
  const [checking, setChecking] = useState(false)
  const submitted = useRef(false)
  const audience = Form.useWatch('audience', form) ?? 'customer'
  const title = Form.useWatch('title', form)
  const body = Form.useWatch('body', form)
  const titleAr = Form.useWatch('title_ar', form)
  const bodyAr = Form.useWatch('body_ar', form)
  const { audiences, queue, configured } = overview

  // Every render of this page carries a fresh idempotency key. After a successful send,
  // clear the message so it can't be sent twice by accident.
  useEffect(() => {
    if (submitted.current && success) form.resetFields(['title', 'body', 'title_ar', 'body_ar', 'customer_id'])
    submitted.current = false
  }, [requestKey])

  const reach = (value: Audience) =>
    value === 'customer'
      ? 'one user'
      : `${plural(audiences[value].users, 'user')} · ${plural(audiences[value].devices, 'device')}`

  function send(values: Values) {
    const run = () => {
      submitted.current = true
      postCmsForm({
        action: '/admin/notifications',
        csrfToken,
        form,
        setProcessing,
        data: {
          request_key: requestKey,
          audience: values.audience,
          customer_id: values.audience === 'customer' ? (values.customer_id ?? '') : '',
          title: values.title,
          body: values.body,
          title_ar: values.title_ar ?? '',
          body_ar: values.body_ar ?? '',
        },
      })
    }
    if (values.audience === 'customer') return run()
    modal.confirm({
      title: `Send to ${audienceLabel[values.audience].toLowerCase()}?`,
      content: `This notification will reach ${reach(values.audience)} and can't be recalled once sent.`,
      okText: 'Send notification',
      cancelText: 'Cancel',
      onOk: run,
    })
  }

  // Reloads the page data. Staff who can send also re-check the push connection, which
  // redirects back here with the result and fresh numbers.
  function refresh() {
    if (!canSend) {
      router.reload({
        onStart: () => setChecking(true),
        onFinish: () => setChecking(false),
      })
      return
    }
    router.post(
      '/admin/notifications/check-connection',
      { _csrf: csrfToken },
      {
        headers: { 'X-CSRF-TOKEN': csrfToken },
        onStart: () => setChecking(true),
        onFinish: () => setChecking(false),
      }
    )
  }

  const columns: ColumnsType<Broadcast> = [
    {
      title: 'Sent ',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      render: (value: string, row) => (
        <div className="tw:flex tw:flex-col">
          <span className="tw:text-[13px] tw:text-brand-muted">{value}</span>
          {row.sent_by && <small>{row.sent_by}</small>}
        </div>
      ),
    },
    {
      title: 'Message',
      key: 'message',
      render: (_, row) => (
        <div className="place-title-wrap tw:[display:flex] tw:[flex-direction:column]">
          <strong>{row.title}</strong>
          <small className="tw:max-w-[420px] tw:whitespace-normal">{row.body}</small>
          {row.title_ar && (
            <>
              <strong dir="rtl" lang="ar" className="tw:mt-2 tw:block">
                {row.title_ar}
              </strong>
              <small dir="rtl" lang="ar" className="tw:max-w-[420px] tw:whitespace-normal">
                {row.body_ar}
              </small>
            </>
          )}
        </div>
      ),
    },
    {
      title: 'Audience',
      dataIndex: 'audience',
      key: 'audience',
      render: (value: Audience) => audienceLabel[value],
    },
    {
      title: 'Reach',
      key: 'reach',
      render: (_, row) =>
        row.status === 'queued' || row.status === 'processing' ? (
          <span className="tw:text-[13px] tw:text-brand-muted">Preparing…</span>
        ) : (
          <div className="tw:flex tw:flex-col">
            <span>{plural(row.recipients, 'user')}</span>
            <small>{plural(row.devices, 'device')}</small>
          </div>
        ),
    },
    {
      title: 'Push delivery',
      key: 'delivery',
      render: (_, row) => {
        if (row.status === 'failed')
          return <span className="tw:text-brand-danger-text">{row.error ?? 'Failed'}</span>
        if (row.status !== 'completed') return '—'
        if (!row.devices) return <small>In-app only · no registered devices</small>
        return (
          <div className="tw:flex tw:flex-col">
            <strong>
              {row.delivered.toLocaleString()} / {row.devices.toLocaleString()} delivered
            </strong>
            <small>
              {[
                row.pending ? `${row.pending.toLocaleString()} pending` : null,
                row.failed ? `${row.failed.toLocaleString()} failed` : null,
                row.removed ? `${row.removed.toLocaleString()} invalid removed` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'All devices reached'}
            </small>
          </div>
        )
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value: Broadcast['status']) => (
        <span
          className={`status ${value === 'completed' ? 'published' : value === 'failed' ? 'archived' : 'draft'} tw:capitalize`}
        >
          {value}
        </span>
      ),
    },
  ]

  function changePage(pagination: TablePaginationConfig) {
    if (pagination.current && pagination.current !== meta.page)
      window.location.assign(`/admin/notifications?page=${pagination.current}`)
  }

  const delayed = queue.overdue > 0 || queue.stalledBroadcasts > 0

  return (
    <AdminLayout
      title="Notifications"
      active="notifications"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <div className="page-head form-page-head tw:mb-6">
        <h1>Notifications</h1>
      </div>

      <section className={panel}>
        <h2>Delivery status</h2>
        <div className="tw:mt-4 tw:grid tw:grid-cols-4 tw:gap-3 tw:max-[900px]:grid-cols-2 tw:max-[560px]:grid-cols-1">
          <div className={tile}>
            <span className={tileLabel}>Push service</span>
            <span className="tw:flex tw:items-center tw:justify-between tw:gap-2">
              <span className={`status ${configured ? 'published' : 'archived'}`}>
                {configured ? 'Configured' : 'Not configured'}
              </span>
              <Button
                size="small"
                className="button secondary tw:!min-w-8 tw:!px-0"
                aria-label="Refresh status"
                title={
                  canSend
                    ? 'Refresh status and check the push connection'
                    : 'Refresh status'
                }
                icon={<ReloadOutlined />}
                onClick={refresh}
                loading={checking}
              />
            </span>
          </div>
          <div className={tile}>
            <span className={tileLabel}>Registered devices</span>
            <strong>{audiences.all.devices.toLocaleString()}</strong>
            <small>
              iOS {audiences.ios.devices.toLocaleString()} · Android{' '}
              {audiences.android.devices.toLocaleString()}
            </small>
          </div>
          <div className={tile}>
            <span className={tileLabel}>App users</span>
            <strong>{audiences.all.users.toLocaleString()}</strong>
            <small>receive the in-app inbox message</small>
          </div>
          <div className={tile}>
            <span className={tileLabel}>Waiting to send</span>
            <strong>{queue.pending.toLocaleString()}</strong>
            <small>
              {!configured
                ? 'Push is not configured'
                : delayed
                  ? 'Delayed — see note below'
                  : queue.pending
                    ? 'Delivering…'
                    : 'Nothing waiting'}
            </small>
          </div>
        </div>
        {!configured && (
          <p className="tw:mt-4 tw:text-brand-danger-text">
            Firebase is not configured on the server (FCM_PROJECT_ID, FCM_CLIENT_EMAIL and
            FCM_PRIVATE_KEY). Notifications will still appear in the app inbox, but no push will be
            delivered.
          </p>
        )}
        {configured && delayed && (
          <p className="tw:mt-4 tw:text-brand-danger-text">
            Some notifications have been waiting for more than 2 minutes. Make sure the delivery
            worker is running: <code>node ace notifications:deliver-push --watch</code>.
          </p>
        )}
      </section>

      {canSend && (
        <Form
          id="notification-composer"
          form={form}
          layout="vertical"
          initialValues={{ audience: 'customer', title: '', body: '', title_ar: '', body_ar: '' }}
          onFinish={send}
        >
          <section className={panel}>
            <h2>New notification</h2>
            <div className="tw:mt-4 tw:grid tw:grid-cols-[minmax(0,1fr)_320px] tw:gap-8 tw:max-[900px]:grid-cols-1">
              <div>
                <Form.Item name="audience" label="Audience">
                  <Radio.Group className="tw:flex tw:flex-col tw:gap-2">
                    {(['customer', 'all'] as const).map((value) => (
                      <Radio key={value} value={value}>
                        <strong>{audienceLabel[value]}</strong>
                        <small className="tw:ml-2 tw:text-brand-muted">
                          {value === 'customer' ? 'recommended for testing' : reach(value)}
                        </small>
                      </Radio>
                    ))}
                  </Radio.Group>
                </Form.Item>
                {audience === 'customer' && (
                  <Form.Item
                    name="customer_id"
                    label="User"
                    extra="Search by name or phone number. Only users who have signed in to the app are listed."
                    rules={[{ required: true, message: 'Select a user' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select a user"
                      options={customers}
                      notFoundContent="No matching users"
                    />
                  </Form.Item>
                )}
                <Form.Item
                  name="title"
                  label="Title (English)"
                  rules={[{ required: true, whitespace: true, message: 'Enter a title' }]}
                >
                  <Input maxLength={100} showCount />
                </Form.Item>
                <Form.Item
                  name="body"
                  label="Message (English)"
                  rules={[{ required: true, whitespace: true, message: 'Enter a message' }]}
                >
                  <Input.TextArea rows={4} maxLength={500} showCount />
                </Form.Item>
                <div className="tw:mb-6 tw:border-t tw:border-brand-line-subtle tw:pt-5">
                  <span className={tileLabel}>Arabic (optional)</span>
                  <p className="tw:mb-4 tw:mt-1 tw:text-[13px] tw:text-brand-muted">
                    Sent together with the English text. The app shows the language the user has
                    chosen in the app. Leave both empty to send English only.
                  </p>
                  <Form.Item
                    name="title_ar"
                    label="Title (Arabic)"
                    dependencies={['body_ar']}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator: (_, value) =>
                          String(getFieldValue('body_ar') ?? '').trim() &&
                          !String(value ?? '').trim()
                            ? Promise.reject(new Error('Enter the Arabic title too'))
                            : Promise.resolve(),
                      }),
                    ]}
                  >
                    <Input
                      dir="rtl"
                      lang="ar"
                      maxLength={100}
                      showCount
                      placeholder="عنوان الإشعار بالعربية…"
                    />
                  </Form.Item>
                  <Form.Item
                    name="body_ar"
                    label="Message (Arabic)"
                    dependencies={['title_ar']}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator: (_, value) =>
                          String(getFieldValue('title_ar') ?? '').trim() &&
                          !String(value ?? '').trim()
                            ? Promise.reject(new Error('Enter the Arabic message too'))
                            : Promise.resolve(),
                      }),
                    ]}
                  >
                    <Input.TextArea
                      dir="rtl"
                      lang="ar"
                      rows={4}
                      maxLength={500}
                      showCount
                      placeholder="اكتب محتوى الرسالة هنا…"
                    />
                  </Form.Item>
                </div>
                <Button
                  className="button primary"
                  htmlType="submit"
                  loading={processing}
                  disabled={processing}
                >
                  Send notification
                </Button>
              </div>
              <div aria-label="Notification preview">
                <span className={tileLabel}>Preview · English</span>
                <div className="tw:mt-2 tw:flex tw:gap-3 tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-[#f4f7fa] tw:p-4">
                  <span
                    className="tw:grid tw:size-10 tw:min-w-10 tw:place-items-center tw:rounded-cms tw:bg-brand-navy tw:font-playfair tw:text-[22px] tw:italic tw:text-brand-gold"
                    aria-hidden="true"
                  >
                    K
                  </span>
                  <div className="tw:min-w-0">
                    <strong className="tw:block tw:break-words">
                      {title?.trim() || 'Notification title'}
                    </strong>
                    <span className="tw:block tw:whitespace-pre-wrap tw:break-words tw:text-[13px] tw:text-brand-muted">
                      {body?.trim() || 'Your message will appear here.'}
                    </span>
                  </div>
                </div>
                {(titleAr?.trim() || bodyAr?.trim()) && (
                  <>
                    <span className={`${tileLabel} tw:mt-4 tw:block`}>Preview · Arabic</span>
                    <div
                      dir="rtl"
                      lang="ar"
                      className="tw:mt-2 tw:flex tw:gap-3 tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-[#f4f7fa] tw:p-4"
                    >
                      <span
                        className="tw:grid tw:size-10 tw:min-w-10 tw:place-items-center tw:rounded-cms tw:bg-brand-navy tw:font-playfair tw:text-[22px] tw:italic tw:text-brand-gold"
                        aria-hidden="true"
                      >
                        K
                      </span>
                      <div className="tw:min-w-0">
                        <strong className="tw:block tw:break-words">
                          {titleAr?.trim() || 'عنوان الإشعار'}
                        </strong>
                        <span className="tw:block tw:whitespace-pre-wrap tw:break-words tw:text-[13px] tw:text-brand-muted">
                          {bodyAr?.trim() || 'ستظهر رسالتك هنا.'}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </Form>
      )}

      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:bg-white tw:px-6 tw:py-5">
          <h2>History ({meta.total})</h2>
        </div>
        <Table<Broadcast>
          className="cms-antd-table"
          rowKey="id"
          columns={columns}
          dataSource={broadcasts}
          pagination={{
            current: meta.page,
            pageSize: meta.per_page,
            total: meta.total,
            showSizeChanger: false,
            hideOnSinglePage: true,
            showTotal: () => `Page ${meta.page} of ${meta.last_page}`,
          }}
          onChange={changePage}
          locale={{ emptyText: 'No notifications have been sent yet.' }}
        />
      </section>
    </AdminLayout>
  )
}
