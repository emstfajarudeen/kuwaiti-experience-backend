import { randomUUID } from 'node:crypto'
import { open, readFile, stat } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import { ApiError } from './api_error.js'

type Row = Record<string, any>

/** Provider legal documents: PDF, JPG or PNG up to 10 MB, kept as uploaded. Staff only. */
export const MAX_DOCUMENT_MB = 10
const MAX_DOCUMENT_BYTES = MAX_DOCUMENT_MB * 1024 * 1024
const fileOptions = { size: `${MAX_DOCUMENT_MB}mb`, extnames: ['pdf', 'jpg', 'jpeg', 'png'] }
const keyPattern =
  /^documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:pdf|jpg|png)$/

const kinds = {
  pdf: { mime: 'application/pdf', extension: 'pdf' },
  jpg: { mime: 'image/jpeg', extension: 'jpg' },
  png: { mime: 'image/png', extension: 'png' },
} as const

export function isDocumentKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && keyPattern.test(value)
}

export function documentFile(request: HttpContext['request'], field = 'file') {
  const files = request.files(field, fileOptions)
  if (files.length > 1) throw new ApiError(422, 'TOO_MANY_FILES', 'Upload one file at a time')
  return files[0] ?? null
}

function fieldError(field: string, message: string): never {
  throw new ApiError(422, 'VALIDATION_ERROR', message, { [field]: [message] })
}

/** Checks the file signature, so a renamed file cannot be stored as a PDF or image. */
async function detect(file: MultipartFile) {
  if (!file.isValid || !file.tmpPath)
    fieldError('file', `Upload a PDF, JPG or PNG file up to ${MAX_DOCUMENT_MB} MB.`)
  const handle = await open(file.tmpPath, 'r')
  const head = Buffer.alloc(8)
  try {
    await handle.read(head, 0, 8, 0)
  } finally {
    await handle.close()
  }
  const kind =
    head.subarray(0, 5).toString('latin1') === '%PDF-'
      ? kinds.pdf
      : head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
        ? kinds.jpg
        : head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
          ? kinds.png
          : null
  if (!kind) fieldError('file', 'The file is not a PDF, JPG or PNG.')
  const info = await stat(file.tmpPath)
  const size = info.size
  if (size > MAX_DOCUMENT_BYTES)
    fieldError('file', `Files must be ${MAX_DOCUMENT_MB} MB or smaller.`)
  return { ...kind, size }
}

export async function listDocuments(providerId: number) {
  return (await db
    .from('rental_provider_documents')
    .where('provider_id', providerId)
    .orderBy('id', 'desc')) as Row[]
}

export async function documentCounts() {
  const rows = await db
    .from('rental_provider_documents')
    .groupBy('provider_id')
    .select('provider_id', db.raw('count(*) as total'))
  return new Map(rows.map((row) => [Number(row.provider_id), Number(row.total)]))
}

export async function findDocument(id: number) {
  return (
    ((await db.from('rental_provider_documents').where('id', id).first()) as Row | undefined) ??
    null
  )
}

export async function addDocument(
  providerId: number,
  label: string,
  file: MultipartFile | null,
  actorId: number
) {
  const name = label.trim()
  if (!name) fieldError('label', 'Enter what this document is, e.g. Trade licence.')
  if (name.length > 160) fieldError('label', 'Use 160 characters or fewer.')
  if (!file) fieldError('file', 'Choose a file to upload.')
  if (!(await db.from('rental_providers').where('id', providerId).first()))
    throw new ApiError(404, 'NOT_FOUND', 'Provider not found')
  const kind = await detect(file)
  const key = `documents/${randomUUID()}.${kind.extension}`
  await drive.use('local').put(key, await readFile(file.tmpPath!))
  try {
    const [id] = await db.table('rental_provider_documents').insert({
      provider_id: providerId,
      label: name,
      storage_key: key,
      original_name: (file.clientName || `document.${kind.extension}`).slice(0, 255),
      mime_type: kind.mime,
      size_bytes: kind.size,
      uploaded_by: actorId,
      created_at: new Date(),
    })
    await db.table('audit_logs').insert({
      actor_id: actorId,
      action: 'rental_provider_document.create',
      entity_type: 'rental_provider_document',
      entity_id: String(id),
      created_at: new Date(),
    })
    return Number(id)
  } catch (error) {
    await deleteDocumentFiles([key])
    throw error
  }
}

export async function updateDocumentLabel(id: number, label: string, actorId: number) {
  const name = label.trim()
  if (!name) fieldError('label', 'Enter what this document is, e.g. Trade licence.')
  if (name.length > 160) fieldError('label', 'Use 160 characters or fewer.')
  const row = await findDocument(id)
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Document not found')
  await db.from('rental_provider_documents').where('id', id).update({ label: name })
  await db.table('audit_logs').insert({
    actor_id: actorId,
    action: 'rental_provider_document.update',
    entity_type: 'rental_provider_document',
    entity_id: String(id),
    created_at: new Date(),
  })
}

export async function deleteDocument(id: number, actorId: number) {
  const row = await findDocument(id)
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Document not found')
  await db.from('rental_provider_documents').where('id', id).delete()
  await db.table('audit_logs').insert({
    actor_id: actorId,
    action: 'rental_provider_document.delete',
    entity_type: 'rental_provider_document',
    entity_id: String(id),
    created_at: new Date(),
  })
  await deleteDocumentFiles([row.storage_key])
}

export async function deleteDocumentFiles(keys: Iterable<string | null | undefined>) {
  for (const key of keys) {
    if (!isDocumentKey(key)) continue
    try {
      await drive.use('local').delete(key)
    } catch (error) {
      logger.warn({ err: error, key }, 'Provider document file could not be deleted')
    }
  }
}

/** Opens the file in the browser (PDF viewer or image), with its original name for saving. */
export async function streamDocument(response: HttpContext['response'], row: Row) {
  const disk = drive.use('local')
  if (!isDocumentKey(row.storage_key) || !(await disk.exists(row.storage_key)))
    throw new ApiError(404, 'NOT_FOUND', 'File not found')
  const name = String(row.original_name).replace(/["\\\r\n]/g, '')
  response.header('Content-Type', row.mime_type)
  response.header('X-Content-Type-Options', 'nosniff')
  response.header('Cache-Control', 'private, no-store')
  response.header(
    'Content-Disposition',
    `inline; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`
  )
  return response.stream(await disk.getStream(row.storage_key))
}
