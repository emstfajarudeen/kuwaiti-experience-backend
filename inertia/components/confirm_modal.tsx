import { useEffect, useRef } from 'react'

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
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="cms-confirm-dialog tw:w-[min(420px,calc(100vw-32px))] tw:rounded-cms-lg tw:border tw:border-brand-line tw:p-6 tw:text-brand-ink tw:shadow-lg"
      aria-labelledby="confirm-title"
      onClose={onClose}
    >
      <h2 id="confirm-title" className="tw:mb-3 tw:mt-0 tw:text-lg">
        {title}
      </h2>
      <p className="tw:mb-6 tw:mt-0">{message}</p>
      <div className="cms-confirm-actions tw:flex tw:justify-end tw:gap-2">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <form action={action} method="POST">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <button type="submit" className={`button ${danger ? 'danger' : 'primary'}`}>
            {confirmLabel}
          </button>
        </form>
      </div>
    </dialog>
  )
}
