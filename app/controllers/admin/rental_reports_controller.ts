import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { ApiError } from '../../services/api_error.js'
import { can } from '../../services/authorization_service.js'
import {
  displayCell,
  displaySummary,
  findReport,
  providerOptions,
  readFilters,
  reports,
  type ReportFilters,
} from '../../services/rental_report_service.js'
import { toCsv, toXlsx } from '../../services/rental_report_export.js'

const PAGE_SIZE = 50

function shared({ request, session, admin }: HttpContext) {
  return {
    adminName: admin.fullName,
    csrfToken: request.csrfToken,
    success: (session.flashMessages.get('success') as string | undefined) ?? null,
    error: (session.flashMessages.get('error') as string | undefined) ?? null,
  }
}

/** The filters as they appear on the page and in the export links. */
function queryString(filters: ReportFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters))
    if (value !== null && value !== '') params.set(key, String(value))
  return params.toString()
}

export default class AdminRentalReportsController {
  async index(ctx: HttpContext) {
    return ctx.inertia.render(
      'rentals/reports' as any,
      {
        ...shared(ctx),
        reports: reports.map(({ key, title, group, description }) => ({
          key,
          title,
          group,
          description,
        })),
      },
      { bodyClass: 'cms-body' }
    )
  }

  async show(ctx: HttpContext) {
    const report = findReport(String(ctx.params.key))
    if (!report) return ctx.response.redirect('/admin/rentals/reports')
    const filters = readFilters(ctx.request.qs())
    const providers = await providerOptions()
    let result
    let problem: string | null = null
    try {
      result = await report.run(filters)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      problem = error.message
    }
    const rows = result?.rows ?? []
    const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
    const requested = Math.floor(Number(ctx.request.input('page', 1))) || 1
    const current = Math.min(Math.max(1, requested), lastPage)
    const mayExport = can(ctx.authorization, 'rental_reports.export')
    return ctx.inertia.render(
      'rentals/report' as any,
      {
        ...shared(ctx),
        report: { key: report.key, title: report.title, description: report.description },
        filterFields: report.filters(providers),
        values: {
          from: filters.from,
          to: filters.to,
          provider: filters.provider ? String(filters.provider) : '',
          status: filters.status,
          view: filters.view,
          date_by: filters.date_by,
          method: filters.method,
          q: filters.q,
        },
        problem,
        columns: result?.columns ?? [],
        summary: (result?.summary ?? []).map((item) => ({
          label: item.label,
          value: displaySummary(item),
          type: item.type,
        })),
        note: result?.note ?? null,
        rows: rows
          .slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
          .map((row) =>
            Object.fromEntries(
              result!.columns.map((column) => [
                column.key,
                displayCell(column.type, row[column.key]),
              ])
            )
          ),
        meta: { total: rows.length, page: current, lastPage, perPage: PAGE_SIZE },
        exportBase: mayExport && !problem ? `/admin/rentals/reports/${report.key}/export` : null,
        exportQuery: queryString(filters),
      },
      { bodyClass: 'cms-body' }
    )
  }

  async export(ctx: HttpContext) {
    const report = findReport(String(ctx.params.key))
    if (!report) return ctx.response.redirect('/admin/rentals/reports')
    const filters = readFilters(ctx.request.qs())
    const format = ctx.request.input('format') === 'xlsx' ? 'xlsx' : 'csv'
    let result
    try {
      result = await report.run(filters)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      ctx.session.flash('error', error.message)
      return ctx.response.redirect(`/admin/rentals/reports/${report.key}?${queryString(filters)}`)
    }

    const providers = await providerOptions()
    const labels = report
      .filters(providers)
      .filter((field) => field.kind !== 'date')
      .flatMap((field) => {
        const value = String(filters[field.key as keyof ReportFilters] ?? '')
        if (!value) return []
        const shown = field.options?.find((option) => option.value === value)?.label ?? value
        return [`${field.label.startsWith('All') ? 'Filter' : field.label}: ${shown}`]
      })
    const name = `${report.key}_${filters.from}_to_${filters.to}`
    // The export is recorded: it contains customer and money data.
    await db.table('audit_logs').insert({
      actor_id: ctx.admin.id,
      action: 'rental_report.export',
      entity_type: 'rental_report',
      entity_id: report.key,
      changed_fields: JSON.stringify({ format, ...filters, rows: result.rows.length }),
      created_at: new Date(),
    })
    ctx.response.header('Cache-Control', 'no-store')
    ctx.response.header('X-Content-Type-Options', 'nosniff')
    ctx.response.header('Content-Disposition', `attachment; filename="${name}.${format}"`)
    if (format === 'xlsx') {
      ctx.response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      return ctx.response.send(await toXlsx(report.title, filters, labels, result))
    }
    ctx.response.header('Content-Type', 'text/csv; charset=utf-8')
    return ctx.response.send(toCsv(result))
  }
}
