import type { HttpContext } from '@adonisjs/core/http'
import * as read from '../../services/explore_read_service.js'
import * as write from '../../services/explore_write_service.js'
import * as validators from '../../validators/explore.js'
import { validationErrorBag } from '../../services/validation_error_bag.js'

const numberOrNull = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v))

export default class ExplorePageController {
  async place({ params, inertia, request, admin, session }: HttpContext) {
    const result = await read.showPlace(read.positiveId(params.id), undefined, true)
    const flashed = session.flashMessages.get('exploreForm')
    const flashForm =
      flashed && typeof flashed === 'object' ? (flashed as Record<string, any>) : undefined

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
      },
      { bodyClass: 'cms-body' }
    )
  }
  async savePlace(ctx: HttpContext) {
    const id = read.positiveId(ctx.params.id)
    return this.form(ctx, `/admin/places/${id}/explore`, async () => {
      const r = ctx.request
      const input = await validators.placeExploreValidator.validate({
        phone_e164: r.input('phone_e164') || null,
        check_in_time: r.input('check_in_time') || null,
        check_out_time: r.input('check_out_time') || null,
        screen_count: numberOrNull(r.input('screen_count')),
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
