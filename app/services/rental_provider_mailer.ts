import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { parseSnapshot } from '../serializers/rental.js'
import { kwd, toFils } from './rental_money.js'

type Row = Record<string, any>

export type OutgoingEmail = {
  to: string
  subject: string
  html: string
  text: string
}

export interface RentalMailer {
  configured(): boolean
  send(email: OutgoingEmail): Promise<{ id: string | null }>
}

/** Sends through the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
class ResendMailer implements RentalMailer {
  configured() {
    return Boolean(env.get('RESEND_API_KEY')?.release() && env.get('RENTAL_EMAIL_FROM'))
  }

  async send(email: OutgoingEmail) {
    const key = env.get('RESEND_API_KEY')?.release()
    const from = env.get('RENTAL_EMAIL_FROM')
    if (!key || !from) throw new Error('Email delivery is not configured')
    const replyTo = env.get('RENTAL_EMAIL_REPLY_TO')
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string }
    if (!response.ok)
      throw new Error(`Resend responded ${response.status}: ${body.message ?? 'unknown error'}`)
    return { id: body.id ?? null }
  }
}

let mailer: RentalMailer = new ResendMailer()

/** Replaces the mailer (tests only). Returns a function that restores the previous one. */
export function swapRentalMailer(replacement: RentalMailer) {
  const previous = mailer
  mailer = replacement
  return () => {
    mailer = previous
  }
}

export type ProviderEmailKind = 'confirmed' | 'cancelled'

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const kuwaitTime = (value: unknown) =>
  new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kuwait',
  }).format(new Date(value as string))

const mapLink = (latitude: number, longitude: number) =>
  `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`

function compose(kind: ProviderEmailKind, booking: Row, customer: Row | undefined) {
  const snapshot = parseSnapshot(booking.snapshot)
  const customerName =
    [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Customer'
  const rows: Array<[string, string]> = [
    ['Reference', booking.reference],
    ['Vehicle', `${snapshot.vehicle.name_en} (${snapshot.vehicle.make} ${snapshot.vehicle.model})`],
    ['Customer', customerName],
    ['Customer phone', customer?.phone_e164 ?? '—'],
    ...(snapshot.pickup_address
      ? ([
          [
            'Pick up the customer at',
            `${kuwaitTime(booking.pickup_at)} — ${snapshot.pickup_address.address}${snapshot.pickup_address.area ? ` (${snapshot.pickup_address.area.name_en})` : ''}`,
          ],
          ['Map', mapLink(snapshot.pickup_address.latitude, snapshot.pickup_address.longitude)],
          ['Driver leaves from', snapshot.pickup_location.name_en],
        ] as Array<[string, string]>)
      : ([
          ['Pickup', `${kuwaitTime(booking.pickup_at)} — ${snapshot.pickup_location.name_en}`],
        ] as Array<[string, string]>)),
    ['Return', `${kuwaitTime(booking.return_at)} — ${snapshot.return_location.name_en}`],
    ['With driver', booking.with_driver ? 'Yes' : 'No'],
    ['Days', String(booking.days)],
    ['Rental amount (collect at pickup)', `KWD ${kwd(toFils(booking.rental_amount))}`],
    ...(snapshot.vehicle.mileage_limit_km
      ? ([
          [
            'Mileage',
            `${snapshot.vehicle.mileage_limit_km} km/day${snapshot.vehicle.extra_km_rate ? `, extra km KWD ${snapshot.vehicle.extra_km_rate}` : ''}`,
          ],
        ] as Array<[string, string]>)
      : []),
    ...((snapshot.vehicle.rental_terms ?? []).length
      ? ([
          [
            'Rental terms',
            (snapshot.vehicle.rental_terms ?? []).map((term) => term.label_en).join(' · '),
          ],
        ] as Array<[string, string]>)
      : []),
    ...(booking.notes
      ? ([['Customer notes', String(booking.notes)]] as Array<[string, string]>)
      : []),
    ...(kind === 'cancelled' && booking.cancel_reason
      ? ([['Cancellation reason', String(booking.cancel_reason)]] as Array<[string, string]>)
      : []),
  ]
  const subject =
    kind === 'confirmed'
      ? `New rental booking ${booking.reference}`
      : `Rental booking cancelled ${booking.reference}`
  const intro =
    kind === 'confirmed'
      ? `A customer booked your vehicle through Kuwaiti Experience. The booking fee is paid in the app; please collect the rental amount at pickup and check the customer's driving licence and ID.`
      : `This booking was cancelled. Please release the vehicle for these dates.`
  const html =
    `<p>Hello ${escapeHtml(snapshot.provider.name_en)},</p><p>${escapeHtml(intro)}</p>` +
    '<table cellpadding="6" style="border-collapse:collapse">' +
    rows
      .map(
        ([label, value]) =>
          `<tr><td style="color:#555">${escapeHtml(label)}</td><td><strong>${escapeHtml(value)}</strong></td></tr>`
      )
      .join('') +
    '</table><p>Kuwaiti Experience</p>'
  const text =
    `Hello ${snapshot.provider.name_en},\n\n${intro}\n\n` +
    rows.map(([label, value]) => `${label}: ${value}`).join('\n') +
    '\n\nKuwaiti Experience'
  return { subject, html, text }
}

/**
 * Emails the rental provider about a booking and records the attempt. Never throws: delivery
 * problems are logged and shown on the CMS booking page, where staff can send it again.
 */
export async function sendProviderEmail(
  bookingId: number,
  kind: ProviderEmailKind,
  actorId: number | null = null
) {
  const record = async (status: 'sent' | 'failed' | 'skipped', values: Row = {}) => {
    await db.table('rental_provider_emails').insert({
      booking_id: bookingId,
      kind,
      status,
      sent_by: actorId,
      created_at: new Date(),
      ...values,
    })
    return { status, ...values } as { status: 'sent' | 'failed' | 'skipped'; error?: string }
  }
  try {
    const booking = await db.from('rental_bookings').where('id', bookingId).first()
    if (!booking) return { status: 'skipped' as const, error: 'Booking not found' }
    const provider = await db.from('rental_providers').where('id', booking.provider_id).first()
    const recipient: string | null =
      provider?.email ?? parseSnapshot(booking.snapshot).provider.email ?? null
    if (!recipient) return await record('skipped', { error: 'The provider has no email address.' })
    if (!mailer.configured())
      return await record('skipped', {
        recipient,
        error: 'Email delivery is not configured (RESEND_API_KEY, RENTAL_EMAIL_FROM).',
      })
    const customer = await db
      .from('customers')
      .where('id', booking.customer_id)
      .select('first_name', 'last_name', 'phone_e164')
      .first()
    const content = compose(kind, booking, customer)
    try {
      const result = await mailer.send({ to: recipient, ...content })
      return await record('sent', { recipient, message_id: result.id })
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
      logger.warn({ err: error, bookingId, kind }, 'Rental provider email failed')
      return await record('failed', { recipient, error: message })
    }
  } catch (error) {
    logger.error({ err: error, bookingId, kind }, 'Rental provider email could not be recorded')
    return { status: 'failed' as const, error: 'Unexpected error' }
  }
}

/** Provider portal account emails: the first-time invite and a password reset. */
export async function sendProviderPortalEmail(
  kind: 'invite' | 'reset',
  { recipient, url, name }: { recipient: string; url: string; name?: string }
) {
  if (!mailer.configured())
    throw new Error('Email delivery is not configured (RESEND_API_KEY, RENTAL_EMAIL_FROM).')
  const greeting = name ? `Hello ${name},` : 'Hello,'
  const invite = kind === 'invite'
  const subject = invite
    ? 'Your Kuwaiti Experience provider portal login'
    : 'Reset your provider portal password'
  const intro = invite
    ? 'A login was created for you on the Kuwaiti Experience provider portal, where you manage your rental cars, branches, working hours and bookings.'
    : 'We received a request to reset your provider portal password.'
  const action = invite ? 'Set your password' : 'Reset your password'
  const expiry = invite
    ? 'This link expires in 72 hours and can be used once.'
    : 'This link expires in 20 minutes and can be used once. If you did not ask for this, ignore this email.'
  await mailer.send({
    to: recipient,
    subject,
    text: `${greeting}\n\n${intro}\n\n${action}: ${url}\n\n${expiry}`,
    html:
      `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(intro)}</p>` +
      `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#0f2a44;color:#fff;border-radius:6px;text-decoration:none">${action}</a></p>` +
      `<p style="color:#667">${escapeHtml(expiry)}</p>`,
  })
}
