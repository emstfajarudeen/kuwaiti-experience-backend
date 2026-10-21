import sanitizeHtml from 'sanitize-html'
import { ApiError } from './api_error.js'

export type PageBodyFormat = 'plain_text' | 'html'

export function pageBodyFormat(value: unknown): PageBodyFormat {
  return value === 'html' ? 'html' : 'plain_text'
}

const htmlOptions: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'em', 'u', 'blockquote', 'ul', 'ol', 'li', 'a'],
  allowedAttributes: { a: ['href', 'title'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'] },
  allowProtocolRelative: false,
}

export function safePageBody(body: string, format: PageBodyFormat): string {
  return format === 'html' ? sanitizeHtml(body, htmlOptions) : body
}

export function normalizePageBody(body: string, format: PageBodyFormat): string {
  const cleaned = safePageBody(body, format).trim()
  const visibleText =
    format === 'html'
      ? sanitizeHtml(cleaned, { allowedTags: [], allowedAttributes: {} })
          .replace(/&nbsp;|&#160;/gi, ' ')
          .trim()
      : cleaned
  if (!visibleText || cleaned.length > 50000) {
    throw new ApiError(
      422,
      'INVALID_PAGE_BODY',
      'Page body must contain text within 50,000 characters'
    )
  }
  return cleaned
}

export function hasPlaceholderPageCopy(body: string): boolean {
  return /Gheyar Seller App|demo placeholder|placeholder content|Draft demo content/i.test(body)
}

export function assertApprovedPageCopy(slug: string, body: string): void {
  if (hasPlaceholderPageCopy(body)) {
    throw new ApiError(
      422,
      'PLACEHOLDER_PAGE_CONTENT',
      `Replace placeholder content before publishing ${slug}`
    )
  }
}
