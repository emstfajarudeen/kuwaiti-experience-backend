import { useEffect, useId, useState } from 'react'
import { App } from 'antd'

type Props = {
  message: string
  kind: 'error' | 'success'
  dismissible?: boolean
  eventKey?: object
}

export default function Notice({ message, kind, dismissible = false, eventKey }: Props) {
  const [visible, setVisible] = useState(true)
  const { notification } = App.useApp()
  const toastKey = useId()
  useEffect(() => {
    if (kind !== 'success') return
    notification.success({
      key: toastKey,
      title: message,
      role: 'status',
    })
    return () => notification.destroy(toastKey)
  }, [kind, message, eventKey, notification, toastKey])
  if (kind === 'success' || !visible) return null

  return (
    <div
      className="notice error tw:relative tw:mb-6 tw:flex tw:items-start tw:gap-3 tw:rounded-cms tw:px-5 tw:py-4 tw:text-sm tw:leading-[1.5] tw:shadow-sm tw:border tw:border-brand-danger-border tw:bg-brand-danger-bg tw:text-brand-danger-text"
      role="alert"
    >
      <span
        className="notice-icon tw:mt-px tw:shrink-0 tw:text-lg tw:leading-none"
        aria-hidden="true"
      >
        ⚠
      </span>
      <div className="notice-body tw:grow tw:font-medium">{message}</div>
      {dismissible && (
        <button
          type="button"
          className="notice-close tw:cursor-pointer tw:border-0 tw:bg-transparent tw:px-1 tw:text-lg tw:leading-none tw:text-current tw:opacity-60 tw:transition-opacity tw:duration-150 tw:hover:opacity-100"
          aria-label="Dismiss notice"
          onClick={() => setVisible(false)}
        >
          ✕
        </button>
      )}
    </div>
  )
}
