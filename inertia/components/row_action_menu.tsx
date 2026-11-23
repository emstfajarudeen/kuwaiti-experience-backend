import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

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
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const close = () => setOpen(false)
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) close()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
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
    // Placed below the button first; the layout effect moves it once its real height is known.
    setPosition({ top: rect.bottom + 4, right: Math.max(10, window.innerWidth - rect.right) })
    setOpen(true)
  }

  // Keeps every item on screen, including on the last rows of a table: opens above the button
  // when there is no room below, and otherwise stays inside the window.
  useLayoutEffect(() => {
    if (!open) return
    const button = buttonRef.current?.getBoundingClientRect()
    const menu = menuRef.current?.getBoundingClientRect()
    if (!button || !menu) return
    const gap = 8
    const right = Math.max(10, window.innerWidth - button.right)
    let top = button.bottom + 4
    if (top + menu.height > window.innerHeight - gap) {
      const above = button.top - 4 - menu.height
      top = above >= gap ? above : Math.max(gap, window.innerHeight - gap - menu.height)
    }
    if (top !== position.top || right !== position.right) setPosition({ top, right })
  }, [open, position])

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
      {/* Rendered on <body> so no table scroll box or transformed parent can cut it off. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`row-menu-dropdown tw:fixed tw:z-[99999] tw:max-h-[calc(100vh-16px)] tw:min-w-[150px] tw:overflow-y-auto tw:box-border tw:flex-col tw:gap-0.5 tw:rounded-cms-sm tw:border tw:border-brand-line tw:bg-white tw:p-1.5 tw:shadow-[0_8px_24px_rgba(0,23,46,0.12),0_2px_6px_rgba(0,23,46,0.06)] ${open ? 'tw:flex' : 'tw:hidden'}`}
            ref={menuRef}
            role="menu"
            style={open ? position : undefined}
            // React bubbles portal events to the table row; keep menu clicks from opening the row.
            onClick={(event) => event.stopPropagation()}
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
          </div>,
          document.body
        )}
    </div>
  )
}
