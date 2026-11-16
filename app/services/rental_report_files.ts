import { toCsv, toXlsx } from './rental_report_export.js'
import {
  providerOptions,
  type ReportDefinition,
  type ReportFilters,
  type ReportResult,
} from './rental_report_service.js'

export type ReportFormat = 'csv' | 'xlsx'

export const readFormat = (value: unknown): ReportFormat => (value === 'xlsx' ? 'xlsx' : 'csv')

const CONTENT_TYPES: Record<ReportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/** "Provider: Gulf Rent" style lines describing the filters other than the dates. */
export async function filterLabels(report: ReportDefinition, filters: ReportFilters) {
  const providers = await providerOptions()
  return report
    .filters(providers)
    .filter((field) => field.kind !== 'date')
    .flatMap((field) => {
      const value = String(filters[field.key as keyof ReportFilters] ?? '')
      if (!value) return []
      const shown = field.options?.find((option) => option.value === value)?.label ?? value
      const name = field.key === 'provider' ? 'Provider' : field.key === 'q' ? 'Search' : 'View'
      return [`${name}: ${shown}`]
    })
}

/** Runs a report and renders it as a downloadable file. Throws ApiError when it cannot run. */
export async function reportFile(
  report: ReportDefinition,
  filters: ReportFilters,
  format: ReportFormat
): Promise<{ result: ReportResult; name: string; contentType: string; body: Buffer }> {
  const result = await report.run(filters)
  const name = `${report.key}_${filters.from}_to_${filters.to}.${format}`
  const body =
    format === 'xlsx'
      ? await toXlsx(report.title, filters, await filterLabels(report, filters), result)
      : Buffer.from(toCsv(result), 'utf8')
  return { result, name, contentType: CONTENT_TYPES[format], body }
}
