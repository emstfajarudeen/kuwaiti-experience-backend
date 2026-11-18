import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import sharp from 'sharp'
import env from '#start/env'
import { deleteImages } from '#services/image_storage_service'
import { deleteVideoFiles, videoFilePath } from '#services/video_storage_service'

/**
 * Converts every uploaded video to an MP4 that phones play reliably:
 * H.264 Main (level 4.1), at most 720×1280 (1280×720 for landscape), at most 30 fps,
 * about 3 Mbps, AAC stereo 128 kbps, rotation applied to the pixels, index at the start.
 *
 * The upload is kept in `source_key` while it converts. The current `video_key` (if any)
 * keeps playing until the new file is ready, then both old files are deleted.
 */

const MAX_ATTEMPTS = 3
/** A conversion still "processing" after this long was interrupted (for example a restart). */
const STALE_MS = 20 * 60 * 1000
const FFMPEG_TIMEOUT_MS = 15 * 60 * 1000

type Row = Record<string, any>

let resolvedPath: string | null = null
async function ffmpegPath() {
  if (resolvedPath) return resolvedPath
  const configured = env.get('FFMPEG_PATH')
  if (configured) return (resolvedPath = configured)
  const { default: bundled } = (await import('ffmpeg-static')) as unknown as {
    default: string | null
  }
  if (!bundled) throw new Error('ffmpeg is not available on this platform; set FFMPEG_PATH')
  return (resolvedPath = bundled)
}

function run(args: string[], output: 'buffer' | 'none' = 'none') {
  return ffmpegPath().then(
    (path) =>
      new Promise<{ code: number; stdout: Buffer; stderr: string }>((resolve, reject) => {
        const child = spawn(path, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        const chunks: Buffer[] = []
        let stderr = ''
        const timer = setTimeout(() => child.kill('SIGKILL'), FFMPEG_TIMEOUT_MS)
        child.stdout.on('data', (chunk: Buffer) => {
          if (output === 'buffer') chunks.push(chunk)
        })
        child.stderr.on('data', (chunk: Buffer) => {
          // Keep only the tail; ffmpeg can be chatty on long files.
          stderr = (stderr + chunk.toString()).slice(-20000)
        })
        child.on('error', (error) => {
          clearTimeout(timer)
          reject(error)
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          resolve({ code: code ?? -1, stdout: Buffer.concat(chunks), stderr })
        })
      })
  )
}

/** Fit inside 720×1280 (portrait) or 1280×720 (landscape) without upscaling. */
const SCALE =
  "scale=w='if(gt(iw,ih),min(1280,iw),min(720,iw))':h='if(gt(iw,ih),min(720,ih),min(1280,ih))'" +
  ':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p'

export function conversionArgs(input: string, output: string) {
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    SCALE,
    '-fpsmax',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'main',
    '-level:v',
    '4.1',
    '-crf',
    '23',
    '-maxrate',
    '3M',
    '-bufsize',
    '6M',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-ar',
    '48000',
    '-map_metadata',
    '-1',
    '-movflags',
    '+faststart',
    '-threads',
    '2',
    output,
  ]
}

export type VideoInfo = { width: number | null; height: number | null; durationMs: number | null }

/** Reads size and duration from ffmpeg's description of a file. */
export async function probeVideo(path: string): Promise<VideoInfo> {
  const { stderr } = await run(['-hide_banner', '-nostdin', '-i', path])
  const size = /Stream #\d+:\d+.*?: Video: .*?, (\d{2,5})x(\d{2,5})[\s,[]/.exec(stderr)
  const duration = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr)
  return {
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    durationMs: duration
      ? Math.round(
          (Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000
        )
      : null,
  }
}

/** Converts `input` into `output` (MP4). Throws with ffmpeg's last lines on failure. */
export async function convertVideoFile(input: string, output: string) {
  const result = await run(conversionArgs(input, output))
  if (result.code !== 0) {
    const reason = result.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 400)
    throw new Error(`Video conversion failed: ${reason || `ffmpeg exited with ${result.code}`}`)
  }
}

/** A WebP cover taken from about one second in (or the first frame of a short clip). */
async function coverFrom(path: string) {
  for (const at of ['1', '0']) {
    const result = await run(
      [
        '-hide_banner',
        '-nostdin',
        '-ss',
        at,
        '-i',
        path,
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-c:v',
        'mjpeg',
        'pipe:1',
      ],
      'buffer'
    )
    if (result.code === 0 && result.stdout.length) {
      return sharp(result.stdout).webp({ quality: 82, effort: 4 }).toBuffer()
    }
  }
  return null
}

/** Atomically takes a pending (or abandoned) conversion; false when another worker has it. */
async function claim(id: number) {
  const affected = await db
    .from('videos')
    .where('id', id)
    .whereNotNull('source_key')
    .where((query) =>
      query
        .where('processing_status', 'pending')
        .orWhere((stale) =>
          stale
            .where('processing_status', 'processing')
            .where('processing_started_at', '<=', new Date(Date.now() - STALE_MS))
        )
    )
    .update({
      processing_status: 'processing',
      processing_started_at: new Date(),
      processing_error: null,
      processing_attempts: db.raw('processing_attempts + 1'),
    })
  return Number(Array.isArray(affected) ? affected[0] : affected) === 1
}

export type ProcessResult = 'converted' | 'retry' | 'failed' | 'missing' | null

/**
 * Converts one video. Returns null when there was nothing to do, `retry` when it will be
 * tried again, `missing` when the source file is not on disk (no point retrying).
 */
export async function processVideo(id: number): Promise<ProcessResult> {
  if (!(await claim(id))) return null
  const row = (await db.from('videos').where('id', id).first()) as Row | null
  if (!row?.source_key) return null
  const sourceKey = row.source_key as string
  const sourcePath = videoFilePath(sourceKey)
  if (
    !(await access(sourcePath).then(
      () => true,
      () => false
    ))
  ) {
    // A playing video stays as it is; an upload that never arrived needs a new upload.
    const keepsPlaying = Boolean(row.video_key)
    logger.warn({ videoId: id, path: sourcePath }, 'Video file to convert is missing')
    await db
      .from('videos')
      .where('id', id)
      .where('source_key', sourceKey)
      .update({
        source_key: null,
        processing_status: keepsPlaying ? 'ready' : 'failed',
        processing_error: keepsPlaying
          ? null
          : 'The uploaded file is missing. Upload the video again.',
        processing_started_at: null,
      })
    return 'missing'
  }
  const workDir = await mkdtemp(join(tmpdir(), 'video-'))
  const newKey = `videos/${randomUUID()}.mp4`
  let coverKey: string | null = null
  let stored = false
  try {
    const output = join(workDir, 'out.mp4')
    await convertVideoFile(sourcePath, output)
    const info = await probeVideo(output)
    const { size } = await stat(output)
    await drive.use('local').put(newKey, await readFile(output))
    stored = true
    if (!row.thumbnail_key) {
      const cover = await coverFrom(output).catch(() => null)
      if (cover) {
        coverKey = `${randomUUID()}.webp`
        await drive.use('local').put(coverKey, cover)
      }
    }
    const released = await db.transaction(async (trx) => {
      const current = await trx.from('videos').where('id', id).forUpdate().first()
      // A newer upload (or a delete) replaced this source while it converted: drop the result.
      if (!current || current.source_key !== sourceKey) return null
      const values: Row = {
        video_key: newKey,
        source_key: null,
        processing_status: 'ready',
        processing_error: null,
        processing_started_at: null,
        size_bytes: size,
        width: info.width,
        height: info.height,
        duration_ms: info.durationMs,
        updated_at: new Date(),
      }
      if (coverKey && !current.thumbnail_key) values.thumbnail_key = coverKey
      else if (coverKey) await deleteImages([coverKey])
      await trx.from('videos').where('id', id).update(values)
      return [current.video_key as string | null, sourceKey]
    })
    if (!released) {
      await deleteVideoFiles([newKey])
      await deleteImages([coverKey])
      return null
    }
    await deleteVideoFiles(new Set(released))
    logger.info({ videoId: id, ...info, size }, 'Video converted')
    return 'converted'
  } catch (error) {
    if (stored) await deleteVideoFiles([newKey])
    await deleteImages([coverKey])
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
    logger.error({ err: error, videoId: id }, 'Video conversion failed')
    const failed = Number(row.processing_attempts) >= MAX_ATTEMPTS
    await db
      .from('videos')
      .where('id', id)
      .where('source_key', sourceKey)
      .update({
        processing_status: failed ? 'failed' : 'pending',
        processing_error: message,
        processing_started_at: null,
      })
    return failed ? 'failed' : 'retry'
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

/** Ids waiting for conversion, oldest first, including abandoned ones. */
async function waiting(limit: number) {
  const rows = await db
    .from('videos')
    .whereNotNull('source_key')
    .where((query) =>
      query
        .where('processing_status', 'pending')
        .orWhere((stale) =>
          stale
            .where('processing_status', 'processing')
            .where('processing_started_at', '<=', new Date(Date.now() - STALE_MS))
        )
    )
    .orderBy('id')
    .limit(limit)
    .select('id')
  return rows.map((row: Row) => Number(row.id))
}

export type ProcessSummary = { converted: number; failed: number; missing: number }

/** Converts waiting videos one at a time until none are left. */
export async function processWaitingVideos(): Promise<ProcessSummary> {
  const summary: ProcessSummary = { converted: 0, failed: 0, missing: 0 }
  for (;;) {
    const ids = await waiting(5)
    if (!ids.length) return summary
    let progressed = false
    for (const id of ids) {
      const result = await processVideo(id)
      if (!result) continue
      progressed = true
      if (result !== 'retry') summary[result]++
    }
    if (!progressed) return summary
  }
}

let running: Promise<void> | null = null
let again = false

/**
 * Starts converting in this process without blocking the request. Only one conversion
 * runs at a time per process; the database claim keeps several processes apart.
 */
export function dispatchVideoProcessing() {
  if (env.get('NODE_ENV') === 'test') return
  if (running) {
    again = true
    return
  }
  running = (async () => {
    do {
      again = false
      try {
        await processWaitingVideos()
      } catch (error) {
        logger.error({ err: error }, 'Video processing run failed')
      }
    } while (again)
  })().finally(() => {
    running = null
  })
}

/**
 * Queues already-stored videos for conversion (they keep playing meanwhile).
 * `onlyUnconverted` skips videos this service has already converted.
 */
export async function queueExistingVideos(onlyUnconverted = true) {
  const query = db
    .from('videos')
    .whereNotNull('video_key')
    .whereNull('source_key')
    .where('processing_status', 'ready')
  if (onlyUnconverted) query.whereNull('width')
  return Number(
    await query.update({
      source_key: db.raw('video_key'),
      processing_status: 'pending',
      processing_attempts: 0,
      processing_error: null,
    })
  )
}

/** Puts failed conversions back in the queue. */
export async function retryFailedVideos() {
  return Number(
    await db
      .from('videos')
      .where('processing_status', 'failed')
      .whereNotNull('source_key')
      .update({ processing_status: 'pending', processing_attempts: 0, processing_error: null })
  )
}
