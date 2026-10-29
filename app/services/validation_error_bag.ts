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

/** Turn internal validator paths into labels that make sense in the CMS UI. */
export function readableValidationError(field: string, message: string): string {
  const hoursMatch = field.match(/^hours\.(\d+)\.(opensAt|closesAt|closed|closesNextDay)$/)
  if (hoursMatch) {
    const row = Number(hoursMatch[1]) + 1
    const label =
      hoursMatch[2] === 'opensAt'
        ? 'opening time'
        : hoursMatch[2] === 'closesAt'
          ? 'closing time'
          : hoursMatch[2] === 'closesNextDay'
            ? 'overnight setting'
            : 'closed setting'
    return `Weekly hours row ${row}: ${label} is invalid. Use a time such as 09:00.`
  }

  const labels: Record<string, string> = {
    websiteUrl: 'Website URL',
    titleEn: 'English title',
    slug: 'URL slug',
    addressEn: 'Address',
    summaryEn: 'Short summary',
    priceAmount: 'Price',
  }
  return `${labels[field] ?? field}: ${message}`
}
