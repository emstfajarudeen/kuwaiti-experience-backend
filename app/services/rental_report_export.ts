import ExcelJS from 'exceljs'
import { DateTime } from 'luxon'
import {
  displayCell,
  displaySummary,
  type ReportColumn,
  type ReportFilters,
  type ReportResult,
} from './rental_report_service.js'

const KUWAIT = 'Asia/Kuwait'

/** A spreadsheet reads a leading = + - @ as a formula; prefix text so it stays text. */
const safeText = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value)

const csvCell = (column: ReportColumn, value: unknown) => {
  const raw = displayCell(column.type, value)
  const cell = column.type === 'text' ? safeText(raw) : raw
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
}

/** UTF-8 with a BOM so Excel shows Arabic names correctly. */
export function toCsv(result: ReportResult) {
  const lines = [
    result.columns.map((column) => csvCell({ ...column, type: 'text' }, column.label)).join(','),
    ...result.rows.map((row) =>
      result.columns.map((column) => csvCell(column, row[column.key])).join(',')
    ),
  ]
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Excel stores dates without a zone, so write the Kuwait wall-clock time. */
const wallClock = (iso: string) => {
  const at = DateTime.fromISO(iso).setZone(KUWAIT)
  return new Date(Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second))
}

export async function toXlsx(
  title: string,
  filters: ReportFilters,
  filterLabels: string[],
  result: ReportResult
) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Kuwaiti Experience CMS'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Report', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = result.columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: Math.max(14, Math.min(40, column.label.length + 4)),
  }))
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } }
  for (const row of result.rows) {
    sheet.addRow(
      Object.fromEntries(
        result.columns.map((column) => {
          const value = row[column.key]
          if (value === null || value === undefined || value === '') return [column.key, null]
          if (column.type === 'money') return [column.key, Number(value) / 1000]
          if (column.type === 'int' || column.type === 'decimal') return [column.key, Number(value)]
          if (column.type === 'percent') return [column.key, Number(value) / 100]
          if (column.type === 'datetime' || column.type === 'date')
            return [column.key, wallClock(String(value))]
          return [column.key, safeText(String(value))]
        })
      )
    )
  }
  result.columns.forEach((column, index) => {
    const target = sheet.getColumn(index + 1)
    if (column.type === 'money') target.numFmt = '#,##0.000'
    if (column.type === 'decimal') target.numFmt = '0.0'
    if (column.type === 'percent') target.numFmt = '0.0%'
    if (column.type === 'datetime') {
      target.numFmt = 'yyyy-mm-dd hh:mm'
      target.width = 18
    }
    if (column.type === 'date') target.numFmt = 'yyyy-mm-dd'
  })

  const info = workbook.addWorksheet('Summary')
  info.columns = [{ width: 28 }, { width: 40 }]
  info.addRow([title]).font = { bold: true, size: 14 }
  info.addRow([`Period ${filters.from} to ${filters.to} (Kuwait time)`])
  for (const line of filterLabels) info.addRow([line])
  info.addRow([`Generated ${DateTime.now().setZone(KUWAIT).toFormat('yyyy-MM-dd HH:mm')}`])
  info.addRow([])
  for (const item of result.summary) {
    const scale = item.type === 'money' ? 1000 : item.type === 'percent' ? 100 : 1
    const row = info.addRow([item.label, Number(item.value) / scale])
    row.getCell(2).numFmt = { money: '#,##0.000', percent: '0.0%', decimal: '0.0', int: '0' }[
      item.type
    ]
  }
  if (result.note) {
    info.addRow([])
    info.addRow([result.note])
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export { displaySummary }
