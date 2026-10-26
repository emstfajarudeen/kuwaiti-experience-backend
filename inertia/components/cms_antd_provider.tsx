import { StyleProvider } from '@ant-design/cssinjs'
import { ConfigProvider } from 'antd'
import type { ReactNode } from 'react'
import type { createCache } from '@ant-design/cssinjs'

type Props = {
  children: ReactNode
  cache?: ReturnType<typeof createCache>
}

export default function CmsAntdProvider({ children, cache }: Props) {
  return (
    <StyleProvider cache={cache} layer>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#00264b',
            colorInfo: '#00264b',
            colorText: '#0a233d',
            colorTextSecondary: '#3b5268',
            colorBgLayout: '#f8f6f0',
            colorBgContainer: '#ffffff',
            colorBorder: '#cac4b6',
            colorError: '#9e2a2b',
            borderRadius: 6,
            controlHeight: 44,
            fontFamily: 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: 14,
          },
          components: {
            Form: { itemMarginBottom: 16 },
            Table: {
              headerBg: '#faf8f5',
              headerColor: '#3b5268',
              borderColor: '#e3dfd5',
              cellPaddingBlock: 14,
              cellPaddingInline: 18,
            },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </StyleProvider>
  )
}
