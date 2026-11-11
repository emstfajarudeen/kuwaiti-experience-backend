import { useRef, useState } from 'react'
import { Button, Input, Select, Table, message } from 'antd'
import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import { formatDateTime, useCan, usePortal, type SharedProps } from '../../components/rental_ui'

type Document = {
  id: number
  label: string
  file_name: string
  mime_type: string
  size_bytes: number
  url: string
  created_at: string
}

type Props = SharedProps & {
  provider: string
  providers: { value: string; label: string }[]
  maxMb: number
  rows: Document[]
}

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

const fileKind = (mime: string) =>
  mime === 'application/pdf' ? 'PDF' : mime === 'image/png' ? 'PNG' : 'JPG'

export default function RentalDocuments({
  adminName,
  csrfToken,
  success,
  error,
  provider,
  providers,
  maxMb,
  rows,
}: Props) {
  const can = useCan()
  // Provider portal: their own documents only, so no provider choice.
  const portal = usePortal()
  const providerName = portal ? '' : providers.find((option) => option.value === provider)?.label
  const fileInput = useRef<HTMLInputElement>(null)
  const [label, setLabel] = useState('')
  const [chosen, setChosen] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<Document | null>(null)
  const canUpload = can('rentals.update') && Boolean(provider)

  const choose = (file: File | null) => {
    if (file && file.size > maxMb * 1024 * 1024) {
      void message.error(`Files must be ${maxMb} MB or smaller.`)
      if (fileInput.current) fileInput.current.value = ''
      setChosen(null)
      return
    }
    setChosen(file)
    // Suggest a label from the file name, which staff can change.
    if (file && !label.trim())
      setLabel(
        file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .slice(0, 160)
      )
  }

  return (
    <AdminLayout
      title={providerName ? `${providerName} · Documents` : 'Documents'}
      active="rental-documents"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      {!portal && (
        <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/providers">
          ← Back to providers
        </a>
      )}
      <div className="page-head tw:mb-6">
        <h1>Documents</h1>
      </div>

      {canUpload && (
        <section className="panel tw:mb-6 tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-6">
          <div className="tw:mb-4 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-3">
            <div>
              <h2 className="tw:m-0">Upload a document</h2>
              <p className="tw:m-0 tw:mt-1 tw:text-[13px] tw:text-brand-muted">
                Trade licence, insurance certificate, contract and similar. PDF, JPG or PNG up to{' '}
                {maxMb} MB. Only{' '}
                {portal ? 'you and the Kuwaiti Experience team' : 'staff and the provider'} can see
                these; they are never shown in the app.
              </p>
            </div>
            {!portal && (
              <Select
                className="tw:min-w-[220px]"
                value={provider || undefined}
                options={providers}
                onChange={(value) => router.get('/admin/rentals/documents', { provider: value })}
              />
            )}
          </div>
          <form
            method="post"
            action="/admin/rentals/documents"
            encType="multipart/form-data"
            className="tw:grid tw:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] tw:items-end tw:gap-4 tw:max-[900px]:grid-cols-1"
            onSubmit={(event) => {
              if (!label.trim() || !chosen) {
                event.preventDefault()
                void message.error(!chosen ? 'Choose a file to upload.' : 'Enter a label.')
                return
              }
              setUploading(true)
            }}
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="providerId" value={provider} />
            <label className="tw:flex tw:flex-col tw:gap-1.5 tw:text-[13px] tw:font-semibold">
              <span>
                <span className="tw:text-red-600">* </span>Label
              </span>
              <Input
                name="label"
                maxLength={160}
                value={label}
                placeholder="e.g. Trade licence 2026"
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            <label className="tw:flex tw:flex-col tw:gap-1.5 tw:text-[13px] tw:font-semibold">
              <span>
                <span className="tw:text-red-600">* </span>File
              </span>
              <input
                ref={fileInput}
                type="file"
                name="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => choose(event.target.files?.[0] ?? null)}
                className="tw:w-full tw:rounded-cms-sm tw:border tw:border-brand-line tw:bg-white tw:p-[5px] tw:text-[13px] tw:font-normal file:tw:mr-3 file:tw:cursor-pointer file:tw:rounded-cms-sm file:tw:border-0 file:tw:bg-brand-surface-subtle file:tw:px-3 file:tw:py-1.5 file:tw:font-semibold file:tw:text-brand-ink"
              />
            </label>
            <Button type="primary" htmlType="submit" loading={uploading}>
              Upload
            </Button>
          </form>
        </section>
      )}

      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>
            {providerName ? `${providerName} - ` : ''}Documents ({rows.length})
          </h2>
        </div>
        <div className="table-scroll">
          <Table<Document>
            className="cms-antd-table"
            rowKey="id"
            dataSource={rows}
            pagination={false}
            locale={{
              emptyText: provider
                ? 'No documents yet. Documents are optional.'
                : 'Add a provider first.',
            }}
            columns={[
              {
                title: 'Document',
                key: 'label',
                render: (_: unknown, row: Document) => (
                  <div className="tw:flex tw:min-w-[220px] tw:items-center tw:gap-3">
                    <span
                      aria-hidden="true"
                      className={`tw:grid tw:h-10 tw:w-9 tw:place-items-center tw:rounded tw:text-[10px] tw:font-bold tw:text-white ${row.mime_type === 'application/pdf' ? 'tw:bg-red-700' : 'tw:bg-brand-navy'}`}
                    >
                      {fileKind(row.mime_type)}
                    </span>
                    <div className="tw:flex tw:min-w-0 tw:flex-col">
                      <a href={row.url} target="_blank" rel="noreferrer">
                        <strong>{row.label}</strong>
                      </a>
                      <span className="tw:truncate tw:text-[12px] tw:text-brand-muted">
                        {row.file_name}
                      </span>
                    </div>
                  </div>
                ),
              },
              {
                title: 'Size',
                key: 'size',
                render: (_: unknown, row: Document) => (
                  <span className="tw:whitespace-nowrap">{fileSize(row.size_bytes)}</span>
                ),
              },
              {
                title: 'Uploaded',
                key: 'created',
                render: (_: unknown, row: Document) => (
                  <span className="tw:whitespace-nowrap tw:text-[13px]">
                    {formatDateTime(row.created_at)}
                  </span>
                ),
              },
              {
                title: 'Actions',
                key: 'more',
                width: 90,
                render: (_: unknown, row: Document) => (
                  <RowActionMenu
                    label={`Actions for ${row.label}`}
                    actions={[
                      {
                        label: 'Open',
                        onClick: () => window.open(row.url, '_blank', 'noopener'),
                      },
                      ...(can('rentals.delete')
                        ? [{ label: 'Delete', danger: true, onClick: () => setDeleting(row) }]
                        : []),
                    ]}
                  />
                ),
              },
            ]}
          />
        </div>
      </section>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete document"
        message={`Delete “${deleting?.label ?? 'this document'}”? The file is removed and cannot be recovered.`}
        action={deleting ? `/admin/rentals/documents/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
