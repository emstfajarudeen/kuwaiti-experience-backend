import { ApiError } from './api_error.js'

export type PublicLocale = 'en' | 'ar'

export function publicLocale(value: unknown): PublicLocale {
  if (value === undefined || value === null || value === '') return 'en'
  if (value === 'en' || value === 'ar') return value
  throw new ApiError(422, 'INVALID_LOCALE', 'Choose English or Arabic')
}

/** Select the most preferred supported language from an Accept-Language header. */
export function publicLanguage(header: string | undefined): PublicLocale {
  if (!header) return 'en'
  const preferences = header
    .split(',')
    .map((part, index) => {
      const [tag, ...parameters] = part.trim().split(';')
      const quality = parameters.find((parameter) => /^q\s*=/i.test(parameter.trim()))
      const weight = quality ? Number(quality.split('=')[1]) : 1
      return { language: tag.trim().toLowerCase().split('-')[0], weight, index }
    })
    .filter(({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)

  for (const { language } of preferences) {
    if (language === 'en' || language === 'ar') return language
  }
  return 'en'
}

const missing = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && !value.trim())

function localizedValue(english: unknown, arabic: unknown, locale: PublicLocale) {
  return locale === 'ar' && !missing(arabic) ? arabic : english
}

type RecordValue = Record<string, unknown>

function selectedTranslation(rows: RecordValue[], locale: PublicLocale): RecordValue[] {
  const selected =
    rows.find((row) => row.locale === locale) ?? rows.find((row) => row.locale === 'en')
  if (!selected) return []
  const english = rows.find((row) => row.locale === 'en')
  if (locale !== 'ar' || !english || selected === english) return [selected]
  const merged = { ...selected }
  for (const [key, value] of Object.entries(english)) {
    if (!['id', 'locale', 'updated_at'].includes(key) && missing(merged[key])) merged[key] = value
  }
  return [merged]
}

/** Localize public response data without changing the CMS serializers or stored records. */
export function localizePublicData(value: unknown, locale: PublicLocale): unknown {
  if (Array.isArray(value)) return value.map((item) => localizePublicData(item, locale))
  if (!value || typeof value !== 'object') return value

  const source = value as RecordValue
  const result: RecordValue = {}
  for (const [key, item] of Object.entries(source)) {
    if (key.endsWith('_en') && Object.hasOwn(source, `${key.slice(0, -3)}_ar`)) {
      result[key.slice(0, -3)] = localizedValue(item, source[`${key.slice(0, -3)}_ar`], locale)
    } else if (key.endsWith('_ar') && Object.hasOwn(source, `${key.slice(0, -3)}_en`)) {
      continue
    } else if (
      ['home_content', 'category_translations', 'place_translations'].includes(key) &&
      Array.isArray(item)
    ) {
      result[key] = selectedTranslation(item as RecordValue[], locale).map((row) =>
        localizePublicData(row, locale)
      )
    } else {
      result[key] = localizePublicData(item, locale)
    }
  }
  return result
}
