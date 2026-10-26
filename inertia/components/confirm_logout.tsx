import { useEffect, useRef, useState } from 'react'

export default function ConfirmLogout({ csrfToken }: { csrfToken: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (confirming && !dialog.open) dialog.showModal()
    if (!confirming && dialog.open) dialog.close()
  }, [confirming])

  return (
    <>
      <button
        type="button"
        className="logout-trigger tw:ml-auto tw:grid tw:size-[34px] tw:place-items-center tw:rounded-cms-sm tw:border-0 tw:bg-white/5 tw:text-base tw:text-[#c4d7e6] tw:hover:bg-brand-danger-bg tw:hover:text-brand-danger-text"
        title="Sign out"
        aria-label="Sign out"
        onClick={() => setConfirming(true)}
      >
        ↪
      </button>
      <dialog
        ref={dialogRef}
        className="cms-confirm-dialog tw:w-[min(420px,calc(100vw-32px))] tw:rounded-cms-lg tw:border tw:border-brand-line tw:p-6 tw:text-brand-ink tw:shadow-lg"
        aria-labelledby="logout-dialog-title"
        onClose={() => setConfirming(false)}
      >
        <h2 id="logout-dialog-title" className="tw:mb-3 tw:mt-0 tw:text-lg">
          Sign out
        </h2>
        <p className="tw:mb-6 tw:mt-0">Are you sure you want to log out of the admin panel?</p>
        <div className="cms-confirm-actions tw:flex tw:justify-end tw:gap-2">
          <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <form action="/admin/logout" method="POST">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <button type="submit" className="button primary">
              Sign out
            </button>
          </form>
        </div>
      </dialog>
    </>
  )
}
