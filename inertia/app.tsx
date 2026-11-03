import '@vitejs/plugin-react/preamble'
import { createInertiaApp, router } from '@inertiajs/react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { resolvePage } from './page_resolver'
import CmsAntdProvider from './components/cms_antd_provider'

function syncBodyClass(component: string) {
  const isLoginPage = ['auth/login', 'auth/forgot_password', 'auth/reset_password'].includes(
    component
  )
  document.body.classList.toggle('login-body', isLoginPage)
  document.body.classList.toggle('cms-body', !isLoginPage)
}

router.on('navigate', (event) => syncBodyClass(event.detail.page.component))
router.on('success', (event) => syncBodyClass(event.detail.page.component))

// Plain links and Ant Design buttons with an href would reload the whole page (a white
// flash while the bundle loads again). Send every in-app CMS link through Inertia instead.
const nativePaths = ['/admin/images/', '/admin/video-files/', '/admin/logout']
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = (event.target as Element | null)?.closest?.('a')
  if (!link || !link.hasAttribute('href')) return
  if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return
  if (link.dataset.nativeLink !== undefined) return
  const url = new URL(link.href, window.location.href)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/admin')) return
  if (nativePaths.some((path) => url.pathname.startsWith(path))) return
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    if (url.hash) return
  }
  event.preventDefault()
  router.visit(url.pathname + url.search + url.hash)
})

void createInertiaApp({
  resolve: resolvePage,
  setup({ el, App, props }) {
    syncBodyClass(props.initialPage.component)
    if (el.hasChildNodes()) {
      hydrateRoot(
        el,
        <CmsAntdProvider>
          <App {...props} />
        </CmsAntdProvider>
      )
    } else {
      createRoot(el).render(
        <CmsAntdProvider>
          <App {...props} />
        </CmsAntdProvider>
      )
    }
  },
  progress: { color: '#c5973e' },
})
