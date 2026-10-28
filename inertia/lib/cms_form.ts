import type { FormInstance } from 'antd'
import type { NamePath } from 'antd/es/form/interface'
import { router } from '@inertiajs/react'
import type { FormDataConvertible } from '@inertiajs/core'

function fieldNamePath(field: string): NamePath {
  return field
    .split(/[.[\]]+/)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part))
}

export function postCmsForm<T extends object>(options: {
  action: string
  csrfToken: string
  data: FormData | Record<string, FormDataConvertible>
  form: FormInstance<T>
  setProcessing: (processing: boolean) => void
  onError?: (errors: Record<string, string>) => void
}) {
  const { action, csrfToken, data, form, setProcessing, onError } = options
  if (data instanceof FormData) data.set('_csrf', csrfToken)
  else data._csrf = csrfToken

  router.post(action, data, {
    forceFormData: data instanceof FormData,
    headers: { 'X-CSRF-TOKEN': csrfToken },
    onStart: () => setProcessing(true),
    onError: (errors) => {
      form.setFields(
        Object.entries(errors).map(([field, message]) => ({
          name: fieldNamePath(field),
          errors: [String(message)],
        }))
      )
      onError?.(errors)
    },
    onFinish: () => setProcessing(false),
  })
}
