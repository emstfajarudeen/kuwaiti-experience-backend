import { randomBytes } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'
import { ApiError } from './api_error.js'
import { inviteProviderUser } from './admin_password_reset_service.js'
import { parseSnapshot } from '../serializers/rental.js'

type Row = Record<string, any>

const ZONE = 'Asia/Kuwait'

function fieldError(field: string, message: string): never {
  throw new ApiError(422, 'VALIDATION_ERROR', message, { [field]: [message] })
}

async function audit(actorId: number, action: string, userId: number) {
  await db.table('audit_logs').insert({
    actor_id: actorId,
    action: `provider_login.${action}`,
    entity_type: 'user',
    entity_id: String(userId),
    created_at: new Date(),
  })
}

// ------------------------------------------------------------------ logins

export type ProviderLoginState = 'active' | 'invited' | 'invite_expired' | 'disabled'

/** The portal login of a provider (one per provider), or null when none was created. */
export async function providerLogin(providerId: number) {
  const user = (await db
    .from('users')
    .where('role', 'provider')
    .where('rental_provider_id', providerId)
    .select('id', 'full_name', 'email', 'active', 'password_set_at', 'last_login_at', 'created_at')
    .first()) as Row | undefined
  if (!user) return null
  const invite = (await db
    .from('admin_password_reset_tokens')
    .where('user_id', user.id)
    .where('purpose', 'invite')
    .orderBy('created_at', 'desc')
    .select('expires_at', 'consumed_at', 'created_at')
    .first()) as Row | undefined
  const state: ProviderLoginState = !user.active
    ? 'disabled'
    : user.password_set_at
      ? 'active'
      : invite && !invite.consumed_at && new Date(invite.expires_at) > new Date()
        ? 'invited'
        : 'invite_expired'
  return {
    id: Number(user.id),
    name: user.full_name as string,
    email: user.email as string,
    state,
    invitedAt: invite ? new Date(invite.created_at).toISOString() : null,
    inviteExpiresAt: invite ? new Date(invite.expires_at).toISOString() : null,
    lastLoginAt: user.last_login_at ? new Date(user.last_login_at).toISOString() : null,
  }
}

/** Login state per provider id, for the providers table. */
export async function providerLoginStates(): Promise<Map<number, ProviderLoginState>> {
  const rows = (await db
    .from('users as u')
    .where('u.role', 'provider')
    .whereNotNull('u.rental_provider_id')
    .select(
      'u.rental_provider_id',
      'u.active',
      'u.password_set_at',
      db.raw(
        "(select count(*) from admin_password_reset_tokens t where t.user_id = u.id and t.purpose = 'invite' and t.consumed_at is null and t.expires_at > ?) as open_invites",
        [new Date()]
      )
    )) as Row[]
  return new Map(
    rows.map((row) => [
      Number(row.rental_provider_id),
      !row.active
        ? 'disabled'
        : row.password_set_at
          ? 'active'
          : Number(row.open_invites) > 0
            ? 'invited'
            : 'invite_expired',
    ])
  )
}

/**
 * Creates the provider's portal login and emails an invite to set the password.
 * Returns the invite result; when the email fails it carries the link to pass on by hand.
 */
export async function createProviderLogin(
  providerId: number,
  input: { name: string; email: string },
  actorId: number
) {
  const email = input.email.trim().toLowerCase()
  const userId = await db.transaction(async (trx) => {
    const provider = await trx.from('rental_providers').where('id', providerId).forUpdate().first()
    if (!provider) throw new ApiError(404, 'NOT_FOUND', 'Provider not found')
    const existing = await trx
      .from('users')
      .where('role', 'provider')
      .where('rental_provider_id', providerId)
      .first()
    if (existing)
      throw new ApiError(409, 'LOGIN_EXISTS', 'This provider already has a portal login.')
    if (await trx.from('users').where('email', email).first())
      fieldError('email', 'This email is already used by another CMS login.')
    const now = new Date()
    const [id] = await trx.table('users').insert({
      full_name: input.name.trim(),
      email,
      // Unusable until the provider sets a password from the invite link.
      password: await hash.make(randomBytes(32).toString('base64url')),
      role: 'provider',
      rental_provider_id: providerId,
      active: true,
      must_change_password: false,
      created_at: now,
      updated_at: now,
    })
    return Number(id)
  })
  await audit(actorId, 'create', userId)
  return inviteProviderUser(userId, actorId)
}

async function loginUserId(providerId: number) {
  const user = await db
    .from('users')
    .where('role', 'provider')
    .where('rental_provider_id', providerId)
    .select('id')
    .first()
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'This provider has no portal login.')
  return Number(user.id)
}

export async function resendProviderInvite(providerId: number, actorId: number) {
  return inviteProviderUser(await loginUserId(providerId), actorId)
}

/** Turning a login off also signs it out everywhere. */
export async function setProviderLoginActive(providerId: number, active: boolean, actorId: number) {
  const userId = await loginUserId(providerId)
  await db.transaction(async (trx) => {
    await trx.from('users').where('id', userId).update({ active, updated_at: new Date() })
    if (!active)
      await trx
        .from('auth_sessions')
        .where('user_id', userId)
        .whereNull('revoked_at')
        .update({ revoked_at: new Date() })
  })
  await audit(actorId, active ? 'enable' : 'disable', userId)
}

export async function deleteProviderLogin(providerId: number, actorId: number) {
  const userId = await loginUserId(providerId)
  await db.from('users').where('id', userId).delete()
  await audit(actorId, 'delete', userId)
}

// --------------------------------------------------------------- dashboard

function bookingSummary(row: Row) {
  const snapshot = parseSnapshot(row.snapshot)
  return {
    id: Number(row.id),
    reference: row.reference as string,
    customer_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    customer_phone: row.phone_e164 as string,
    vehicle_name: snapshot.vehicle.name_en,
    branch_name: snapshot.pickup_location.name_en,
    with_driver: Boolean(row.with_driver),
    driver_name: (row.driver_name as string | null) ?? null,
    pickup_at: new Date(row.pickup_at).toISOString(),
    return_at: new Date(row.return_at).toISOString(),
    days: Number(row.days),
    rental_amount: String(row.rental_amount),
  }
}

/** Everything the provider portal home page shows, for one provider. */
export async function providerDashboard(providerId: number) {
  const now = new Date()
  const today = DateTime.now().setZone(ZONE).startOf('day')
  const startOfDay = today.toJSDate()
  const endOfDay = today.plus({ days: 1 }).toJSDate()
  const inAWeek = today.plus({ days: 8 }).toJSDate()
  const startOfMonth = today.startOf('month').toJSDate()
  const confirmed = () =>
    db
      .from('rental_bookings as b')
      .where('b.provider_id', providerId)
      .where('b.status', 'confirmed')
  const count = async (query: any) => {
    const row = await query.count('* as total').first()
    return Number(row?.total ?? 0)
  }
  const withCustomer = (query: any) =>
    query
      .join('customers as c', 'c.id', 'b.customer_id')
      .leftJoin('rental_drivers as dr', 'dr.id', 'b.driver_id')
      .select('b.*', 'c.first_name', 'c.last_name', 'c.phone_e164', 'dr.name as driver_name')

  const [
    pickupsToday,
    upcomingWeek,
    onRent,
    toComplete,
    completedThisMonth,
    vehicleCounts,
    branchCounts,
    upcoming,
    overdue,
    needsDriver,
    driverCount,
  ] = await Promise.all([
    count(confirmed().where('b.pickup_at', '>=', startOfDay).where('b.pickup_at', '<', endOfDay)),
    count(confirmed().where('b.pickup_at', '>=', now).where('b.pickup_at', '<', inAWeek)),
    count(confirmed().where('b.pickup_at', '<=', now).where('b.return_at', '>', now)),
    count(confirmed().where('b.return_at', '<=', now)),
    count(
      db
        .from('rental_bookings as b')
        .where('b.provider_id', providerId)
        .where('b.status', 'completed')
        .where('b.completed_at', '>=', startOfMonth)
    ),
    db
      .from('rental_vehicles')
      .where('provider_id', providerId)
      .select(
        db.raw('count(*) as total'),
        db.raw("sum(case when status = 'published' then 1 else 0 end) as live")
      )
      .first(),
    db
      .from('rental_locations')
      .where('provider_id', providerId)
      .select(
        db.raw('count(*) as total'),
        db.raw('sum(case when active then 1 else 0 end) as active')
      )
      .first(),
    withCustomer(confirmed().where('b.pickup_at', '>=', startOfDay))
      .orderBy('b.pickup_at')
      .limit(8) as Promise<Row[]>,
    withCustomer(confirmed().where('b.return_at', '<=', now))
      .orderBy('b.return_at')
      .limit(8) as Promise<Row[]>,
    withCustomer(
      confirmed()
        .where('b.with_driver', true)
        .whereNull('b.driver_id')
        .where('b.return_at', '>', now)
    )
      .orderBy('b.pickup_at')
      .limit(8) as Promise<Row[]>,
    count(db.from('rental_drivers').where('provider_id', providerId).where('active', true)),
  ])
  return {
    stats: {
      pickupsToday,
      upcomingWeek,
      onRent,
      toComplete,
      completedThisMonth,
      vehicles: Number(vehicleCounts?.total ?? 0),
      liveVehicles: Number(vehicleCounts?.live ?? 0),
      branches: Number(branchCounts?.total ?? 0),
      activeBranches: Number(branchCounts?.active ?? 0),
      activeDrivers: driverCount,
    },
    upcoming: upcoming.map(bookingSummary),
    toComplete: overdue.map(bookingSummary),
    needsDriver: needsDriver.map(bookingSummary),
  }
}
