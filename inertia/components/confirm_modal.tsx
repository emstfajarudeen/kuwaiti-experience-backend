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
