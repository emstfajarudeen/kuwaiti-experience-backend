import '@vitejs/plugin-react/preamble'
import { createInertiaApp } from '@inertiajs/react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { resolvePage } from './page_resolver'
import CmsAntdProvider from './components/cms_antd_provider'

void createInertiaApp({
  resolve: resolvePage,
  setup({ el, App, props }) {
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
