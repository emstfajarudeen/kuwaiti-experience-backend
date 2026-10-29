import type { HttpContext } from '@adonisjs/core/http'
import * as read from '../../services/explore_read_service.js'
import * as write from '../../services/explore_write_service.js'
import * as validators from '../../validators/explore.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'

const numberOrNull = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v))
const checkbox = (v: unknown) => v === 'on' || v === 'true' || v === true
const records = (v: unknown): Record<string, any>[] =>
  Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []

export default class ExplorePageController {
  async place({ params, inertia, request, admin, session }: HttpContext) {
    const result = await read.showPlace(read.positiveId(params.id), undefined, true)
    const rawHours = result.data.place_hours

    // Check if there is flashed form input from a failed validation submission
    const flashed = session.flashMessages.get('exploreForm')
    const flashForm =
      flashed && typeof flashed === 'object' ? (flashed as Record<string, any>) : undefined
    const hoursSource = flashForm?.place_hours ? records(flashForm.place_hours) : rawHours

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const days = dayNames.map((name, weekday) => {
      const dayHours = hoursSource
        .filter((h: any) => h.weekday !== '' && h.weekday !== null && Number(h.weekday) === weekday)
        .sort((a: any, b: any) => Number(a.interval_index || 0) - Number(b.interval_index || 0))

      let state: 'unknown' | 'closed' | 'open' = 'unknown'
      if (dayHours.length === 0) {
        state = 'unknown'
      } else if (
        dayHours.some((h: any) => h.closed === true || h.closed === 'on' || h.closed === 'true')
      ) {
        state = 'closed'
      } else {
        state = 'open'
      }

      return {
        weekday,
        name,
        state,
        intervals: dayHours.map((h: any, idx: number) => ({
          interval_index: Number(h.interval_index ?? idx),
          opens_at: h.opens_at ? String(h.opens_at).slice(0, 5) : '',
          closes_at: h.closes_at ? String(h.closes_at).slice(0, 5) : '',
          closes_next_day: Boolean(
            h.closes_next_day === true || h.closes_next_day === 'on' || h.closes_next_day === 'true'
          ),
        })),
      }
    })

    return inertia.render(
      'explore/place',
      {
        adminName: admin.fullName,
        csrfToken: request.csrfToken,
        success: (session.flashMessages.get('success') as string | undefined) ?? null,
        error: (session.flashMessages.get('error') as string | undefined) ?? null,
        form: flashForm
          ? {
              phone_e164: typeof flashForm.phone_e164 === 'string' ? flashForm.phone_e164 : null,
              check_in_time:
                typeof flashForm.check_in_time === 'string' ? flashForm.check_in_time : null,
              check_out_time:
                typeof flashForm.check_out_time === 'string' ? flashForm.check_out_time : null,
              screen_count:
                typeof flashForm.screen_count === 'string' ? flashForm.screen_count : null,
            }
          : null,
        place: {
          id: result.data.id,
          slug: result.data.slug,
          type: result.data.type,
          phone_e164: result.data.phone_e164,
          check_in_time: result.data.check_in_time,
          check_out_time: result.data.check_out_time,
          screen_count: result.data.screen_count,
        },
        days,
      },
      { bodyClass: 'cms-body' }
    )
  }
  async savePlace(ctx: HttpContext) {
    const id = read.positiveId(ctx.params.id)
    return this.form(ctx, `/admin/places/${id}/explore`, async () => {
      const r = ctx.request
      const hours = records(r.input('place_hours'))
        .filter((h) => h.weekday !== '' && h.weekday !== null && h.weekday !== undefined)
        .map((h) => ({
          weekday: Number(h.weekday),
          interval_index: Number(h.interval_index || 0),
          opens_at: h.opens_at || null,
          closes_at: h.closes_at || null,
          closed: checkbox(h.closed),
          closes_next_day: checkbox(h.closes_next_day),
        }))
      const input = await validators.placeExploreValidator.validate({
        phone_e164: r.input('phone_e164') || null,
        check_in_time: r.input('check_in_time') || null,
        check_out_time: r.input('check_out_time') || null,
        screen_count: numberOrNull(r.input('screen_count')),
        place_hours: hours,
      })
      await write.updatePlaceExplore(id, input, ctx.admin.id)
    })
  }

  private async form(
    ctx: HttpContext,
    failurePath: string,
    action: () => Promise<unknown>,
    successPath = failurePath
  ) {
    try {
      await action()
      ctx.session.flash('success', 'Changes saved.')
      return ctx.response.redirect(successPath)
    } catch (error) {
      const fieldErrors = validationErrorBag(error)
      if (fieldErrors) ctx.session.flash('inputErrorsBag', fieldErrors)
      ctx.session.flash('error', error instanceof Error ? error.message : 'Unable to save changes')
      ctx.session.flash('exploreForm', ctx.request.all())
      return ctx.response.redirect(failurePath)
    }
  }
}
