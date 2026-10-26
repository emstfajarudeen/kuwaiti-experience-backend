export function validationErrorBag(error: unknown): Record<string, string[]> | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { code?: unknown; messages?: unknown }
  if (candidate.code !== 'E_VALIDATION_ERROR' || !Array.isArray(candidate.messages)) return null
  const errors: Record<string, string[]> = {}
  for (const item of candidate.messages) {
    if (!item || typeof item !== 'object') continue
    const message = item as { field?: unknown; message?: unknown }
    if (typeof message.field !== 'string' || typeof message.message !== 'string') continue
    ;(errors[message.field] ??= []).push(message.message)
  }
  return Object.keys(errors).length ? errors : null
}
