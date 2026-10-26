import type { HttpContext } from '@adonisjs/core/http'
import { ApiError } from '../../services/api_error.js'
import { requestAdminPasswordReset } from '../../services/admin_password_reset_service.js'
import {
  activeStaffById,
  availableStaffRoles,
  createStaff,
  deleteStaff,
  listStaff,
  staffById,
  updateStaff,
} from '../../services/staff_management_service.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'
import { createAdminUserValidator, updateAdminUserValidator } from '../../validators/admin_users.js'

const pageSize = 20

function selectedFilter(value: unknown, allowed: readonly string[]) {
  return typeof value === 'string' && allowed.includes(value) ? value : ''
}

function dateValue(value: unknown) {
  return value instanceof Date ? value.toISOString() : value ? String(value) : null
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to save staff member.'
}

function safeForm(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const form = value as Record<string, unknown>
  return {
    fullName: typeof form.fullName === 'string' ? form.fullName : null,
    email: typeof form.email === 'string' ? form.email : null,
    active: typeof form.active === 'string' ? form.active : null,
    roleIds: Array.isArray(form.roleIds) ? form.roleIds.map(String) : [],
  }
}

export default class AdminUsersController {
  async index({ request, inertia, session, admin }: HttpContext) {
    const query =
      typeof request.input('q') === 'string' ? request.input('q').trim().slice(0, 120) : ''
    const status = selectedFilter(request.input('status'), ['active', 'inactive'])
    const reset = selectedFilter(request.input('reset'), ['required', 'current'])
    const roleValue = Number(request.input('role'))
    const roleId = Number.isSafeInteger(roleValue) && roleValue > 0 ? roleValue : null
    const requestedPage = Number(request.input('page', 1))
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
    const [result, roles] = await Promise.all([
      listStaff({ query, status, reset, roleId, page, pageSize }),
      availableStaffRoles(),
    ])
    return inertia.render(
      'users/index',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        currentAdminId: admin.id,
        filters: { q: query, status: status || null, reset: reset || null, role: roleId },
        roles,
        rows: result.rows.map((user) => ({
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          active: user.active,
          must_change_password: user.must_change_password,
          roles: user.roles,
          created_at: dateValue(user.created_at),
          updated_at: dateValue(user.updated_at),
        })),
        meta: result.meta,
      },
      { bodyClass: 'cms-body' }
    )
  }

  async create({ request, inertia, session, admin }: HttpContext) {
    return inertia.render(
      'users/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        user: null,
        currentAdminId: admin.id,
        roles: await availableStaffRoles(),
        form: safeForm(session.flashMessages.get('userForm')),
      },
      { bodyClass: 'cms-body' }
    )
  }

  async edit({ params, request, response, inertia, session, admin }: HttpContext) {
    const user = await staffById(params.id)
    if (!user) return response.redirect('/admin/users')
    return inertia.render(
      'users/edit',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        currentAdminId: admin.id,
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          active: user.active,
          must_change_password: Boolean(user.must_change_password),
          roles: user.roles,
          created_at: dateValue(user.created_at),
        },
        roles: await availableStaffRoles(),
        form: safeForm(session.flashMessages.get('userForm')),
      },
      { bodyClass: 'cms-body' }
    )
  }

  async save({ params, request, response, session, admin }: HttpContext) {
    const id = params.id ? Number(params.id) : null
    const isNew = !id
    const redirectPath = isNew ? '/admin/users/new' : '/admin/users/' + id + '/edit'
    const form = {
      fullName: request.input('fullName'),
      email: request.input('email'),
      active: request.input('active') === 'on',
      roleIds: request.input('roleIds'),
    }
    try {
      if (isNew) {
        const input = await request.validateUsing(createAdminUserValidator)
        const userId = await createStaff(admin, { ...input, roleIds: input.roleIds })
        session.flash(
          'success',
          'Staff member created. They must set a new password before using the CMS.'
        )
        return response.redirect('/admin/users/' + userId + '/edit')
      }
      const input = await updateAdminUserValidator.validate(form)
      await updateStaff(admin, id, input)
      session.flash('success', 'Staff member updated.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) throw error
      const fieldErrors = validationErrorBag(error)
      if (fieldErrors) session.flash('inputErrorsBag', fieldErrors)
      session.flash('error', message(error))
      session.flash('userForm', { ...form, password: undefined })
      return response.redirect(redirectPath)
    }
    return response.redirect(redirectPath)
  }

  async sendReset({ params, response, session, admin }: HttpContext) {
    const user = await activeStaffById(params.id)
    if (!user) {
      session.flash('error', 'Active staff member not found.')
      return response.redirect('/admin/users')
    }
    await requestAdminPasswordReset(user.email, admin.id, admin.sessionId)
    session.flash('success', 'Password-reset email requested for ' + user.email + '.')
    return response.redirect('/admin/users/' + params.id + '/edit')
  }

  async destroy({ params, response, session, admin }: HttpContext) {
    try {
      await deleteStaff(admin, params.id)
      session.flash('success', 'Staff member deleted.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) throw error
      session.flash('error', message(error))
    }
    return response.redirect('/admin/users')
  }
}
