import { useEffect, useState } from 'react'

type Props = {
  message: string
  kind: 'error' | 'success'
  dismissible?: boolean
}

export default function Notice({ message, kind, dismissible = false }: Props) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    if (kind !== 'success') return
    let disposed = false
    let toast: HTMLElement | null = null
    void import('@awesome.me/webawesome/dist/components/toast/toast.js').then(async () => {
      if (disposed) return
      toast = document.createElement('wa-toast')
      toast.setAttribute('placement', 'top-end')
      document.body.append(toast)
      await customElements.whenDefined('wa-toast')
      if (!disposed) {
        ;(
          toast as HTMLElement & {
            create: (text: string, options: { variant: string; duration: number }) => void
          }
        ).create(message, { variant: 'success', duration: 4000 })
      }
    })
    return () => {
      disposed = true
      toast?.remove()
    }
  }, [kind, message])
  if (!visible) return null

  return (
    <div
      className={`notice ${kind} tw:relative tw:mb-6 tw:flex tw:items-start tw:gap-3 tw:rounded-cms tw:px-5 tw:py-4 tw:text-sm tw:leading-[1.5] tw:shadow-sm ${kind === 'success' ? 'tw:border tw:border-brand-success-border tw:bg-brand-success-bg tw:text-brand-success-text' : 'tw:border tw:border-brand-danger-border tw:bg-brand-danger-bg tw:text-brand-danger-text'}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <span
        className="notice-icon tw:mt-px tw:shrink-0 tw:text-lg tw:leading-none"
        aria-hidden="true"
      >
        {kind === 'error' ? '⚠' : '✓'}
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
