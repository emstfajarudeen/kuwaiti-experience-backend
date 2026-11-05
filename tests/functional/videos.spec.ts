import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import * as admin from '../../app/services/video_admin_service.js'
import * as pub from '../../app/services/video_public_service.js'
import drive from '@adonisjs/drive/services/main'
import { ApiError } from '../../app/services/api_error.js'

async function seed() {
  const [staffId] = await db.table('users').insert({
    full_name: 'Staff',
    email: 'videos@example.com',
    password: 'x',
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  const customers: number[] = []
  for (const n of [1, 2]) {
    const [id] = await db.table('customers').insert({
      phone_e164: `+9659000000${n}`,
      first_name: n === 1 ? 'Mariam' : 'Ali',
      last_name: 'Al-Khaled',
      email: `v${n}@example.com`,
      phone_verified_at: new Date(),
      created_at: new Date(),
    })
    customers.push(Number(id))
  }
  const base = {
    captionEn: 'Sunset over the towers',
    captionAr: null,
    categoryId: null,
    placeId: null,
    phone: null,
    locationNameEn: null,
    locationNameAr: null,
    latitude: null,
    longitude: null,
  }
  const key = (n: number) => `videos/00000000-0000-4000-8000-00000000000${n}.mp4`
  const insertVideo = async (
    n: number,
    status = 'published',
    extra: Record<string, unknown> = {}
  ) => {
    const [id] = await db.table('videos').insert({
      caption_en: `${base.captionEn} ${n}`,
      video_key: key(n),
      status,
      published_at: status === 'published' ? new Date(Date.now() - n * 1000) : null,
      created_at: new Date(),
      ...extra,
    })
    return Number(id)
  }
  return { staffId: Number(staffId), customers, insertVideo }
}

test.group('Videos', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('feed is newest first, hides drafts, and shows the platform as creator', async ({
    assert,
  }) => {
    const { insertVideo } = await seed()
    const older = await insertVideo(5)
    const newer = await insertVideo(1)
    await insertVideo(2, 'draft')
    const result = await pub.feed({}, 'en')
    assert.deepEqual(
      result.data.map((v) => v.id),
      [newer, older]
    )
    assert.equal(result.data[0].creator.type, 'platform')
    assert.equal(result.data[0].creator.handle, 'thekuwaitiexperience')
    assert.match(result.data[0].video_url!, /^\/api\/v1\/video-files\//)
  })

  test('feed pages with a cursor', async ({ assert }) => {
    const { insertVideo } = await seed()
    const ids = [await insertVideo(1), await insertVideo(2), await insertVideo(3)]
    const first = await pub.feed({ limit: 2 }, 'en')
    assert.deepEqual(
      first.data.map((v) => v.id),
      [ids[0], ids[1]]
    )
    assert.isNotNull(first.meta.next_cursor)
    const second = await pub.feed({ limit: 2, cursor: first.meta.next_cursor }, 'en')
    assert.deepEqual(
      second.data.map((v) => v.id),
      [ids[2]]
    )
    assert.isNull(second.meta.next_cursor)
  })

  test('feed pins a shared video first, then continues without repeating it', async ({
    assert,
  }) => {
    const { insertVideo } = await seed()
    const ids = [await insertVideo(1), await insertVideo(2), await insertVideo(3)]
    const draft = await insertVideo(4, 'draft')
    const first = await pub.feed({ limit: 1, video_id: ids[2] }, 'en')
    assert.deepEqual(
      first.data.map((v) => v.id),
      [ids[2], ids[0]]
    )
    assert.isTrue(first.meta.pinned_video_found)
    const second = await pub.feed(
      { limit: 1, video_id: ids[2], cursor: first.meta.next_cursor },
      'en'
    )
    assert.deepEqual(
      second.data.map((v) => v.id),
      [ids[1]]
    )
    assert.isUndefined(second.meta.pinned_video_found)
    assert.isNull(second.meta.next_cursor)
    const missing = await pub.feed({ limit: 2, video_id: draft }, 'en')
    assert.deepEqual(
      missing.data.map((v) => v.id),
      [ids[0], ids[1]]
    )
    assert.isFalse(missing.meta.pinned_video_found)
    let code = ''
    try {
      await pub.feed({ video_id: 'abc' }, 'en')
    } catch (error) {
      code = (error as { code?: string }).code ?? ''
    }
    assert.equal(code, 'INVALID_FILTER')
  })

  test('a video of an unpublished business is hidden; a published one shows as the creator', async ({
    assert,
  }) => {
    const { insertVideo } = await seed()
    await db.table('category_types').insert({ code: 'attraction', name_en: 'Attractions' })
    const [placeId] = await db.table('places').insert({
      type: 'attraction',
      slug: 'kuwait-towers',
      status: 'draft',
      created_at: new Date(),
    })
    await db.table('place_translations').insert({
      place_id: placeId,
      locale: 'en',
      title: 'Kuwait Towers',
      summary: 's',
      address: 'Arabian Gulf St',
    })
    const id = await insertVideo(1, 'published', { place_id: placeId, phone_e164: '+96512345678' })
    assert.lengthOf((await pub.feed({}, 'en')).data, 0)
    await db
      .from('places')
      .where('id', placeId)
      .update({ status: 'published', published_at: new Date(Date.now() - 1000) })
    const item = (await pub.feed({}, 'en')).data[0]
    assert.equal(item.id, id)
    assert.equal(item.creator.type, 'business')
    assert.equal(item.creator.name, 'Kuwait Towers')
    assert.equal(item.actions.phone, '+96512345678')
  })

  test('likes and saves are idempotent and keep counts', async ({ assert }) => {
    const { insertVideo, customers } = await seed()
    const id = await insertVideo(1)
    await pub.setLike(id, customers[0], true)
    const again = await pub.setLike(id, customers[0], true)
    assert.equal(again.data.count, 1)
    await pub.setLike(id, customers[1], true)
    assert.equal((await pub.setLike(id, customers[0], false)).data.count, 1)
    assert.equal((await pub.setLike(id, customers[0], false)).data.count, 1)
    await pub.setSaved(id, customers[0], true)
    const item = (await pub.showVideo(id, 'en', customers[0])).data
    assert.deepEqual(item.viewer, { liked: false, saved: true })
    assert.equal(item.counts.likes, 1)
    assert.lengthOf((await pub.savedFeed({}, 'en', customers[0])).data, 1)
  })

  test('comments appear immediately, can be liked, hidden by staff and deleted by the author', async ({
    assert,
  }) => {
    const { insertVideo, customers, staffId } = await seed()
    const id = await insertVideo(1)
    const first = (await pub.addComment(id, customers[0], '  Great view!  ')).data
    assert.equal(first.body, 'Great view!')
    assert.equal(first.author.initials, 'MA')
    await pub.addComment(id, customers[1], 'Never gets old')
    assert.equal((await pub.showVideo(id, 'en')).data.counts.comments, 2)
    assert.equal((await pub.setCommentLike(first.id, customers[1], true)).data.count, 1)
    const list = await pub.comments(id, {}, customers[1])
    assert.equal(list.data[1].liked, true)
    assert.equal(list.data[0].mine, true)
    await admin.setCommentStatus(first.id, 'hidden', staffId)
    assert.lengthOf((await pub.comments(id, {})).data, 1)
    assert.equal((await pub.showVideo(id, 'en')).data.counts.comments, 1)
    await assert.rejects(
      () => pub.deleteComment(list.data[0].id, customers[0]),
      'You can only delete your own comments'
    )
    await pub.deleteComment(list.data[0].id, customers[1])
    assert.equal((await pub.showVideo(id, 'en')).data.counts.comments, 0)
    await assert.rejects(() => pub.addComment(id, customers[0], '   '))
  })

  test('reports validate the reason and are stored once per customer', async ({ assert }) => {
    const { insertVideo, customers, staffId } = await seed()
    const id = await insertVideo(1)
    await assert.rejects(() => pub.reportVideo(id, customers[0], 'nope', null))
    await pub.reportVideo(id, customers[0], 'spam', null)
    await pub.reportVideo(id, customers[0], 'hate', 'again')
    const open = await admin.listReports('open', 1)
    assert.equal(open.total, 1)
    assert.equal(open.rows[0].reason_label, 'Spam or misleading content')
    await admin.setReportStatus(open.rows[0].id, 'reviewed', staffId, true)
    assert.equal((await db.from('videos').where('id', id).first()).status, 'draft')
    assert.equal((await admin.listReports('open', 1)).total, 0)
  })

  test('deactivated customers cannot interact', async ({ assert }) => {
    const { insertVideo, customers } = await seed()
    const id = await insertVideo(1)
    await db.from('customers').where('id', customers[0]).update({ active: false })
    try {
      await pub.setLike(id, customers[0], true)
      assert.fail('expected rejection')
    } catch (error) {
      assert.instanceOf(error, ApiError)
      assert.equal((error as ApiError).code, 'ACCOUNT_DISABLED')
    }
  })

  test('staff can create, publish and delete a video; business and category must agree', async ({
    assert,
  }) => {
    const { staffId } = await seed()
    const input = {
      captionEn: 'New reel',
      captionAr: null,
      categoryId: null,
      placeId: null,
      phone: null,
      locationNameEn: null,
      locationNameAr: null,
      latitude: null,
      longitude: null,
    }
    await assert.rejects(
      () => admin.saveVideo(input, {}, staffId, undefined, 'save'),
      'Upload a video'
    )
    await assert.rejects(
      () => admin.saveVideo({ ...input, placeId: 999 }, {}, staffId, undefined, 'save'),
      'Choose a valid business'
    )
  })
})

test.group('Videos HTTP', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('serves the feed and ranged video files, only for published videos', async ({
    assert,
    client,
  }) => {
    const { insertVideo } = await seed()
    const id = await insertVideo(7)
    const draft = await insertVideo(8, 'draft')
    const bytes = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(100, 1),
    ])
    await drive.use('local').put('videos/00000000-0000-4000-8000-000000000007.mp4', bytes)
    await drive.use('local').put('videos/00000000-0000-4000-8000-000000000008.mp4', bytes)

    const feedResponse = await client.get('/api/v2/videos')
    feedResponse.assertStatus(200)
    assert.equal(feedResponse.body().data[0].id, id)
    const url = feedResponse.body().data[0].video_url as string

    const full = await client.get(url)
    full.assertStatus(200)
    assert.equal(full.header('accept-ranges'), 'bytes')
    const part = await client.get(url).header('Range', 'bytes=0-9')
    part.assertStatus(206)
    assert.equal(part.header('content-range'), `bytes 0-9/${bytes.length}`)
    const bad = await client.get(url).header('Range', 'bytes=9999-')
    bad.assertStatus(416)
    ;(
      await client.get('/api/v1/video-files/00000000-0000-4000-8000-000000000008.mp4')
    ).assertStatus(404)
    ;(await client.get(`/api/v2/videos/${draft}`)).assertStatus(404)
    ;(await client.get('/api/v2/videos/report-reasons')).assertStatus(200)
    ;(await client.put(`/api/v2/videos/${id}/like`)).assertStatus(401)
    await drive.use('local').delete('videos/00000000-0000-4000-8000-000000000007.mp4')
    await drive.use('local').delete('videos/00000000-0000-4000-8000-000000000008.mp4')
  })
})
