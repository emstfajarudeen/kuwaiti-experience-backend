import { createRoot } from 'react-dom/client'
import CmsAntdProvider from '../components/cms_antd_provider'
import Notice from '../components/notice'

export function showSuccessNotifications(messages: string[]) {
  const host = document.createElement('div')
  document.body.append(host)
  createRoot(host).render(
    <CmsAntdProvider>
      {[...new Set(messages)].map((message) => (
        <Notice key={message} kind="success" message={message} />
      ))}
    </CmsAntdProvider>
  )
}
