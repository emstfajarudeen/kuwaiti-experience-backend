import { Button, Modal } from 'antd'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  message: string
  action: string
  csrfToken: string
  confirmLabel: string
  danger?: boolean
  /** Extra hidden inputs posted with the confirmation. */
  fields?: Record<string, string>
}

export default function ConfirmModal({
  open,
  onClose,
  title,
  message,
  action,
  csrfToken,
  confirmLabel,
  danger = false,
  fields = {},
}: Props) {
  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      width={420}
      footer={
        <div className="tw:flex tw:justify-end tw:gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <form action={action} method="POST">
            <input type="hidden" name="_csrf" value={csrfToken} />
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <Button htmlType="submit" type={danger ? 'primary' : 'default'} danger={danger}>
              {confirmLabel}
            </Button>
          </form>
        </div>
      }
    >
      <p className="tw:mb-2 tw:mt-0">{message}</p>
    </Modal>
  )
}
