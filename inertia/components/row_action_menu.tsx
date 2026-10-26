import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type Action = {
  href?: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  danger?: boolean
  target?: '_blank'
}

type Props = {
  label: string
  actions: Action[]
}

export default function RowActionMenu({ label, actions }: Props) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const close = () => setOpen(false)
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const dropdownHeight = 120
    const above = window.innerHeight - rect.bottom < dropdownHeight && rect.top > dropdownHeight
    setPosition({
      top: above ? undefined : rect.bottom + 4,
      bottom: above ? window.innerHeight - rect.top + 4 : undefined,
      right: Math.max(10, window.innerWidth - rect.right),
      left: 'auto',
    })
    setOpen(true)
  }

  return (
    <div
      ref={rootRef}
      className={`row-menu tw:relative tw:inline-block tw:text-right${open ? ' is-open' : ''}`}
    >
      <button
        ref={buttonRef}
        type="button"
        className="action-dots-btn tw:inline-flex tw:size-[34px] tw:items-center tw:justify-center tw:rounded-cms-sm tw:border tw:border-brand-line-strong tw:bg-white tw:p-0 tw:leading-none tw:text-brand-ink-secondary tw:transition-all tw:duration-150 tw:hover:border-brand-navy tw:hover:bg-brand-surface-subtle tw:hover:text-brand-navy tw:aria-expanded:border-brand-navy tw:aria-expanded:bg-brand-surface-subtle tw:aria-expanded:text-brand-navy"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title="More actions"
        onClick={toggle}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      <div
        className={`row-menu-dropdown tw:fixed tw:z-[99999] tw:min-w-[150px] tw:box-border tw:flex-col tw:gap-0.5 tw:rounded-cms-sm tw:border tw:border-brand-line tw:bg-white tw:p-1.5 tw:shadow-[0_8px_24px_rgba(0,23,46,0.12),0_2px_6px_rgba(0,23,46,0.06)] ${open ? 'tw:flex' : 'tw:hidden'}`}
        role="menu"
        style={open ? position : undefined}
      >
        {actions.map((action) =>
          action.href ? (
            <a
              key={action.label}
              href={action.href}
              target={action.target}
              rel={action.target === '_blank' ? 'noopener noreferrer' : undefined}
              className="row-menu-item tw:flex tw:min-h-[34px] tw:w-full tw:items-center tw:gap-2.5 tw:rounded tw:border-0 tw:bg-transparent tw:px-3 tw:py-2 tw:text-left tw:text-[13px] tw:font-medium tw:text-brand-ink tw:no-underline tw:transition-[background,color] tw:duration-[120ms] tw:hover:bg-brand-navy-surface tw:hover:text-brand-navy"
              role="menuitem"
            >
              {action.icon}
              <span>{action.label}</span>
            </a>
          ) : (
            <button
              key={action.label}
              type="button"
              className={`row-menu-item tw:flex tw:min-h-[34px] tw:w-full tw:items-center tw:gap-2.5 tw:rounded tw:border-0 tw:bg-transparent tw:px-3 tw:py-2 tw:text-left tw:text-[13px] tw:font-medium tw:text-brand-ink tw:transition-[background,color] tw:duration-[120ms] tw:hover:bg-brand-navy-surface tw:hover:text-brand-navy ${action.danger ? 'danger tw:text-brand-danger-text tw:hover:bg-brand-danger-bg tw:hover:text-brand-danger-text' : ''}`}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                action.onClick?.()
              }}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          )
        )}
      </div>
    </div>
  )
}
