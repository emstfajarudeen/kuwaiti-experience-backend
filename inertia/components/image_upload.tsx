import { useEffect, useRef, useState } from 'react'
import { Button, message, Upload } from 'antd'
import type { UploadFile, UploadProps } from 'antd'

type Props = {
  name: string
  label?: string
  multiple?: boolean
  maxFiles?: number
  currentImageUrl?: string | null
  currentImageAlt?: string
  removeName?: string
  initiallyRemoved?: boolean
  allowRemove?: boolean
  disabledRemoveReason?: string
  invalid?: boolean
  errorMessage?: string | null
  onStateChange?: (state: { hasFile: boolean; removed: boolean }) => void
}
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export default function ImageUpload({
  name,
  label,
  multiple = false,
  maxFiles = 1,
  currentImageUrl,
  currentImageAlt = 'Current image',
  removeName,
  initiallyRemoved = false,
  allowRemove = true,
  disabledRemoveReason,
  invalid = false,
  errorMessage,
  onStateChange,
}: Props) {
  const nativeInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<UploadFile[]>([])
  const [removed, setRemoved] = useState(initiallyRemoved)
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null)

  useEffect(() => {
    onStateChange?.({ hasFile: files.length > 0, removed })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, removed])

  useEffect(() => {
    setRemoved(allowRemove && initiallyRemoved)
  }, [allowRemove, initiallyRemoved])

  useEffect(() => {
    const file = files[0]?.originFileObj
    if (!file || !(file instanceof Blob)) {
      setSelectedPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setSelectedPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [files])

  const updateFiles = (next: UploadFile[]) => {
    const input = nativeInput.current
    if (input) {
      const transfer = new DataTransfer()
      for (const item of next) {
        if (item.originFileObj) transfer.items.add(item.originFileObj)
      }
      input.files = transfer.files
    }
    setFiles(next)
  }

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    if (!allowedTypes.has(file.type)) {
      void message.error('Choose a JPG, PNG, or WebP image.')
      return Upload.LIST_IGNORE
    }
    if (file.size > 5 * 1024 * 1024) {
      void message.error('Images must be 5 MB or smaller.')
      return Upload.LIST_IGNORE
    }
    return false
  }

  const onChange: UploadProps['onChange'] = ({ fileList }) => {
    const accepted = fileList.filter((item) => item.originFileObj && allowedTypes.has(item.type ?? ''))
    const next = multiple ? accepted.slice(-maxFiles) : accepted.slice(-1)
    updateFiles(next)
    if (next.length > 0) setRemoved(false)
  }

  const hasCurrentImage = Boolean(currentImageUrl)
  const hasImage = hasCurrentImage && !removed
  const hasPreview = hasImage || files.length > 0
  const uploadLabel = multiple
    ? 'Add images'
    : hasCurrentImage && !removed
      ? 'Replace image'
      : files.length
        ? 'Replace image'
        : 'Choose image'

  const picker = (
    <Upload
      accept="image/jpeg,image/png,image/webp"
      multiple={multiple}
      fileList={files}
      beforeUpload={beforeUpload}
      onChange={onChange}
      showUploadList={false}
    >
      <Button className="button secondary" disabled={multiple && files.length >= maxFiles}>
        {uploadLabel}
      </Button>
    </Upload>
  )

  return (
    <div
      className="image-upload"
      id={`${name}-field`}
      style={invalid ? { border: '1px solid #9e2a2b', borderRadius: 8, padding: 8 } : undefined}
    >
      {Boolean(label) && <span className="image-upload-label">{label}</span>}
      {hasPreview ? (
        <div className="image-upload-current">
          <div className="image-upload-current-preview">
            <img
              src={selectedPreview ?? (hasImage ? currentImageUrl ?? undefined : undefined)}
              alt={currentImageAlt}
            />
          </div>
          <div className="image-upload-content">
            <div className="image-upload-status">
              <span className="image-upload-status-dot" />
              {files.length
                ? hasImage
                  ? 'Replacement ready'
                  : 'Ready to upload'
                : 'Current image'}
            </div>
            {files.length > 0 && (
              <div className="image-upload-files" aria-live="polite">
                {files.map((file) => (
                  <div className="image-upload-file" key={file.uid}>
                    <span className="image-upload-file-name">{file.name}</span>
                    <button
                      type="button"
                      className="image-upload-file-remove"
                      aria-label={`Remove selected file ${file.name}`}
                      onClick={() => updateFiles(files.filter((item) => item.uid !== file.uid))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="image-upload-actions">
              {picker}
              {removeName && hasImage && (
                <Button
                  danger
                  disabled={!allowRemove}
                  onClick={() => {
                    updateFiles([])
                    setRemoved(true)
                  }}
                >
                  Remove image
                </Button>
              )}
            </div>
            {!allowRemove && disabledRemoveReason && (
              <span className="image-upload-remove-note">{disabledRemoveReason}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="image-upload-empty">
          {hasCurrentImage && removed && (
            <div className="image-upload-removed" role="status">
              <span>Image will be removed when you save.</span>
              <Button size="small" onClick={() => setRemoved(false)}>
                Undo
              </Button>
            </div>
          )}
          {multiple && files.length > 0 && (
            <div className="image-upload-files" aria-live="polite">
              {files.map((file) => (
                <div className="image-upload-file" key={file.uid}>
                  <span className="image-upload-file-name">{file.name}</span>
                  <button
                    type="button"
                    className="image-upload-file-remove"
                    aria-label={`Remove selected file ${file.name}`}
                    onClick={() => updateFiles(files.filter((item) => item.uid !== file.uid))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {picker}
        </div>
      )}
      <input
        ref={nativeInput}
        className="image-upload-native"
        type="file"
        name={name}
        multiple={multiple}
        tabIndex={-1}
        aria-hidden="true"
      />
      {invalid && errorMessage && (
        <p role="alert" id={`${name}-error`} style={{ color: '#9e2a2b', margin: '8px 0 0', fontSize: 14 }}>
          {errorMessage}
        </p>
      )}
      {removeName && <input type="hidden" name={removeName} value={removed ? 'on' : ''} />}
    </div>
  )
}
