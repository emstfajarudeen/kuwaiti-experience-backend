import { useRef, useState } from 'react'
import { Button, Input, Modal, Table, message } from 'antd'
import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import { formatDateTime, useCan, usePortal, type SharedProps } from '../../components/rental_ui'

// Changes update only this table: the page is not reloaded.
const keepPage = { preserveScroll: true } as const

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
  const [uploadOpen, setUploadOpen] = useState(false)
  const [renaming, setRenaming] = useState<Document | null>(null)
  const [newLabel, setNewLabel] = useState('')
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
        <Modal
          open={uploadOpen}
          title="Upload a document"
          footer={null}
          destroyOnClose
          onCancel={() => setUploadOpen(false)}
        >
          <form
            encType="multipart/form-data"
            className="tw:flex tw:flex-col tw:gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!label.trim() || !chosen) {
                void message.error(!chosen ? 'Choose a file to upload.' : 'Enter a label.')
                return
              }
              const data = new FormData(event.currentTarget)
              data.set('providerId', provider)
              data.set('_csrf', csrfToken)
              setUploading(true)
              router.post('/admin/rentals/documents', data, {
                forceFormData: true,
                preserveScroll: true,
                onSuccess: (page) => {
                  if (!(page.props as { error?: unknown }).error) {
                    setUploadOpen(false)
                    setLabel('')
                    setChosen(null)
                  }
                },
                onFinish: () => setUploading(false),
              })
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
            <div className="tw:flex tw:flex-col tw:gap-1.5 tw:text-[13px] tw:font-semibold">
              <span>
                <span className="tw:text-red-600">* </span>File
              </span>
              <div
                className="video-picker-drop"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const file = event.dataTransfer.files?.[0]
                  if (!file) return
                  if (fileInput.current) {
                    const transfer = new DataTransfer()
                    transfer.items.add(file)
                    fileInput.current.files = transfer.files
                  }
                  choose(file)
                }}
              >
                <span className="video-picker-file">
                  {chosen
                    ? `${chosen.name} · ${(chosen.size / 1024 / 1024).toFixed(1)} MB`
                    : 'Drag and drop a file here, or browse'}
                </span>
                <div className="video-picker-actions">
                  <button
                    type="button"
                    className="gallery-sorter-add-button"
                    onClick={() => fileInput.current?.click()}
                  >
                    {chosen ? 'Replace file' : '+ Choose file'}
                  </button>
                  {chosen && (
                    <button
                      type="button"
                      className="video-picker-link"
                      onClick={() => {
                        if (fileInput.current) fileInput.current.value = ''
                        setChosen(null)
                      }}
                    >
                      Remove selected
                    </button>
                  )}
                </div>
                <ul className="video-picker-rules">
                  <li>PDF, JPG or PNG</li>
                  <li>Up to {maxMb} MB</li>
                </ul>
              </div>
              <input
                ref={fileInput}
                className="image-upload-native"
                type="file"
                name="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => choose(event.target.files?.[0] ?? null)}
              />
            </div>
            <Button type="primary" htmlType="submit" loading={uploading} block>
              Upload
            </Button>
          </form>
        </Modal>
      )}

      <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
        <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
          <h2>
            {providerName ? `${providerName} - ` : ''}Documents ({rows.length})
          </h2>
          {canUpload && (
            <Button type="primary" onClick={() => setUploadOpen(true)}>
              + Upload document
            </Button>
          )}
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
              ...(can('rentals.update')
                ? [
                    {
                      title: '',
                      key: 'edit',
                      width: 70,
                      render: (_: unknown, row: Document) => (
                        <button
                          type="button"
                          className="action-pencil-btn"
                          aria-label={`Rename ${row.label}`}
                          onClick={() => {
                            setNewLabel(row.label)
                            setRenaming(row)
                          }}
                        >
                          ✎
                        </button>
                      ),
                    },
                  ]
                : []),
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
      <Modal
        open={Boolean(renaming)}
        title="Rename document"
        footer={null}
        destroyOnClose
        onCancel={() => setRenaming(null)}
      >
        <form
          className="tw:flex tw:flex-col tw:gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!renaming || !newLabel.trim()) return
            router.post(
              `/admin/rentals/documents/${renaming.id}/update`,
              { label: newLabel, _csrf: csrfToken },
              {
                ...keepPage,
                onSuccess: (page) => {
                  if (!(page.props as { error?: unknown }).error) setRenaming(null)
                },
              }
            )
          }}
        >
          <label className="tw:flex tw:flex-col tw:gap-1.5 tw:text-[13px] tw:font-semibold">
            <span>
              <span className="tw:text-red-600">* </span>Label
            </span>
            <Input
              name="label"
              maxLength={160}
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
            />
          </label>
          <Button type="primary" htmlType="submit" disabled={!newLabel.trim()} block>
            Save
          </Button>
        </form>
      </Modal>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete document"
        message={`Delete “${deleting?.label ?? 'this document'}”? The file is removed and cannot be recovered.`}
        csrfToken={csrfToken}
        onConfirm={() => {
          if (!deleting) return
          router.post(
            `/admin/rentals/documents/${deleting.id}/delete`,
            { _csrf: csrfToken },
            { ...keepPage, onSuccess: () => setDeleting(null) }
          )
        }}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
