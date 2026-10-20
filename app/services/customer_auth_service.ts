import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { customer, iso } from '../serializers/customer.js'
import { ApiError } from './api_error.js'
import { assertSmsConfigured, otpSecret, sendSms } from './customer_sms_service.js'
import { canonicalPage } from './customer_content_service.js'
import { eraseProfilePhoto } from './customer_photo_service.js'

const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const opaque = (prefix: string) => `${prefix}_${randomBytes(48).toString('base64url')}`
const codeHash = (id: string, code: string) =>
  createHmac('sha256', otpSecret()).update(`${id}:${code}`).digest('hex')
const future = (seconds: number) => new Date(Date.now() + seconds * 1000)
const expired = (value: string | Date) => new Date(value).getTime() <= Date.now()
const ACCESS_SECONDS = 900
const SESSION_SECONDS = 7 * 86400

export async function requestOtp(
  phone?: string,
  challengeId?: string,
  identity?: CustomerIdentity
) {
  assertSmsConfigured()
  if (identity && Date.now() - new Date(identity.authenticated_at).getTime() > 600000) {
    throw new ApiError(
      403,
      'REAUTHENTICATION_REQUIRED',
      'Verify your current phone again before changing it'
    )
  }
  let code = String(randomInt(0, 10000)).padStart(4, '0')
  const outcome = await db.transaction(async (trx) => {
    if (phone) {
      await trx
        .table('customer_otp_challenges')
        .insert({
          id: randomUUID(),
          phone_e164: phone,
          attempt_count: 0,
          send_count: 0,
          send_window_at: new Date(),
          expires_at: new Date(),
          // MySQL TIMESTAMP(0) may round current milliseconds into the next second.
          resend_available_at: new Date(Date.now() - 2000),
          created_at: new Date(),
        })
        .onConflict('phone_e164')
        .ignore()
    }
    const row = await trx
      .from('customer_otp_challenges')
      .where(phone ? 'phone_e164' : 'id', phone ?? challengeId!)
      .forUpdate()
      .first()
    if (!row) throw new ApiError(422, 'INVALID_CHALLENGE', 'Request a new verification code')
    if (
      !phone &&
      (row.purpose !== (identity ? 'phone_change' : 'sign_in') ||
        (identity &&
          (row.customer_id !== identity.customer.id || row.session_id !== identity.session_id)))
    ) {
      throw new ApiError(422, 'INVALID_CHALLENGE', 'Request a new verification code')
    }
    if (identity) {
      if (row.phone_e164 === identity.customer.phone_e164)
        throw new ApiError(422, 'PHONE_UNCHANGED', 'Enter a different phone number')
      const taken = await trx.from('customers').where('phone_e164', row.phone_e164).first()
      if (taken) throw new ApiError(409, 'PHONE_IN_USE', 'This phone number is already registered')
    }
    const inWindow = Date.now() - new Date(row.send_window_at).getTime() < 3600000
    if (!expired(row.resend_available_at) || (inWindow && row.send_count >= 5)) {
      throw new ApiError(
        429,
        'OTP_RATE_LIMITED',
        'Wait before requesting another verification code'
      )
    }
    while (row.code_hash === codeHash(row.id, code))
      code = String(randomInt(0, 10000)).padStart(4, '0')
    const fields = {
      code_hash: codeHash(row.id, code),
      attempt_count: 0,
      send_count: inWindow ? Number(row.send_count) + 1 : 1,
      send_window_at: inWindow ? row.send_window_at : new Date(),
      expires_at: future(300),
      resend_available_at: future(60),
      verified_at: null,
      consumed_at: null,
      verification_token_hash: null,
      verification_expires_at: null,
      purpose: identity ? 'phone_change' : 'sign_in',
      customer_id: identity?.customer.id ?? null,
      session_id: identity?.session_id ?? null,
    }
    await trx.from('customer_otp_challenges').where('id', row.id).update(fields)
    return { ...row, ...fields }
  })
  try {
    await sendSms(outcome.phone_e164, code)
  } catch (error) {
    await db
      .from('customer_otp_challenges')
      .where('id', outcome.id)
      .where('code_hash', outcome.code_hash)
      .update({ code_hash: null, expires_at: new Date() })
    throw error
  }
  return {
    data: {
      id: outcome.id,
      expires_at: iso(outcome.expires_at),
      resend_available_at: iso(outcome.resend_available_at),
    },
  }
}

export async function verifyOtp(id: string, code: string, identity?: CustomerIdentity) {
  const result = await db.transaction(async (trx) => {
    const row = await trx.from('customer_otp_challenges').where('id', id).forUpdate().first()
    if (
      !row ||
      row.purpose !== (identity ? 'phone_change' : 'sign_in') ||
      (identity &&
        (row.customer_id !== identity.customer.id || row.session_id !== identity.session_id)) ||
      !row.code_hash ||
      expired(row.expires_at) ||
      row.verified_at ||
      row.attempt_count >= 5
    )
      return null
    const matches = timingSafeEqual(
      Buffer.from(row.code_hash, 'hex'),
      Buffer.from(codeHash(id, code), 'hex')
    )
    await trx
      .from('customer_otp_challenges')
      .where('id', id)
      .update({ attempt_count: Number(row.attempt_count) + 1 })
    if (!matches) return null // Commit failed attempt before returning an error.
    const verificationToken = opaque('cv')
    await trx
      .from('customer_otp_challenges')
      .where('id', id)
      .update({
        code_hash: null,
        verified_at: new Date(),
        verification_token_hash: digest(verificationToken),
        verification_expires_at: future(600),
      })
    const existing = await trx.from('customers').where('phone_e164', row.phone_e164).first()
    return {
      next_action: identity ? 'update_phone' : existing ? 'sign_in' : 'create_account',
      verification_token: verificationToken,
      expires_in: 600,
    }
  })
  if (!result) throw new ApiError(422, 'INVALID_OTP', 'Code is invalid, expired or already used')
  return { data: result }
}

async function issueSession(
  trx: TransactionClientContract,
  customerId: number,
  authenticatedAt: Date
) {
  const id = randomUUID()
  const accessToken = opaque('ca')
  const refreshToken = opaque('cr')
  const expiresAt = future(SESSION_SECONDS)
  await trx.table('customer_sessions').insert({
    id,
    customer_id: customerId,
    access_token_hash: digest(accessToken),
    access_expires_at: future(ACCESS_SECONDS),
    authenticated_at: authenticatedAt,
    expires_at: expiresAt,
    created_at: new Date(),
  })
  await trx.table('customer_refresh_tokens').insert({
    id: randomUUID(),
    session_id: id,
    token_hash: digest(refreshToken),
    expires_at: expiresAt,
    created_at: new Date(),
  })
  const row = await trx.from('customers').where('id', customerId).firstOrFail()
  return {
    data: {
      customer: customer(row),
      credentials: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: ACCESS_SECONDS,
      },
    },
  }
}

type Registration = {
  first_name: string
  last_name: string
  email?: string | null
  legal_acceptances: { slug: string; locale: 'en' | 'ar'; content_hash: string }[]
}

export async function exchangeVerification(token: string, registration?: Registration) {
  return db.transaction(async (trx) => {
    const challenge = await trx
      .from('customer_otp_challenges')
      .where('verification_token_hash', digest(token))
      .forUpdate()
      .first()
    if (
      !challenge ||
      challenge.purpose !== 'sign_in' ||
      !challenge.verified_at ||
      challenge.consumed_at ||
      !challenge.verification_expires_at ||
      expired(challenge.verification_expires_at)
    ) {
      throw new ApiError(401, 'INVALID_VERIFICATION', 'Verify your phone again')
    }
    let row = await trx.from('customers').where('phone_e164', challenge.phone_e164).first()
    if (registration && row)
      throw new ApiError(409, 'CUSTOMER_EXISTS', 'Sign in using the verified phone')
    if (!registration && !row)
      throw new ApiError(409, 'REGISTRATION_REQUIRED', 'Create an account using the verified phone')
    if (registration) {
      if (new Set(registration.legal_acceptances.map((a) => a.slug)).size !== 2) {
        throw new ApiError(
          422,
          'LEGAL_ACCEPTANCE_REQUIRED',
          'Accept the current Privacy Policy and Terms'
        )
      }
      const snapshots = []
      for (const acceptance of registration.legal_acceptances) {
        const page = await canonicalPage(acceptance.slug, acceptance.locale, trx)
        if (page.meta.content_hash !== acceptance.content_hash) {
          throw new ApiError(
            409,
            'LEGAL_CONTENT_CHANGED',
            'Read and accept the latest legal documents'
          )
        }
        const translation = page.data.page_translations.find((t) => t.locale === page.meta.locale)!
        snapshots.push({
          slug: acceptance.slug,
          locale: page.meta.locale,
          content_hash: page.meta.content_hash,
          title: translation.title,
          body: translation.body,
          accepted_at: new Date(),
        })
      }
      const [id] = await trx.table('customers').insert({
        phone_e164: challenge.phone_e164,
        first_name: registration.first_name,
        last_name: registration.last_name,
        email: registration.email?.toLowerCase() ?? null,
        phone_verified_at: challenge.verified_at,
        created_at: new Date(),
      })
      await trx
        .table('customer_legal_acceptances')
        .insert(snapshots.map((snapshot) => ({ ...snapshot, customer_id: id })))
      row = { id }
    }
    await trx
      .from('customer_otp_challenges')
      .where('id', challenge.id)
      .update({ consumed_at: new Date(), verification_token_hash: null })
    return issueSession(trx, Number(row!.id), new Date(challenge.verified_at))
  })
}

export async function authenticateCustomer(token: string) {
  if (!/^ca_[A-Za-z0-9_-]{64}$/.test(token))
    throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
  const row = await db
    .from('customer_sessions as s')
    .join('customers as c', 'c.id', 's.customer_id')
    .where('s.access_token_hash', digest(token))
    .whereNull('s.revoked_at')
    .where('s.access_expires_at', '>', new Date())
    .where('s.expires_at', '>', new Date())
    .select('c.*', 's.id as session_id', 's.authenticated_at')
    .first()
  if (!row) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
  return {
    customer: customer(row),
    session_id: String(row.session_id),
    authenticated_at: iso(row.authenticated_at)!,
  }
}

export type CustomerIdentity = Awaited<ReturnType<typeof authenticateCustomer>>

export async function refreshCustomer(token: string) {
  const outcome = await db.transaction(async (trx) => {
    const old = await trx
      .from('customer_refresh_tokens as r')
      .join('customer_sessions as s', 's.id', 'r.session_id')
      .where('r.token_hash', digest(token))
      .select(
        'r.id',
        'r.consumed_at',
        's.id as session_id',
        's.customer_id',
        's.expires_at',
        's.revoked_at'
      )
      .forUpdate()
      .first()
    if (!old || old.revoked_at || expired(old.expires_at)) return null
    if (old.consumed_at) {
      await trx
        .from('customer_sessions')
        .where('id', old.session_id)
        .update({ revoked_at: new Date() })
      return null
    }
    const accessToken = opaque('ca')
    const refreshToken = opaque('cr')
    await trx
      .from('customer_refresh_tokens')
      .where('id', old.id)
      .update({ consumed_at: new Date() })
    await trx.table('customer_refresh_tokens').insert({
      id: randomUUID(),
      session_id: old.session_id,
      token_hash: digest(refreshToken),
      expires_at: old.expires_at,
      created_at: new Date(),
    })
    await trx
      .from('customer_sessions')
      .where('id', old.session_id)
      .update({
        access_token_hash: digest(accessToken),
        access_expires_at: future(ACCESS_SECONDS),
      })
    const row = await trx.from('customers').where('id', old.customer_id).firstOrFail()
    return {
      data: {
        customer: customer(row),
        credentials: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: ACCESS_SECONDS,
        },
      },
    }
  })
  if (!outcome) throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Session expired')
  return outcome
}

export async function logoutCustomer(identity: CustomerIdentity) {
  await db
    .from('customer_sessions')
    .where('id', identity.session_id)
    .update({ revoked_at: new Date() })
}

export async function deleteCustomer(identity: CustomerIdentity) {
  if (Date.now() - new Date(identity.authenticated_at).getTime() > 600000) {
    throw new ApiError(
      403,
      'REAUTHENTICATION_REQUIRED',
      'Verify your phone again before deleting your account'
    )
  }
  const photoId = await db.transaction(async (trx) => {
    const row = await trx.from('customers').where('id', identity.customer.id).forUpdate().first()
    if (!row) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
    await trx.from('contact_requests').where('customer_id', row.id).delete()
    await trx.from('customer_otp_challenges').where('phone_e164', row.phone_e164).delete()
    await trx.from('customers').where('id', row.id).delete()
    // FK cascades erase sessions, refresh digests and legal snapshots in the same transaction.
    return row.profile_photo_id as string | null
  })
  await eraseProfilePhoto(photoId)
}

type ProfileInput = {
  first_name?: string
  last_name?: string
  email?: string | null
  phone_e164?: string
  phone_verification_token?: string
}

export async function updateCustomerProfile(identity: CustomerIdentity, input: ProfileInput) {
  if (!Object.values(input).some((value) => value !== undefined)) {
    throw new ApiError(422, 'EMPTY_UPDATE', 'Provide at least one profile field')
  }
  return db.transaction(async (trx) => {
    const proof = input.phone_verification_token
      ? await trx
          .from('customer_otp_challenges')
          .where('verification_token_hash', digest(input.phone_verification_token))
          .forUpdate()
          .first()
      : null
    if (
      input.phone_verification_token &&
      (!proof ||
        proof.purpose !== 'phone_change' ||
        proof.customer_id !== identity.customer.id ||
        proof.session_id !== identity.session_id ||
        !proof.verified_at ||
        proof.consumed_at ||
        !proof.verification_expires_at ||
        expired(proof.verification_expires_at))
    ) {
      throw new ApiError(401, 'INVALID_VERIFICATION', 'Verify your new phone again')
    }
    const row = await trx.from('customers').where('id', identity.customer.id).forUpdate().first()
    if (!row) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
    const session = await trx
      .from('customer_sessions')
      .where('id', identity.session_id)
      .whereNull('revoked_at')
      .where('expires_at', '>', new Date())
      .first()
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer authentication required')
    const fields: Record<string, unknown> = { updated_at: new Date() }
    if (input.first_name !== undefined) fields.first_name = input.first_name
    if (input.last_name !== undefined) fields.last_name = input.last_name
    if (input.email !== undefined) fields.email = input.email?.toLowerCase() ?? null
    if (input.phone_e164 && input.phone_e164 !== row.phone_e164 && !proof) {
      throw new ApiError(
        422,
        'PHONE_VERIFICATION_REQUIRED',
        'Verify your new phone before saving it'
      )
    }
    if (proof) {
      if (!input.phone_e164 || input.phone_e164 !== proof.phone_e164) {
        throw new ApiError(422, 'PHONE_MISMATCH', 'Save the phone number you verified')
      }
      const taken = await trx
        .from('customers')
        .where('phone_e164', proof.phone_e164)
        .whereNot('id', row.id)
        .first()
      if (taken) throw new ApiError(409, 'PHONE_IN_USE', 'This phone number is already registered')
      fields.phone_e164 = proof.phone_e164
      fields.phone_verified_at = proof.verified_at
      await trx
        .from('customer_otp_challenges')
        .where('id', proof.id)
        .update({ consumed_at: new Date(), verification_token_hash: null })
      await trx
        .from('customer_sessions')
        .where('customer_id', row.id)
        .whereNot('id', identity.session_id)
        .update({ revoked_at: new Date() })
      await trx
        .from('customer_sessions')
        .where('id', identity.session_id)
        .update({ authenticated_at: proof.verified_at })
    }
    await trx.from('customers').where('id', row.id).update(fields)
    const updated = await trx.from('customers').where('id', row.id).firstOrFail()
    return { data: customer(updated) }
  })
}
