import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import { loginAdmin } from '../helpers/admin_auth.js'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { default as ffmpegStatic } from 'ffmpeg-static'
import {
  processVideo,
  processWaitingVideos,
  probeVideo,
  queueExistingVideos,
} from '#services/video_processing_service'

const ffmpeg = ffmpegStatic as unknown as string
const root = () => app.makePath('storage/test-uploads')

/** Writes a test clip (colour bars + tone) straight into video storage. */
function makeClip(width: number, height: number, fps: number) {
  mkdirSync(`${root()}/videos`, { recursive: true })
  const key = `videos/${randomUUID()}.mp4`
  const result = spawnSync(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${width}x${height}:rate=${fps}:duration=2`,
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-preset',
    'ultrafast',
    '-c:a',
    'aac',
    '-shortest',
    `${root()}/${key}`,
  ])
  if (result.status !== 0) throw new Error(result.stderr.toString())
  return key
}

function frameRate(path: string) {
  const out = spawnSync(ffmpeg, ['-hide_banner', '-i', path]).stderr.toString()
  return Number(/, ([\d.]+) fps/.exec(out)?.[1])
}

async function insertVideo(values: Record<string, unknown>) {
  const [id] = await db.table('videos').insert({
    caption_en: 'Clip',
    status: 'published',
    published_at: new Date(Date.now() - 60_000),
    created_at: new Date(),
    ...values,
  })
  return Number(id)
}

test.group('Video conversion', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('a tall 60 fps upload becomes 720x1280, 30 fps, fast start, with a cover', async ({
    assert,
    client,
  }) => {
    const source = makeClip(1080, 1920, 60)
    const id = await insertVideo({
      video_key: null,
      source_key: source,
      processing_status: 'pending',
    })

    // Not shown in the app while it converts.
    const before = await client.get('/api/v2/videos')
    assert.notInclude(
      before.body().data.map((item: { id: number }) => item.id),
      id
    )

    assert.isTrue(await processVideo(id))
    const row = await db.from('videos').where('id', id).firstOrFail()
    assert.equal(row.processing_status, 'ready')
    assert.isNull(row.source_key)
    assert.match(row.video_key, /^videos\/[0-9a-f-]{36}\.mp4$/)
    assert.equal(row.width, 720)
    assert.equal(row.height, 1280)
    assert.isAbove(Number(row.duration_ms), 1500)
    assert.isNotNull(row.thumbnail_key)
    assert.isFalse(existsSync(`${root()}/${source}`))

    const path = `${root()}/${row.video_key}`
    assert.isAtMost(frameRate(path), 30)
    const bytes = readFileSync(path)
    assert.isBelow(bytes.indexOf('moov'), bytes.indexOf('mdat'), 'index is at the start')
    const info = await probeVideo(path)
    assert.deepEqual([info.width, info.height], [720, 1280])

    const after = await client.get('/api/v2/videos')
    assert.include(
      after.body().data.map((item: { id: number }) => item.id),
      id
    )
  }).timeout(60_000)

  test('landscape fits 1280x720 and an existing video keeps playing until replaced', async ({
    assert,
  }) => {
    const original = makeClip(1920, 1080, 30)
    const id = await insertVideo({ video_key: original, thumbnail_key: null })

    assert.equal(await queueExistingVideos(), 1)
    const queued = await db.from('videos').where('id', id).firstOrFail()
    assert.equal(queued.video_key, original)
    assert.equal(queued.source_key, original)

    assert.equal(await processWaitingVideos(), 1)
    const row = await db.from('videos').where('id', id).firstOrFail()
    assert.notEqual(row.video_key, original)
    assert.deepEqual([row.width, row.height], [1280, 720])
    assert.isFalse(existsSync(`${root()}/${original}`))

    // Already converted: not queued again.
    assert.equal(await queueExistingVideos(), 0)
  }).timeout(60_000)

  test('a broken upload fails after three tries and keeps the current file', async ({ assert }) => {
    mkdirSync(`${root()}/videos`, { recursive: true })
    const playing = makeClip(720, 1280, 30)
    const broken = `videos/${randomUUID()}.mp4`
    const { writeFileSync } = await import('node:fs')
    writeFileSync(`${root()}/${broken}`, Buffer.from('\0\0\0\x18ftypmp42 not really a video'))
    const id = await insertVideo({
      video_key: playing,
      source_key: broken,
      processing_status: 'pending',
    })

    await processWaitingVideos()
    const row = await db.from('videos').where('id', id).firstOrFail()
    assert.equal(row.processing_status, 'failed')
    assert.equal(Number(row.processing_attempts), 3)
    assert.match(row.processing_error, /Video conversion failed/)
    assert.equal(row.video_key, playing)
    assert.isTrue(existsSync(`${root()}/${playing}`))
  }).timeout(60_000)
  test('a CMS upload is queued, then converted and published to the app', async ({
    assert,
    client,
  }) => {
    await db.table('users').insert({
      full_name: 'Test Admin',
      email: 'test@example.com',
      password: await hash.make('a-very-long-test-password'),
      role: 'admin',
      active: true,
      created_at: new Date(),
    })
    const tokens = await loginAdmin('test@example.com', 'a-very-long-test-password')
    const clip = makeClip(1080, 1920, 60)
    const saved = await client
      .post('/admin/videos')
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_refresh', tokens.refreshToken)
      .field('captionEn', 'A tall sixty fps clip')
      .field('captionAr', '')
      .field('categoryId', '')
      .field('placeId', '')
      .field('phone', '')
      .field('locationNameEn', '')
      .field('latitude', '')
      .field('longitude', '')
      .field('intent', 'publish')
      .file('video', readFileSync(`${root()}/${clip}`), {
        filename: 'tall.mp4',
        contentType: 'video/mp4',
      })
    assert.equal(saved.header('location'), '/admin/videos')
    const queued = await db.from('videos').firstOrFail()
    assert.equal(queued.processing_status, 'pending')
    assert.isNull(queued.video_key)
    assert.isNotNull(queued.source_key)
    const hidden = await client.get('/api/v2/videos')
    assert.lengthOf(hidden.body().data, 0)

    assert.equal(await processWaitingVideos(), 1)
    const ready = await db.from('videos').firstOrFail()
    assert.equal(ready.processing_status, 'ready')
    assert.deepEqual([ready.width, ready.height], [720, 1280])
    assert.equal(ready.status, 'published')
    // MySQL can round published_at up to the next second; step past it.
    await db.from('videos').update({ published_at: new Date(Date.now() - 60_000) })
    const shown = await client.get('/api/v2/videos')
    assert.lengthOf(shown.body().data, 1)
  }).timeout(60_000)
})
