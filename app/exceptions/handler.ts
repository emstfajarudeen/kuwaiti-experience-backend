import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'
import { randomUUID } from 'node:crypto'
import { ApiError } from '../services/api_error.js'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = app.inProduction

  /**
   * Status pages is a collection of error code range and a callback
   * to return the HTML contents to send as a response.
   */
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': (error, { view }) => {
      return view.render('pages/errors/not_found', { error })
    },
    '500..599': (error, { view }) => {
      return view.render('pages/errors/server_error', { error })
    },
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    if (ctx.request.url().startsWith('/api/')) {
      const requestId = randomUUID()
      if (error instanceof ApiError) {
        return ctx.response.status(error.status).send({
          error: { code: error.code, message: error.message, fields: error.fields, requestId },
        })
      }
      const candidate = error as { status?: number; messages?: unknown; code?: string }
      if (candidate?.code === 'ER_DUP_ENTRY') {
        return ctx.response.status(409).send({
          error: {
            code: 'CONFLICT',
            message: 'A record with this value already exists',
            requestId,
          },
        })
      }
      if (candidate?.code === 'ER_ROW_IS_REFERENCED_2') {
        return ctx.response.status(409).send({
          error: {
            code: 'IN_USE',
            message: 'Remove dependent content before deleting this record',
            requestId,
          },
        })
      }
      if ([400, 403, 413, 415, 429].includes(candidate?.status ?? 0)) {
        const status = candidate.status!
        const codes: Record<number, string> = {
          400: 'BAD_REQUEST',
          403: 'FORBIDDEN',
          413: 'PAYLOAD_TOO_LARGE',
          415: 'UNSUPPORTED_MEDIA_TYPE',
          429: 'RATE_LIMITED',
        }
        const messages: Record<number, string> = {
          400: 'Invalid request',
          403: 'Action not allowed',
          413: 'Upload is too large',
          415: 'Unsupported media type',
          429: 'Too many requests. Try again later',
        }
        return ctx.response.status(status).send({
          error: {
            code: codes[status],
            message: messages[status],
            requestId,
          },
        })
      }
      if (candidate?.status === 422) {
        return ctx.response.status(422).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Please correct the submitted fields',
            fields: candidate.messages,
            requestId,
          },
        })
      }
      if (candidate?.status === 404) {
        return ctx.response.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Resource not found', requestId },
        })
      }
      ctx.logger.error({ err: error, requestId }, 'Unhandled API error')
      return ctx.response.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId },
      })
    }
    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
