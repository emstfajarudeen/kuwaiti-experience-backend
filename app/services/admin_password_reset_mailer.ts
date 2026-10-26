import nodemailer from 'nodemailer'
import env from '#start/env'

type ResetEmail = {
  recipient: string
  resetUrl: string
}

function mailConfiguration() {
  const host = env.get('SMTP_HOST')
  const from = env.get('ADMIN_PASSWORD_RESET_FROM')
  const username = env.get('SMTP_USERNAME')
  const password = env.get('SMTP_PASSWORD')?.release()

  if (!host || !from || Boolean(username) !== Boolean(password)) {
    throw new Error('Password-reset email delivery is not configured')
  }

  return {
    host,
    from,
    port: env.get('SMTP_PORT') ?? 587,
    secure: env.get('SMTP_SECURE') ?? false,
    auth: username && password ? { user: username, pass: password } : undefined,
  }
}

export async function sendAdminPasswordResetEmail({ recipient, resetUrl }: ResetEmail) {
  const configuration = mailConfiguration()
  const transporter = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    auth: configuration.auth,
  })

  await transporter.sendMail({
    from: configuration.from,
    to: recipient,
    subject: 'Reset your Content Studio password',
    text:
      'We received a request to reset your Content Studio password. Use this link within 20 minutes: ' +
      resetUrl +
      '\n\nIf you did not request this, you can ignore this email.',
    html:
      '<p>We received a request to reset your Content Studio password.</p>' +
      '<p><a href="' +
      resetUrl +
      '">Reset your password</a></p>' +
      '<p>This link expires in 20 minutes and can be used once.</p>' +
      '<p>If you did not request this, you can ignore this email.</p>',
  })
}
