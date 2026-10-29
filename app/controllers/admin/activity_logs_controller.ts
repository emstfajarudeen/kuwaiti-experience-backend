import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { formatKuwaitDateTime } from '../../services/date_service.js'
import { can } from '../../services/authorization_service.js'
import { formatActionLabel } from './dashboard_controller.js'

export default class ActivityLogsController {
  async index({ inertia, request, response, admin, authorization }: HttpContext) {
    if (!can(authorization, 'audit_logs.view')) {
      return response.redirect('/admin')
    }

    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const perPage = 25
    const entityType = request.input('entity_type') ? String(request.input('entity_type')) : null
    const q = request.input('q') ? String(request.input('q')).trim() : ''

    const query = db.from('audit_logs as a').leftJoin('users as u', 'u.id', 'a.actor_id')

    if (entityType) {
      query.where('a.entity_type', entityType)
    }

    if (q) {
      query.where((builder) => {
        builder
          .where('a.action', 'like', `%${q}%`)
          .orWhere('a.entity_id', 'like', `%${q}%`)
          .orWhere('u.full_name', 'like', `%${q}%`)
      })
    }

    const countRes = await query.clone().count('* as count').first()
    const total = Number(countRes?.count ?? 0)
    const lastPage = Math.max(1, Math.ceil(total / perPage))

    const rawLogs = await query
      .select(
        'a.id',
        'a.actor_id',
        'a.action',
        'a.entity_type',
        'a.entity_id',
        'a.created_at',
        'u.full_name as actor_name',
        'u.email as actor_email'
      )
      .orderBy('a.id', 'desc')
      .offset((page - 1) * perPage)
      .limit(perPage)

    // Collect entity IDs for name resolution
    const placeIds: number[] = []
    const categoryIds: number[] = []
    const movieIds: number[] = []
    const pageIds: number[] = []
    const categoryTypeCodes: string[] = []
    const userIds: number[] = []
    const roleIds: number[] = []

    for (const log of rawLogs) {
      const idNum = Number(log.entity_id)
      if (log.entity_type === 'place' && Number.isSafeInteger(idNum)) placeIds.push(idNum)
      else if (log.entity_type === 'category' && Number.isSafeInteger(idNum))
        categoryIds.push(idNum)
      else if (log.entity_type === 'movie' && Number.isSafeInteger(idNum)) movieIds.push(idNum)
      else if (log.entity_type === 'page' && Number.isSafeInteger(idNum)) pageIds.push(idNum)
      else if (log.entity_type === 'category_type' && log.entity_id)
        categoryTypeCodes.push(String(log.entity_id))
      else if (['user', 'staff'].includes(log.entity_type) && Number.isSafeInteger(idNum))
        userIds.push(idNum)
      else if (log.entity_type === 'role' && Number.isSafeInteger(idNum)) roleIds.push(idNum)
    }

    const [placesMap, categoriesMap, moviesMap, pagesMap, categoryTypesMap, usersMap, rolesMap] =
      await Promise.all([
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
              .then(
                (rows) => new Map(rows.map((r) => [Number(r.id), r.name || `Category #${r.id}`]))
              )
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

        userIds.length
          ? db
              .from('users')
              .whereIn('id', userIds)
              .select('id', 'full_name')
              .then(
                (rows) => new Map(rows.map((r) => [Number(r.id), r.full_name || `User #${r.id}`]))
              )
          : new Map(),

        roleIds.length
          ? db
              .from('roles')
              .whereIn('id', roleIds)
              .select('id', 'name')
              .then((rows) => new Map(rows.map((r) => [Number(r.id), r.name || `Role #${r.id}`])))
          : new Map(),
      ])

    const editPermissionForEntity: Record<string, string> = {
      place: 'places.update',
      category: 'categories.update',
      category_type: 'category_types.update',
      movie: 'movies.update',
      showtime: 'showtimes.update',
      page: 'pages.update',
      contact: 'contact_requests.view',
      contact_request: 'contact_requests.view',
      user: 'staff.manage',
      staff: 'staff.manage',
      role: 'roles.manage',
    }

    const logs = rawLogs.map((log) => {
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
      } else if (['user', 'staff'].includes(log.entity_type)) {
        const found = usersMap.get(idNum)
        if (found) {
          entityName = found
          editUrl = `/admin/users/${idNum}/edit`
        } else {
          isDeleted = true
          entityName = `Staff #${log.entity_id}`
        }
      } else if (log.entity_type === 'role') {
        const found = rolesMap.get(idNum)
        if (found) {
          entityName = found
          editUrl = `/admin/roles/${idNum}/edit`
        } else {
          isDeleted = true
          entityName = `Role #${log.entity_id}`
        }
      } else if (log.entity_type === 'contact' || log.entity_type === 'contact_request') {
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
        editUrl:
          editUrl && can(authorization, editPermissionForEntity[String(log.entity_type)] ?? '')
            ? editUrl
            : null,
        isDeleted,
        actorName: log.actor_name || 'System',
        actorEmail: log.actor_email || null,
        created_at: formatKuwaitDateTime(log.created_at),
      }
    })

    return inertia.render(
      'activity_logs/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        logs,
        filters: {
          q,
          entity_type: entityType,
        },
        meta: {
          page,
          per_page: perPage,
          total,
          last_page: lastPage,
        },
      },
      { bodyClass: 'cms-body' }
    )
  }
}
