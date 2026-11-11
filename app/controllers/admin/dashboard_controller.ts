import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { categoryTypes } from '../../services/category_type_service.js'
import { formatKuwaitDateTime } from '../../services/date_service.js'
import { can } from '../../services/authorization_service.js'
import { providerDashboard } from '../../services/rental_provider_portal_service.js'
import { kwd, toFils } from '../../services/rental_money.js'

export function formatActionLabel(action: string): string {
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
    'contact.status': 'Updated contact request',
    'home.save': 'Updated homepage',
    'settings.save': 'Updated site settings',
    'notification.broadcast': 'Sent push notification',
  }
  return map[action] ?? action.replace(/[_.]/g, ' ')
}

export default class AdminDashboardController {
  async index({ inertia, request, admin, authorization, session }: HttpContext) {
    if (admin.providerId) {
      // Rental provider portal home.
      const data = await providerDashboard(admin.providerId)
      const money = (rows: typeof data.upcoming) =>
        rows.map((row) => ({ ...row, rental_amount: kwd(toFils(row.rental_amount)) }))
      return inertia.render(
        'rentals/provider_dashboard',
        {
          adminName: admin.fullName,
          csrfToken: request.csrfToken,
          success: (session.flashMessages.get('success') as string | undefined) ?? null,
          error: (session.flashMessages.get('error') as string | undefined) ?? null,
          providerName: admin.providerName ?? 'Provider',
          stats: data.stats,
          upcoming: money(data.upcoming),
          toComplete: money(data.toComplete),
          needsDriver: money(data.needsDriver),
        },
        { bodyClass: 'cms-body' }
      )
    }
    const showPlaces = can(authorization, 'places.view')
    const showContacts = can(authorization, 'contact_requests.view')
    const showTypes = showPlaces && can(authorization, 'category_types.view')
    const showAudit = can(authorization, 'audit_logs.view')
    const showCustomers = can(authorization, 'customers.view')
    const showCategories = can(authorization, 'categories.view')
    const [
      totalPlacesRes,
      publishedPlacesRes,
      draftPlacesRes,
      archivedPlacesRes,
      featuredPlacesRes,
      geocodedPlacesRes,
      newContactsRes,
      totalContactsRes,
      resolvedContactsRes,
      totalCustomersRes,
      verifiedCustomersRes,
      activeCategoriesRes,
      topCategoriesRes,
      typeCounts,
      types,
      rawAuditLogs,
    ] = await Promise.all([
      showPlaces ? db.from('places').count('* as count').first() : null,
      showPlaces
        ? db.from('places').where('status', 'published').count('* as count').first()
        : null,
      showPlaces ? db.from('places').where('status', 'draft').count('* as count').first() : null,
      showPlaces
        ? db.from('places').whereIn('status', ['draft', 'archived']).count('* as count').first()
        : null,
      showPlaces
        ? db.from('places').whereNotNull('featured_order').count('* as count').first()
        : null,
      showPlaces
        ? db
            .from('places')
            .whereNotNull('latitude')
            .whereNotNull('longitude')
            .count('* as count')
            .first()
        : null,
      showContacts
        ? db.from('contact_requests').where('status', 'new').count('* as count').first()
        : null,
      showContacts ? db.from('contact_requests').count('* as count').first() : null,
      showContacts
        ? db.from('contact_requests').where('status', 'resolved').count('* as count').first()
        : null,
      showCustomers ? db.from('customers').count('* as count').first() : null,
      showCustomers
        ? db.from('customers').whereNotNull('phone_verified_at').count('* as count').first()
        : null,
      showCategories
        ? db.from('categories').where('active', true).count('* as count').first()
        : null,
      showPlaces
        ? db
            .from('places as p')
            .join('categories as c', 'c.id', 'p.category_id')
            .leftJoin('category_translations as ct', function () {
              this.on('ct.category_id', '=', 'c.id').andOnVal('ct.locale', '=', 'en')
            })
            .select(
              'c.slug',
              db.raw('COALESCE(ct.name, c.slug) as name'),
              db.raw('count(p.id) as count')
            )
            .groupBy('c.id', 'c.slug', 'ct.name')
            .orderBy('count', 'desc')
            .limit(5)
        : [],
      showTypes ? db.from('places').select('type').count('* as count').groupBy('type') : [],
      showTypes ? categoryTypes() : [],
      showAudit
        ? db
            .from('audit_logs')
            .select('id', 'action', 'entity_type', 'entity_id', 'created_at')
            .orderBy('id', 'desc')
            .limit(30)
        : [],
    ])

    const permissionForEntity: Record<string, string> = {
      place: 'places.view',
      category: 'categories.view',
      category_type: 'category_types.view',
      movie: 'movies.view',
      showtime: 'showtimes.view',
      theater_showtime: 'showtimes.view',
      page: 'pages.view',
      contact: 'contact_requests.view',
      staff: 'staff.view',
      user: 'staff.view',
      contact_request: 'contact_requests.view',
      role: 'roles.view',
      permission: 'roles.view',
      permission_catalog: 'roles.view',
      rbac: 'roles.view',
      home_content: 'home.view',
      home_explore_card: 'home.view',
      site_settings: 'settings.view',
      transport_location: 'transport.view',
    }
    const editPermissionForEntity: Record<string, string> = {
      place: 'places.update',
      category: 'categories.update',
      category_type: 'category_types.update',
      movie: 'movies.update',
      showtime: 'showtimes.update',
      theater_showtime: 'showtimes.update',
      page: 'pages.update',
      contact: 'contact_requests.view',
      contact_request: 'contact_requests.view',
    }
    const visibleAuditLogs = rawAuditLogs
      .filter((log) => {
        const entityPermission = permissionForEntity[String(log.entity_type)]
        return showAudit && Boolean(entityPermission) && can(authorization, entityPermission)
      })
      .slice(0, 10)

    const totalPlaces = Number(totalPlacesRes?.count ?? 0)
    const publishedCount = Number(publishedPlacesRes?.count ?? 0)
    const draftCount = Number(draftPlacesRes?.count ?? 0)
    // The CMS only has Active/Inactive; never-activated drafts count as Inactive.
    const archivedCount = Number(archivedPlacesRes?.count ?? 0)
    const featuredCount = Number(featuredPlacesRes?.count ?? 0)
    const geocodedCount = Number(geocodedPlacesRes?.count ?? 0)

    const newContactsCount = Number(newContactsRes?.count ?? 0)
    const totalContacts = Number(totalContactsRes?.count ?? 0)
    const resolvedContacts = Number(resolvedContactsRes?.count ?? 0)

    const totalCustomers = Number(totalCustomersRes?.count ?? 0)
    const verifiedCustomers = Number(verifiedCustomersRes?.count ?? 0)

    const activeCategories = Number(activeCategoriesRes?.count ?? 0)

    const topCategories = Array.isArray(topCategoriesRes)
      ? (
          topCategoriesRes as Array<{
            name: unknown
            slug: unknown
            count: unknown
          }>
        ).map((c) => ({
          name: String(c.name),
          slug: String(c.slug),
          count: Number(c.count),
        }))
      : []

    const publishedRate = totalPlaces > 0 ? Math.round((publishedCount / totalPlaces) * 100) : 0
    const draftRate = 0
    const archivedRate = totalPlaces > 0 ? Math.round((archivedCount / totalPlaces) * 100) : 0
    const geocodedRate = totalPlaces > 0 ? Math.round((geocodedCount / totalPlaces) * 100) : 0
    const contactsResolutionRate =
      totalContacts > 0 ? Math.round((resolvedContacts / totalContacts) * 100) : 0

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

    for (const log of visibleAuditLogs) {
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

    const recent = visibleAuditLogs.map((log) => {
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

    return inertia.render(
      'dashboard/overview',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        recent: recent.map((event) => ({
          id: event.id,
          actionLabel: event.actionLabel,
          entityName: event.entityName,
          editUrl:
            event.editUrl &&
            can(authorization, editPermissionForEntity[String(event.entity_type)] ?? '')
              ? event.editUrl
              : null,
          isDeleted: event.isDeleted,
          created_at: event.created_at,
        })),
        totalPlaces,
        publishedCount,
        draftCount,
        archivedCount,
        newContactsCount,
        typeBreakdown,
        analytics: {
          featuredCount,
          geocodedCount,
          geocodedRate,
          publishedRate,
          draftRate,
          archivedRate,
          totalContacts,
          resolvedContacts,
          contactsResolutionRate,
          totalCustomers,
          verifiedCustomers,
          activeCategories,
          topCategories,
        },
        visibility: {
          places: showPlaces,
          contacts: showContacts,
          types: showTypes,
          audit: showAudit,
          customers: showCustomers,
          categories: showCategories,
        },
        permissions: [...authorization.permissions],
      },
      { bodyClass: 'cms-body' }
    )
  }
}
