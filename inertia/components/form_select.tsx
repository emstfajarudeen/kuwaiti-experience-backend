import { Form, Select } from 'antd'

type Option = { value: string; label: string }
type Props = {
  name: string
  id?: string
  value: string
  options: Option[]
  placeholder?: string
  required?: boolean
  onChange: (value: string) => void
}

/** Ant Design select backed by a native form value for existing GET/multipart forms. */
export default function FormSelect({ name, id, value, options, placeholder, required, onChange }: Props) {
  const { status } = Form.Item.useStatus()
  return <>
    <Select id={id} status={status === 'error' ? 'error' : undefined} value={value || undefined} placeholder={placeholder} options={options} onChange={(next) => onChange(next ?? '')} allowClear={!required} />
    <input type="hidden" name={name} value={value} />
  </>
}
