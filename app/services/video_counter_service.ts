import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/**
 * Video and comment counters are stored for fast feed reads, but always written as a
 * fresh COUNT(*) of the real rows instead of +1/-1. A recount is correct even when the
 * stored value had drifted (for example after rows were removed by a foreign-key cascade),
 * so any interaction heals the counter. Callers should hold the row lock when racing
 * writes are possible.
 */

const VIDEO_COUNTS = `
  comment_count = (SELECT COUNT(*) FROM video_comments c WHERE c.video_id = videos.id AND c.status = 'visible'),
  like_count = (SELECT COUNT(*) FROM video_likes l WHERE l.video_id = videos.id),
  save_count = (SELECT COUNT(*) FROM video_saves s WHERE s.video_id = videos.id)`

const COMMENT_COUNTS = `
  like_count = (SELECT COUNT(*) FROM video_comment_likes l WHERE l.comment_id = video_comments.id)`

const ids = (values: number[]) => [...new Set(values.map(Number))].filter((id) => id > 0)
const placeholders = (values: number[]) => values.map(() => '?').join(', ')

/** Recompute comment, like and save counts for these videos. */
export async function recountVideos(client: QueryClientContract, videoIds: number[]) {
  const list = ids(videoIds)
  if (!list.length) return
  await client.rawQuery(
    `UPDATE videos SET ${VIDEO_COUNTS} WHERE id IN (${placeholders(list)})`,
    list
  )
}

/** Recompute like counts for these comments. */
export async function recountComments(client: QueryClientContract, commentIds: number[]) {
  const list = ids(commentIds)
  if (!list.length) return
  await client.rawQuery(
    `UPDATE video_comments SET ${COMMENT_COUNTS} WHERE id IN (${placeholders(list)})`,
    list
  )
}

/** Repair every counter, returning how many rows were wrong before the fix. */
export async function recountAll(client: QueryClientContract = db.connection()) {
  const [videoDrift] = await client.rawQuery(
    `SELECT COUNT(*) AS total FROM videos WHERE
       comment_count <> (SELECT COUNT(*) FROM video_comments c WHERE c.video_id = videos.id AND c.status = 'visible')
       OR like_count <> (SELECT COUNT(*) FROM video_likes l WHERE l.video_id = videos.id)
       OR save_count <> (SELECT COUNT(*) FROM video_saves s WHERE s.video_id = videos.id)`
  )
  const [commentDrift] = await client.rawQuery(
    `SELECT COUNT(*) AS total FROM video_comments WHERE
       like_count <> (SELECT COUNT(*) FROM video_comment_likes l WHERE l.comment_id = video_comments.id)`
  )
  await client.rawQuery(`UPDATE videos SET ${VIDEO_COUNTS}`)
  await client.rawQuery(`UPDATE video_comments SET ${COMMENT_COUNTS}`)
  return {
    videos: Number(videoDrift[0]?.total ?? 0),
    comments: Number(commentDrift[0]?.total ?? 0),
  }
}
