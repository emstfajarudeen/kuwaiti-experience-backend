import type { HttpContext } from '@adonisjs/core/http'
import { ApiError } from '../../services/api_error.js'
import {
  createRole,
  deleteRole,
  getRole,
  listRoles,
  permissionOptions,
  updateRole,
} from '../../services/role_management_service.js'
import { roleValidator } from '../../validators/admin_roles.js'

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to save role.'
}

export default class AdminRolesController {
  async index({ inertia, request, session, admin, authorization }: HttpContext) {
    const roles = await listRoles()
    return inertia.render(
      'roles/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        roles,
        canManage: authorization.isFullAccessAdmin,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async show({ params, inertia, request, session, admin }: HttpContext) {
    const role = await getRole(params.id)
    return inertia.render(
      'roles/show',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        role,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async create({ inertia, request, session, admin }: HttpContext) {
    return inertia.render(
      'roles/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        role: null,
        permissions: await permissionOptions(),
        form: session.flashMessages.get('roleForm') ?? null,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async edit({ params, inertia, request, session, admin }: HttpContext) {
    const role = await getRole(params.id)
    return inertia.render(
      'roles/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        role,
        permissions: await permissionOptions(),
        form: session.flashMessages.get('roleForm') ?? null,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async store({ request, response, session, admin }: HttpContext) {
    try {
      const input = await request.validateUsing(roleValidator)
      const roleId = await createRole(admin, input)
      session.flash('success', 'Role created.')
      return response.redirect('/admin/roles/' + roleId + '/edit')
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) throw error
      session.flash('roleForm', {
        name: request.input('name'),
        description: request.input('description'),
        permissionKeys: request.input('permissionKeys'),
      })
      session.flash('error', errorText(error))
      return response.redirect('/admin/roles/new')
    }
  }

  async update({ params, request, response, session, admin }: HttpContext) {
    try {
      const input = await request.validateUsing(roleValidator)
      const roleId = await updateRole(admin, params.id, input)
      session.flash('success', 'Role updated.')
      return response.redirect('/admin/roles/' + roleId + '/edit')
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) throw error
      session.flash('roleForm', {
        name: request.input('name'),
        description: request.input('description'),
        permissionKeys: request.input('permissionKeys'),
      })
      session.flash('error', errorText(error))
      return response.redirect('/admin/roles/' + params.id + '/edit')
    }
  }

  async destroy({ params, response, session, admin }: HttpContext) {
    try {
      await deleteRole(admin, params.id)
      session.flash('success', 'Role deleted.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) throw error
      session.flash('error', errorText(error))
    }
    return response.redirect('/admin/roles')
  }
}
