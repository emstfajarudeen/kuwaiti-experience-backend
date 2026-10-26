import type { ComponentType } from 'react'

const pages = import.meta.glob<{ default: ComponentType<Record<string, unknown>> }>(
  './pages/**/*.tsx'
)

export function resolvePage(name: string) {
  const loadPage = pages[`./pages/${name}.tsx`]
  if (!loadPage) throw new Error(`Unknown CMS page: ${name}`)
  return loadPage().then((module) => module.default)
}
