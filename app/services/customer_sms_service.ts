import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { ApiError } from './api_error.js'

type Sender = (phone: string, code: string) => Promise<void>
let testSender: Sender | undefined

export function developmentOtpResponseEnabled() {
  return env.get('NODE_ENV') === 'development' && env.get('CUSTOMER_OTP_DEV_RESPONSE') === true
}

/** Test injection is deliberately unavailable outside NODE_ENV=test. */
export function setTestSmsSender(sender?: Sender) {
  if (!app.inTest) throw new Error('SMS test sender is only available in tests')
  testSender = sender
}

export function otpSecret(): string {
  const secret = env.get('CUSTOMER_OTP_SECRET')?.release()
  if (secret && secret.length >= 32) return secret
  if (app.inTest && testSender) return 'isolated-test-otp-secret-never-for-production'
  throw new ApiError(503, 'OTP_UNAVAILABLE', 'Phone verification is not configured')
}

export function assertSmsConfigured() {
  otpSecret()
  if (developmentOtpResponseEnabled()) return
  if (app.inTest && testSender) return
  if (!env.get('SMS_WEBHOOK_URL') || !env.get('SMS_WEBHOOK_TOKEN')) {
    throw new ApiError(503, 'OTP_UNAVAILABLE', 'Phone verification is not configured')
  }
}

export async function sendSms(phone: string, code: string) {
  assertSmsConfigured()
  if (developmentOtpResponseEnabled()) return
  if (app.inTest && testSender) {
    try {
      return await testSender(phone, code)
    } catch {
      throw new ApiError(
        503,
        'OTP_DELIVERY_FAILED',
        'Could not send verification code. Try again later'
      )
    }
  }
  const url = env.get('SMS_WEBHOOK_URL')!
  if (new URL(url).protocol !== 'https:') {
    throw new ApiError(503, 'OTP_UNAVAILABLE', 'Phone verification is not configured')
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.get('SMS_WEBHOOK_TOKEN')!.release()}`,
      },
      body: JSON.stringify({
        phone_e164: phone,
        message: `Your Kuwaiti Experience code is ${code}. It expires in 5 minutes.`,
      }),
    })
    if (!response.ok) throw new Error('SMS delivery rejected')
  } catch {
    // Provider responses may contain OTPs or credentials: never expose/log them.
    throw new ApiError(
      503,
      'OTP_DELIVERY_FAILED',
      'Could not send verification code. Try again later'
    )
  }
}
