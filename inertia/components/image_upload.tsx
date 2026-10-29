import { useRef, useState } from 'react'
import { Button, message, Upload } from 'antd'
import type { UploadFile, UploadProps } from 'antd'

type Props = { name: string; label?: string; multiple?: boolean; maxFiles?: number }
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export default function ImageUpload({ name, label, multiple = false, maxFiles = 1 }: Props) {
  const nativeInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<UploadFile[]>([])

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
    updateFiles(multiple ? accepted.slice(-maxFiles) : accepted.slice(-1))
  }

  return (
    <div className="image-upload">
      {Boolean(label) && <span className="image-upload-label">{label}</span>}
      <Upload accept="image/jpeg,image/png,image/webp" multiple={multiple} fileList={files} beforeUpload={beforeUpload} onChange={onChange} onRemove={(file) => updateFiles(files.filter((item) => item.uid !== file.uid))} listType="picture">
        <Button disabled={multiple && files.length >= maxFiles}>{multiple ? 'Add images' : files.length ? 'Replace image' : 'Choose image'}</Button>
      </Upload>
      <input ref={nativeInput} className="image-upload-native" type="file" name={name} multiple={multiple} tabIndex={-1} aria-hidden="true" />
    </div>
  )
}
