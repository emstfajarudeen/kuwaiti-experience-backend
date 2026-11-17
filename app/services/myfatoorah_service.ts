import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { ApiError } from './api_error.js'

/** MyFatoorah v2 REST client: https://docs.myfatoorah.com/docs/api-reference */

/**
 * MyFatoorah turned a request down. `reason` is their own explanation (for example
 * "Insufficient balance for vendor"), meant for staff screens, not for customers.
 */
export class GatewayRejectedError extends ApiError {
  constructor(public reason: string | null) {
    super(502, 'PAYMENT_GATEWAY_ERROR', 'The payment service rejected the request')
  }
}

export type GatewayPaymentMethod = {
  PaymentMethodId: number
  PaymentMethodEn: string
  PaymentMethodAr: string
  PaymentMethodCode: string
  IsDirectPayment: boolean
  ServiceCharge: number
  TotalAmount: number
  CurrencyIso: string
  ImageUrl: string | null
}

export type GatewayTransaction = {
  PaymentId: string
  TransactionStatus: string
  PaymentGateway?: string | null
  TransationValue?: string | number | null
  PaidCurrency?: string | null
  Error?: string | null
  ErrorCode?: string | null
}

export type GatewayInvoiceStatus = {
  InvoiceId: number
  InvoiceStatus: 'Pending' | 'Paid' | 'Canceled' | string
  InvoiceValue: number
  CustomerReference: string | null
  UserDefinedField: string | null
  InvoiceTransactions: GatewayTransaction[]
}

export type ExecutePaymentInput = {
  paymentMethodId: number
  amount: number
  callbackUrl: string
  errorUrl: string
  customerName: string
  customerMobile: string | null
  customerEmail: string | null
  language: 'en' | 'ar'
  customerReference: string
  userDefinedField: string
}

export interface PaymentGateway {
  initiatePayment(amount: number): Promise<GatewayPaymentMethod[]>
  executePayment(input: ExecutePaymentInput): Promise<{ InvoiceId: number; PaymentURL: string }>
  getPaymentStatus(key: string, keyType: 'InvoiceId' | 'PaymentId'): Promise<GatewayInvoiceStatus>
  makeRefund(
    paymentId: string,
    amount: number,
    comment: string
  ): Promise<{ RefundId: number; RefundReference: string | null }>
}

const DEFAULT_BASE_URL = 'https://apitest.myfatoorah.com'

class MyFatoorahGateway implements PaymentGateway {
  private config() {
    const apiKey = env.get('MYFATOORAH_API_KEY')?.release()
    if (!apiKey)
      throw new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Online payment is not available yet')
    return {
      apiKey,
      baseUrl: (env.get('MYFATOORAH_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    }
  }

  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const { apiKey, baseUrl } = this.config()
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (error) {
      logger.error({ err: error, path }, 'MyFatoorah request failed')
      throw new ApiError(502, 'PAYMENT_GATEWAY_UNAVAILABLE', 'The payment service is unavailable')
    }
    const payload = (await response.json().catch(() => null)) as {
      IsSuccess?: boolean
      Message?: string
      ValidationErrors?: Array<{ Name: string; Error: string }> | null
      Data?: T
    } | null
    if (!response.ok || !payload?.IsSuccess || !payload.Data) {
      logger.warn(
        {
          path,
          status: response.status,
          message: payload?.Message,
          validation: payload?.ValidationErrors,
        },
        'MyFatoorah rejected a request'
      )
      const details = (payload?.ValidationErrors ?? []).map((item) => item.Error).filter(Boolean)
      throw new GatewayRejectedError(
        (details.length ? details.join('; ') : payload?.Message)?.slice(0, 300) || null
      )
    }
    return payload.Data
  }

  async initiatePayment(amount: number) {
    const data = await this.call<{ PaymentMethods: GatewayPaymentMethod[] }>(
      '/v2/InitiatePayment',
      { InvoiceAmount: amount, CurrencyIso: 'KWD' }
    )
    return data.PaymentMethods ?? []
  }

  async executePayment(input: ExecutePaymentInput) {
    const mobile = input.customerMobile?.match(/^\+(965)(\d{8})$/)
    return this.call<{ InvoiceId: number; PaymentURL: string }>('/v2/ExecutePayment', {
      PaymentMethodId: input.paymentMethodId,
      InvoiceValue: input.amount,
      DisplayCurrencyIso: 'KWD',
      CallBackUrl: input.callbackUrl,
      ErrorUrl: input.errorUrl,
      CustomerName: input.customerName,
      ...(mobile ? { MobileCountryCode: `+${mobile[1]}`, CustomerMobile: mobile[2] } : {}),
      ...(input.customerEmail ? { CustomerEmail: input.customerEmail } : {}),
      Language: input.language,
      CustomerReference: input.customerReference,
      UserDefinedField: input.userDefinedField,
    })
  }

  async getPaymentStatus(key: string, keyType: 'InvoiceId' | 'PaymentId') {
    return this.call<GatewayInvoiceStatus>('/v2/getPaymentStatus', { Key: key, KeyType: keyType })
  }

  async makeRefund(paymentId: string, amount: number, comment: string) {
    return this.call<{ RefundId: number; RefundReference: string | null }>('/v2/MakeRefund', {
      Key: paymentId,
      KeyType: 'PaymentId',
      RefundChargeOnCustomer: false,
      ServiceChargeOnCustomer: false,
      Amount: amount,
      Comment: comment,
    })
  }
}

let gateway: PaymentGateway = new MyFatoorahGateway()

export function paymentGateway() {
  return gateway
}

/** Replaces the gateway (tests only). Returns a function that restores the previous one. */
export function swapPaymentGateway(replacement: PaymentGateway) {
  const previous = gateway
  gateway = replacement
  return () => {
    gateway = previous
  }
}
