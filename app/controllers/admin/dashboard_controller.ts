import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { categoryTypes } from '../../services/category_type_service.js'
import { formatKuwaitDateTime } from '../../services/date_service.js'

function formatActionLabel(action: string): string {
  const map: Record<string, string> = {
    'place.create': 'Created place',
    'place.save': 'Updated place',
    'place.publish': 'Published place',
    'place.archive': 'Archived place',
    'place.delete': 'Deleted place',
    'category.create': 'Created category',
    'category.save': 'Updated category',
    'category.delete': 'Deleted category',
    'category_type.create': 'Created category type',
    'category_type.save': 'Updated category type',
    'category_type.delete': 'Deleted category type',
    'movie.create': 'Created movie',
    'movie.save': 'Updated movie',
    'movie.publish': 'Published movie',
    'movie.archive': 'Archived movie',
    'movie.delete': 'Deleted movie',
    'showtime.create': 'Created showtime',
    'showtime.save': 'Updated showtime',
    'showtime.delete': 'Deleted showtime',
    'page.create': 'Created page',
    'page.save': 'Updated page',
    'page.publish': 'Published page',
    'page.archive': 'Archived page',
    'page.delete': 'Deleted page',
    'place_explore.update': 'Updated Explore details',
    'place_features.save': 'Updated feature',
    'place_features.delete': 'Deleted feature',
    'contact.status': 'Updated contact request',
    'home.save': 'Updated homepage',
    'settings.save': 'Updated site settings',
  }
  return map[action] ?? action.replace(/[_.]/g, ' ')
}

export default class AdminDashboardController {
  async index({ view, admin }: HttpContext) {
    const [
      totalPlacesRes,
      publishedPlacesRes,
      draftPlacesRes,
      archivedPlacesRes,
      newContactsRes,
      typeCounts,
      types,
      rawAuditLogs,
    ] = await Promise.all([
      db.from('places').count('* as count').first(),
      db.from('places').where('status', 'published').count('* as count').first(),
      db.from('places').where('status', 'draft').count('* as count').first(),
      db.from('places').where('status', 'archived').count('* as count').first(),
      db.from('contact_requests').where('status', 'new').count('* as count').first(),
      db.from('places').select('type').count('* as count').groupBy('type'),
      categoryTypes(),
      db
        .from('audit_logs')
        .select('id', 'action', 'entity_type', 'entity_id', 'created_at')
        .orderBy('id', 'desc')
        .limit(10),
    ])

    const totalPlaces = Number(totalPlacesRes?.count ?? 0)
    const publishedCount = Number(publishedPlacesRes?.count ?? 0)
    const draftCount = Number(draftPlacesRes?.count ?? 0)
    const archivedCount = Number(archivedPlacesRes?.count ?? 0)
    const newContactsCount = Number(newContactsRes?.count ?? 0)

    const countByType = (code: string) =>
      Number(typeCounts.find((row) => row.type === code)?.count ?? 0)

    const typeBreakdown = types.map((t) => ({
      code: t.code,
      name: t.name_en,
      count: countByType(t.code),
    }))

    // Batch resolve entity names and links for audit events
    const placeIds: number[] = []
    const categoryIds: number[] = []
    const movieIds: number[] = []
    const pageIds: number[] = []
    const categoryTypeCodes: string[] = []

    for (const log of rawAuditLogs) {
      const idNum = Number(log.entity_id)
      if (log.entity_type === 'place' && Number.isSafeInteger(idNum)) placeIds.push(idNum)
      else if (log.entity_type === 'category' && Number.isSafeInteger(idNum))
        categoryIds.push(idNum)
      else if (log.entity_type === 'movie' && Number.isSafeInteger(idNum)) movieIds.push(idNum)
      else if (log.entity_type === 'page' && Number.isSafeInteger(idNum)) pageIds.push(idNum)
      else if (log.entity_type === 'category_type' && log.entity_id)
        categoryTypeCodes.push(String(log.entity_id))
    }

    const [placesMap, categoriesMap, moviesMap, pagesMap, categoryTypesMap] = await Promise.all([
      placeIds.length
        ? db
            .from('places as p')
            .leftJoin('place_translations as t', function () {
              this.on('t.place_id', '=', 'p.id').andOnVal('t.locale', '=', 'en')
            })
            .whereIn('p.id', placeIds)
            .select('p.id', 't.title', 'p.status')
            .then(
              (rows) =>
                new Map(
                  rows.map((r) => [
                    Number(r.id),
                    { title: r.title || `Place #${r.id}`, status: r.status },
                  ])
                )
            )
        : new Map(),

      categoryIds.length
        ? db
            .from('categories as c')
            .leftJoin('category_translations as t', function () {
              this.on('t.category_id', '=', 'c.id').andOnVal('t.locale', '=', 'en')
            })
            .whereIn('c.id', categoryIds)
            .select('c.id', 't.name')
            .then((rows) => new Map(rows.map((r) => [Number(r.id), r.name || `Category #${r.id}`])))
        : new Map(),

      movieIds.length
        ? db
            .from('movies')
            .whereIn('id', movieIds)
            .select('id', 'title_en')
            .then(
              (rows) => new Map(rows.map((r) => [Number(r.id), r.title_en || `Movie #${r.id}`]))
            )
        : new Map(),

      pageIds.length
        ? db
            .from('pages as p')
            .leftJoin('page_translations as t', function () {
              this.on('t.page_id', '=', 'p.id').andOnVal('t.locale', '=', 'en')
            })
            .whereIn('p.id', pageIds)
            .select('p.id', 't.title', 'p.slug')
            .then(
              (rows) =>
                new Map(rows.map((r) => [Number(r.id), r.title || r.slug || `Page #${r.id}`]))
            )
        : new Map(),

      categoryTypeCodes.length
        ? db
            .from('category_types')
            .whereIn('code', categoryTypeCodes)
            .select('code', 'name_en')
            .then((rows) => new Map(rows.map((r) => [r.code, r.name_en])))
        : new Map(),
    ])

    const recent = rawAuditLogs.map((log) => {
      const idNum = Number(log.entity_id)
      let entityName = ''
      let editUrl: string | null = null
      let isDeleted = false

      if (log.entity_type === 'place') {
        const found = placesMap.get(idNum)
        if (found) {
          entityName = found.title
          editUrl = `/admin/places/${idNum}/edit`
        } else {
          isDeleted = true
          entityName = `Place #${log.entity_id}`
        }
      } else if (log.entity_type === 'category') {
        const found = categoriesMap.get(idNum)
        if (found) {
          entityName = found
          editUrl = `/admin/categories/${idNum}/edit`
        } else {
          isDeleted = true
          entityName = `Category #${log.entity_id}`
        }
      } else if (log.entity_type === 'category_type') {
        const found = categoryTypesMap.get(String(log.entity_id))
        if (found) {
          entityName = found
          editUrl = `/admin/category-types/${log.entity_id}/edit`
        } else {
          isDeleted = true
          entityName = `Type: ${log.entity_id}`
        }
      } else if (log.entity_type === 'movie') {
        const found = moviesMap.get(idNum)
        if (found) {
          entityName = found
          editUrl = `/admin/movies/${idNum}/edit`
        } else {
          isDeleted = true
          entityName = `Movie #${log.entity_id}`
        }
      } else if (log.entity_type === 'page') {
        const found = pagesMap.get(idNum)
        if (found) {
          entityName = found
          editUrl = `/admin/pages/${idNum}/edit`
        } else {
          isDeleted = true
          entityName = `Page #${log.entity_id}`
        }
      } else if (log.entity_type === 'showtime') {
        entityName = `Showtime #${log.entity_id}`
        editUrl = `/admin/showtimes/${idNum}/edit`
      } else if (log.entity_type === 'contact') {
        entityName = `Contact request #${log.entity_id}`
        editUrl = `/admin/contact-requests/${idNum}`
      } else {
        entityName = `${log.entity_type} #${log.entity_id || '—'}`
      }

      return {
        id: log.id,
        action: log.action,
        actionLabel: formatActionLabel(log.action),
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        entityName,
        editUrl,
        isDeleted,
        created_at: formatKuwaitDateTime(log.created_at),
      }
    })

    // Legacy stats array for backward compatibility
    const stats = [
      { label: 'TOTAL PLACES', count: totalPlaces, note: 'All places in collection' },
      { label: 'PUBLISHED', count: publishedCount, note: 'Visible to public visitors' },
      { label: 'DRAFTS', count: draftCount, note: 'Awaiting review or publication' },
      { label: 'ARCHIVED', count: archivedCount, note: 'Removed from public view' },
    ]

    return view.render('admin/dashboard', {
      admin,
      stats,
      recent,
      totalPlaces,
      publishedCount,
      draftCount,
      archivedCount,
      newContactsCount,
      typeBreakdown,
    })
  }
}
