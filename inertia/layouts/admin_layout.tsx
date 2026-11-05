import { Head, Link } from '@inertiajs/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import AdminProfileMenu from '../components/admin_profile_menu'
import Notice from '../components/notice'
import { usePage } from '@inertiajs/react'

type SharedAuth = {
  permissions: string[]
  landingUrl: string
  roleSlugs: string[]
  isSuperAdmin: boolean
  isFullAccessAdmin: boolean
  mustChangePassword: boolean
} | null

const navigation = [
  {
    label: 'OVERVIEW',
    links: [
      {
        href: '/admin',
        icon: '◫',
        label: 'Dashboard',
        active: 'dashboard',
        permission: 'dashboard.view',
      },
    ],
  },
  {
    label: 'MASTERS',
    links: [
      {
        href: '/admin/places',
        icon: '⌁',
        label: 'Business/Places',
        active: 'places',
        permission: 'places.view',
      },
      {
        href: '/admin/pages',
        icon: '▤',
        label: 'Pages',
        active: 'pages',
        permission: 'pages.view',
      },
      {
        href: '/admin/categories',
        icon: '◈',
        label: 'Categories',
        active: 'categories',
        permission: 'categories.view',
      },
      {
        href: '/admin/category-types',
        icon: '◇',
        label: 'Category types',
        active: 'category-types',
        permission: 'category_types.view',
      },
      {
        href: '/admin/videos',
        icon: '▶',
        label: 'Videos',
        active: 'videos',
        permission: 'videos.view',
      },
      {
        href: '/admin/countries',
        icon: '◎',
        label: 'Countries',
        active: 'countries',
        permission: 'countries.view',
      },
    ],
  },
  {
    label: 'ACCOUNTS & ACCESS',
    links: [
      {
        href: '/admin/customers',
        icon: '♙',
        label: 'Users',
        active: 'customers',
        permission: 'customers.view',
      },
      {
        href: '/admin/users',
        icon: '♟',
        label: 'Staff',
        active: 'users',
        permission: 'staff.view',
      },
      {
        href: '/admin/roles',
        icon: '⚿',
        label: 'Roles & Permissions',
        active: 'roles',
        permission: 'roles.view',
      },
    ],
  },
  {
    label: 'OPERATIONS',
    links: [
      {
        href: '/admin/contact-requests',
        icon: '✉',
        label: 'Contact requests',
        active: 'contacts',
        permission: 'contact_requests.view',
      },
      {
        href: '/admin/notifications',
        icon: '❖',
        label: 'Notifications',
        active: 'notifications',
        permission: 'notifications.view',
      },
    ],
  },
  {
    label: 'RENTALS',
    links: [
      {
        href: '/admin/rentals/bookings',
        icon: '⎘',
        label: 'Rental bookings',
        active: 'rental-bookings',
        permission: 'rental_bookings.view',
      },
      {
        href: '/admin/rentals/vehicles',
        icon: '⛟',
        label: 'Rental fleet',
        active: 'rentals',
        permission: 'rentals.view',
      },
    ],
  },
  {
    label: 'EXPERIENCE',
    links: [
      {
        href: '/admin/home',
        icon: '✧',
        label: 'Homepage',
        active: 'home',
        permission: 'home.view',
      },
    ],
  },
  {
    label: 'ADMINISTRATION',
    links: [
      {
        href: '/admin/activity-logs',
        icon: '✎',
        label: 'Activity logs',
        active: 'activity-logs',
        permission: 'audit_logs.view',
      },
      {
        href: '/admin/app-config',
        icon: '↻',
        label: 'App configuration',
        active: 'app-config',
        permission: 'settings.view',
      },
      {
        href: '/admin/settings',
        icon: '⚙',
        label: 'Site settings',
        active: 'settings',
        permission: 'settings.view',
      },
    ],
  },
] as const

type Props = {
  title: string
  active: string
  adminName: string
  csrfToken: string
  error?: string | null
  success?: string | null
  children: ReactNode
}

export default function AdminLayout({
  title,
  active,
  adminName,
  csrfToken,
  error,
  success,
  children,
}: Props) {
  const page = usePage()
  const auth = (page.props as unknown as { auth?: SharedAuth }).auth
  const permissions = new Set(auth?.permissions ?? [])
  const visibleNavigation = auth?.mustChangePassword
    ? []
    : navigation
        .map((section) => ({
          ...section,
          links: section.links.filter(
            (link) => !('permission' in link) || permissions.has(link.permission)
          ),
        }))
        .filter((section) => section.links.length > 0)
  const [menuOpen, setMenuOpen] = useState(false)

  // The sidebar is taller than many laptop screens. Instead of giving it its own scrollbar
  // (which swallows the first swipe over it), it scrolls with the page until its bottom
  // reaches the window bottom and then stays put, so every link stays reachable.
  const sidebarRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return
    const place = () => {
      sidebar.style.top = `${Math.min(0, window.innerHeight - sidebar.offsetHeight)}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(sidebar)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [])
  useEffect(() => {
    document.body.classList.toggle('cms-sidebar-open', menuOpen)
    return () => document.body.classList.remove('cms-sidebar-open')
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <>
      <Head title={`${title} · The Kuwaiti Experience CMS`} />
      <a
        href="#main-content"
        className="skip-link tw:absolute tw:left-5 tw:top-[-100px] tw:z-[10000] tw:rounded-cms-sm tw:bg-brand-navy tw:px-[18px] tw:py-3 tw:font-semibold tw:text-white tw:transition-[top] tw:duration-200 tw:focus:top-4"
      >
        Skip to main content
      </a>
      <div
        className="sidebar-backdrop tw:fixed tw:inset-0 tw:z-[999] tw:hidden tw:bg-brand-navy-deep/50"
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />
      <div className="cms-shell tw:relative tw:grid tw:min-h-screen tw:grid-cols-[260px_minmax(0,1fr)] tw:max-[900px]:grid-cols-1">
        <aside
          ref={sidebarRef}
          className="cms-sidebar tw:sticky tw:self-start tw:z-[100] tw:flex tw:min-h-screen tw:flex-col tw:max-[900px]:overflow-y-auto tw:border-r tw:border-white/10 tw:bg-brand-navy-deep tw:px-4 tw:pb-5 tw:pt-6 tw:text-[#eff5f8] tw:max-[900px]:fixed tw:max-[900px]:-left-[280px] tw:max-[900px]:top-0 tw:max-[900px]:z-[1000] tw:max-[900px]:h-screen tw:max-[900px]:w-[270px] tw:max-[900px]:transition-[left] tw:max-[900px]:duration-[250ms] tw:max-[900px]:ease-in-out tw:max-[900px]:shadow-lg body-cms-sidebar-open:tw:left-0"
          id="cms-sidebar"
          aria-label="Main sidebar navigation"
        >
          <Link
            href={auth?.landingUrl ?? '/admin/account'}
            className="brand tw:flex tw:items-center tw:gap-3 tw:px-2 tw:pb-6 tw:pt-2 tw:font-bebas tw:text-[22px] tw:leading-[0.9] tw:tracking-[0.03em] tw:text-white"
            aria-label="Kuwaiti Experience dashboard"
          >
            <span
              className="brand-mark tw:grid tw:size-10 tw:min-w-10 tw:place-items-center tw:rounded-cms tw:border-[1.5px] tw:border-brand-gold tw:bg-brand-gold/10 tw:font-playfair tw:text-[24px] tw:italic tw:text-brand-gold"
              aria-hidden="true"
            >
              K
            </span>
            <span className="brand-text tw:flex tw:flex-col">
              <span className="brand-title tw:text-[18px] tw:leading-none tw:tracking-[0.04em]">
                THE KUWAITI EXPERIENCE
              </span>
            </span>
          </Link>
          {visibleNavigation.map((section) => (
            <div key={section.label}>
              <div className="sidebar-label tw:mx-2 tw:mb-2 tw:mt-5 tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-[0.14em] tw:text-[#8da4b8]">
                {section.label}
              </div>
              <nav
                aria-label={`${section.label.toLowerCase()} CMS navigation`}
                className="cms-nav tw:flex tw:flex-col tw:gap-[3px]"
              >
                {section.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch="hover"
                    onClick={() => setMenuOpen(false)}
                    className={`tw:flex tw:min-h-10 tw:items-center tw:gap-3 tw:rounded-cms-sm tw:px-3 tw:py-[10px] tw:text-[13px] tw:font-semibold tw:text-[#c4d7e6] tw:transition-[background,color] tw:duration-150 tw:hover:bg-white/10 tw:hover:text-white ${active === link.active ? 'active tw:bg-brand-gold tw:font-bold tw:text-brand-navy-deep' : ''}`}
                    aria-current={active === link.active ? 'page' : undefined}
                  >
                    <span
                      className="nav-icon tw:w-[18px] tw:text-center tw:text-base tw:leading-none tw:opacity-[0.85]"
                      aria-hidden="true"
                    >
                      {link.icon}
                    </span>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </aside>

        <div className="cms-main tw:flex tw:min-w-0 tw:flex-col">
          <header className="cms-topbar tw:sticky tw:top-0 tw:z-50 tw:flex tw:min-h-[60px] tw:items-center tw:justify-between tw:gap-4 tw:border-b tw:border-brand-line tw:bg-white tw:px-8 tw:max-[900px]:px-4">
            <div className="topbar-left tw:flex tw:items-center tw:gap-3">
              <button
                type="button"
                className="mobile-menu-btn tw:hidden tw:size-[38px] tw:place-items-center tw:rounded-cms-sm tw:border tw:border-brand-line tw:bg-transparent tw:p-0 tw:text-[18px] tw:text-brand-ink tw:max-[900px]:grid"
                aria-label="Toggle navigation menu"
                aria-controls="cms-sidebar"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((current) => !current)}
              >
                ☰
              </button>
              <span className="topbar-path tw:text-xs tw:font-bold tw:uppercase tw:tracking-[0.08em] tw:text-brand-muted">
                THE KUWAITI EXPERIENCE <b>/</b> {title}
              </span>
            </div>
            <div className="topbar-right tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:font-medium tw:text-brand-muted">
              <AdminProfileMenu adminName={adminName} csrfToken={csrfToken} />
            </div>
          </header>
          <main
            className="cms-content tw:w-full tw:px-8 tw:pb-12 tw:pt-6 tw:max-[900px]:px-4 tw:max-[900px]:pb-10 tw:max-[900px]:pt-4"
            id="main-content"
          >
            {success && <Notice kind="success" message={success} eventKey={page} />}
            {error && <Notice kind="error" message={error} dismissible />}
            {children}
          </main>
        </div>
      </div>
    </>
  )
}
