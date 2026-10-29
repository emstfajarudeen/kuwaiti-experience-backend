import { createInertiaApp } from '@inertiajs/react'
import type { Page } from '@inertiajs/core'
import { renderToString } from 'react-dom/server'
import { resolvePage } from './page_resolver'
import { createCache, extractStyle } from '@ant-design/cssinjs'
import CmsAntdProvider from './components/cms_antd_provider'

// Adonis invokes this renderer in-process; it must not open a second HTTP server.
export default async function render(page: Page) {
  const cache = createCache()
  const response = await createInertiaApp({
    page,
    render: (element) => renderToString(<CmsAntdProvider cache={cache}>{element}</CmsAntdProvider>),
    resolve: resolvePage,
    setup: ({ App, props }) => <App {...props} />,
  })
  const styles = extractStyle(cache)
  if (styles) response.head.push(styles)
  return response
}
