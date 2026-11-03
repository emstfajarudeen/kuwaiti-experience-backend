import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import app from '@adonisjs/core/services/app'
import sharp from 'sharp'

const run = promisify(execFile)
const videoKey = (n: number) =>
  `videos/00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}.mp4`
const thumbKey = (n: number) => `demo-video-${n}.webp`

const customers = [
  ['Mariam', 'Al-Khaled'],
  ['Ahmad', 'Al-Sabah'],
  ['Sara', 'Al-Enezi'],
  ['Yousef', 'Al-Rashid'],
  ['Noura', 'Al-Mutairi'],
  ['Fahad', 'Al-Ajmi'],
]

const videos = [
  {
    caption: 'Sunset over the iconic Kuwait Towers. The golden hour here is unreal.',
    ar: 'غروب الشمس فوق أبراج الكويت الشهيرة.',
    hue: '#1f3b5c',
    status: 'published',
    business: true,
    phone: '+96522444444',
    place: 0,
  },
  {
    caption: 'A morning walk along the Gulf Road: the best coffee spots in Salmiya.',
    ar: 'جولة صباحية على طريق الخليج.',
    hue: '#5c3b1f',
    status: 'published',
    business: false,
  },
  {
    caption: 'Weekend at the Avenues: shopping, dining and the dancing fountain.',
    ar: 'عطلة نهاية الأسبوع في الأفنيوز.',
    hue: '#3b1f5c',
    status: 'published',
    business: true,
    place: 1,
  },
  {
    caption: 'Traditional Kuwaiti breakfast you need to try: balaleet and chebab.',
    ar: 'فطور كويتي تقليدي يجب أن تجربه.',
    hue: '#1f5c3b',
    status: 'published',
    business: false,
  },
  {
    caption: 'Hidden beaches near Khiran. Perfect for a quiet day by the sea.',
    ar: 'شواطئ مخفية قرب الخيران.',
    hue: '#1f5c5c',
    status: 'published',
    business: true,
    place: 2,
  },
  {
    caption: 'Night views from the Marina Waves, where the skyline meets the sea.',
    ar: 'مناظر ليلية من مارينا ويفز.',
    hue: '#5c1f3b',
    status: 'published',
    business: false,
  },
  {
    caption: 'Draft: new rooftop lounge opening next month.',
    ar: null,
    hue: '#444444',
    status: 'draft',
    business: false,
  },
  {
    caption: 'Draft: behind the scenes at the Heritage Souq.',
    ar: null,
    hue: '#555533',
    status: 'draft',
    business: false,
  },
]

const commentBodies = [
  'That golden hour is unreal! What time did you film this?',
  'Never gets old. The best view in Kuwait 🇰🇼',
  'Adding this to my weekend plans, so beautiful!',
  'Where exactly is this? I want to go tomorrow.',
  'Great video, thanks for sharing.',
  'Can you share the location pin?',
  'Absolutely love this place.',
  'Saved for later!',
]

/** Builds one small vertical sample video, or falls back to a header-only stub. */
async function sampleVideo() {
  const provided = app.makePath('database/seeders/assets/sample.mp4')
  if (existsSync(provided)) return readFile(provided)
  const dir = await mkdtemp(join(tmpdir(), 'seed-video-'))
  const out = join(dir, 'sample.mp4')
  try {
    await run(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=360x640:rate=24:duration=4',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-movflags',
        '+faststart',
        out,
      ],
      { timeout: 60_000 }
    )
    return await readFile(out)
  } catch {
    console.warn(
      'ffmpeg is unavailable: seeding placeholder video files that will not play. Put a real file at database/seeders/assets/sample.mp4 to use it for every demo video.'
    )
    return Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(2048, 1),
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function thumbnail(n: number, hue: string, caption: string) {
  const text = caption.replace(/[&<>"']/g, '').slice(0, 34)
  const svg = `<svg width="540" height="960" xmlns="http://www.w3.org/2000/svg">
    <rect width="540" height="960" fill="${hue}"/>
    <circle cx="420" cy="180" r="340" fill="#ffffff" opacity=".06"/>
    <text x="40" y="70" fill="#e7bc65" font-size="18" letter-spacing="4" font-family="Arial">THE KUWAITI EXPERIENCE · DEMO</text>
    <text x="40" y="880" fill="white" font-size="30" font-family="Arial">${text}</text>
  </svg>`
  await drive
    .use('local')
    .put(thumbKey(n), await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer())
}

export default class VideoSeeder extends BaseSeeder {
  async run() {
    if (process.env.NODE_ENV === 'production')
      throw new Error('VideoSeeder is disabled in production')

    // Remove an earlier run so the seeder can be repeated safely.
    const old = await db.from('videos').whereIn(
      'video_key',
      videos.map((_, i) => videoKey(i + 1))
    )
    for (const row of old) {
      await drive
        .use('local')
        .delete(row.video_key)
        .catch(() => undefined)
      if (row.thumbnail_key)
        await drive
          .use('local')
          .delete(row.thumbnail_key)
          .catch(() => undefined)
    }
    if (old.length)
      await db
        .from('videos')
        .whereIn(
          'id',
          old.map((row) => row.id)
        )
        .delete()

    const customerIds: number[] = []
    for (const [index, [first, last]] of customers.entries()) {
      const phone = `+9656000000${index + 1}`
      const existing = await db.from('customers').where('phone_e164', phone).first()
      if (existing) {
        customerIds.push(Number(existing.id))
        continue
      }
      const [id] = await db.table('customers').insert({
        phone_e164: phone,
        first_name: first,
        last_name: last,
        email: `demo.video.${index + 1}@example.com`,
        phone_verified_at: new Date(),
        created_at: new Date(),
      })
      customerIds.push(Number(id))
    }

    const places = await db
      .from('places')
      .where('status', 'published')
      .orderBy('id')
      .limit(3)
      .select('id', 'category_id')
    const category = await db.from('categories').orderBy('id').first()
    const file = await sampleVideo()
    const now = Date.now()
    const videoIds: number[] = []

    for (const [index, item] of videos.entries()) {
      const n = index + 1
      await drive.use('local').put(videoKey(n), file)
      await thumbnail(n, item.hue, item.caption)
      const place = item.business ? places[item.place ?? 0] : undefined
      const published = item.status === 'published'
      const [id] = await db.table('videos').insert({
        caption_en: item.caption,
        caption_ar: item.ar,
        video_key: videoKey(n),
        thumbnail_key: thumbKey(n),
        size_bytes: file.length,
        status: item.status,
        published_at: published ? new Date(now - n * 3_600_000 * 7) : null,
        place_id: place ? Number(place.id) : null,
        category_id: place?.category_id
          ? Number(place.category_id)
          : n % 2 === 0 && category
            ? Number(category.id)
            : null,
        phone_e164: n === 2 ? '+96599887766' : null,
        location_name_en: n === 2 ? 'Gulf Road, Salmiya' : null,
        latitude: n === 2 ? 29.3355 : null,
        longitude: n === 2 ? 48.0752 : null,
        created_at: new Date(now - n * 3_600_000 * 7),
        updated_at: new Date(),
      })
      videoIds.push(Number(id))
    }

    const publishedIds = videoIds.filter((_, i) => videos[i].status === 'published')

    // Likes, saves and comments from a spread of customers.
    for (const [v, videoId] of publishedIds.entries()) {
      for (const [c, customerId] of customerIds.entries()) {
        if ((v + c) % 3 !== 0 && (v * 2 + c) % 4 !== 0) {
          await db
            .table('video_likes')
            .insert({ video_id: videoId, customer_id: customerId, created_at: new Date() })
        }
        if ((v + c) % 4 === 0) {
          await db
            .table('video_saves')
            .insert({ video_id: videoId, customer_id: customerId, created_at: new Date() })
        }
      }
      const commentCount = 2 + (v % 3)
      for (let k = 0; k < commentCount; k++) {
        const hidden = v === 1 && k === 0
        const [commentId] = await db.table('video_comments').insert({
          video_id: videoId,
          customer_id: customerIds[(v + k) % customerIds.length],
          body: commentBodies[(v * 3 + k) % commentBodies.length],
          status: hidden ? 'hidden' : 'visible',
          created_at: new Date(now - (k + 1) * 1_800_000 - v * 600_000),
        })
        for (const [c, customerId] of customerIds.entries()) {
          if ((c + k + v) % 3 === 0) {
            await db
              .table('video_comment_likes')
              .insert({ comment_id: commentId, customer_id: customerId, created_at: new Date() })
          }
        }
      }
    }

    // Reports in each state.
    const reports: Array<[number, number, string, string | null, string]> = [
      [0, 1, 'spam', 'Looks like an advert.', 'open'],
      [0, 2, 'other', null, 'open'],
      [2, 3, 'hate', 'Offensive comment thread.', 'open'],
      [3, 4, 'violence', null, 'reviewed'],
      [4, 0, 'illegal', 'Unlicensed activity advertised.', 'dismissed'],
      [5, 5, 'sexual', null, 'dismissed'],
    ]
    for (const [v, c, reason, note, status] of reports) {
      await db.table('video_reports').insert({
        video_id: publishedIds[v],
        customer_id: customerIds[c],
        reason,
        note,
        status,
        created_at: new Date(now - (v + 1) * 5_000_000),
        reviewed_at: status === 'open' ? null : new Date(),
      })
    }

    // Counters follow the rows, plus some demo shares.
    for (const [index, videoId] of videoIds.entries()) {
      const count = async (table: string, where: Record<string, unknown> = {}) =>
        Number(
          (await db.from(table).where('video_id', videoId).where(where).count('* as n').first())
            ?.n ?? 0
        )
      await db
        .from('videos')
        .where('id', videoId)
        .update({
          like_count: await count('video_likes'),
          save_count: await count('video_saves'),
          comment_count: await count('video_comments', { status: 'visible' }),
          share_count: videos[index].status === 'published' ? (index + 1) * 3 : 0,
        })
    }
    const commentIds = await db.from('video_comments').whereIn('video_id', videoIds).select('id')
    for (const { id } of commentIds) {
      const n = Number(
        (await db.from('video_comment_likes').where('comment_id', id).count('* as n').first())?.n ??
          0
      )
      await db.from('video_comments').where('id', id).update({ like_count: n })
    }
    console.log(`Seeded ${videoIds.length} demo videos with likes, saves, comments and reports.`)
  }
}
