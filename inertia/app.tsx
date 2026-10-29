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
