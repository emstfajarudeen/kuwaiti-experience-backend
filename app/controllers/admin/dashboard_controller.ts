import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { categoryTypes } from '../../services/category_type_service.js'

export default class AdminDashboardController {
  async index({ view, admin }: HttpContext) {
    const counts = await db.from('places').select('type').count('* as count').groupBy('type')
    const published = await db
      .from('places')
      .where('status', 'published')
      .count('* as count')
      .first()
    const media = await db.from('media').count('* as count').first()
    const types = await categoryTypes()
    const recent = await db
      .from('audit_logs')
      .select('action', 'entity_type', 'entity_id', 'created_at')
      .orderBy('id', 'desc')
      .limit(8)
    const byType = (type: string) => Number(counts.find((row) => row.type === type)?.count ?? 0)
    const stats = [
      ...types.map((type) => ({
        label: String(type.name_en).toUpperCase(),
        count: byType(type.code),
        note: 'Places in this type',
      })),
      {
        label: 'PUBLISHED',
        count: Number(published?.count ?? 0),
        note: `${Number(media?.count ?? 0)} images in library`,
      },
    ]
    return view.render('admin/dashboard', { admin, stats, recent })
  }
}
