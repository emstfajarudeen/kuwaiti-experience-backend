import { useState } from 'react'
import { Button, Form, Input } from 'antd'
import type { FormDataConvertible } from '@inertiajs/core'
import AdminLayout from '../../layouts/admin_layout'
import { postCmsForm } from '../../lib/cms_form'

type Place = {
  id: number
  slug: string
  type: string
  phone_e164: string | null
  check_in_time: string | null
  check_out_time: string | null
  screen_count: number | null
}
type Props = {
  adminName: string
  csrfToken: string
  success: string | null
  error: string | null
  form: Record<string, string | null> | null
  place: Place
}

export default function ExplorePlace({ adminName, csrfToken, success, error, form, place }: Props) {
  const [formInstance] = Form.useForm()
  const [processing, setProcessing] = useState(false)
  return (
    <AdminLayout
      title="Explore details"
      active="places"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a
        className="back-link tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:600] tw:[margin-bottom:var(--space-3)] tw:[transition:color_0.15s_ease]"
        href={`/admin/places/${place.id}/edit`}
      >
        ← Back to place editor
      </a>
      <div className="page-head form-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>Explore details: {place.slug}</h1>
        <div className="form-page-actions">
          <a className="button secondary" href={`/admin/places/${place.id}/edit`}>
            Back to place
          </a>
          <Button
            className="button primary"
            htmlType="submit"
            form="explore-form"
            loading={processing}
          >
            Save Explore details
          </Button>
        </div>
      </div>
      <Form
        id="explore-form"
        component="form"
        form={formInstance}
        layout="vertical"
        onFinish={() => {
          const element = document.getElementById('explore-form') as HTMLFormElement | null
          if (!element) return
          const data = new FormData(element)
          const payload: Record<string, FormDataConvertible> = {}
          for (const [key, value] of data.entries()) {
            if (key === '_csrf') continue
            if (typeof value === 'string') payload[key] = value
          }
          postCmsForm({
            action: `/admin/places/${place.id}/explore`,
            csrfToken,
            form: formInstance,
            setProcessing,
            data: payload,
          })
        }}
        action={`/admin/places/${place.id}/explore`}
        method="POST"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
          <h2>Visitor information</h2>
          <div className="form-grid two tw:[margin-top:16px] tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
            <label>
              Venue phone
              <Input
                name="phone_e164"
                defaultValue={form?.phone_e164 ?? place.phone_e164 ?? ''}
                placeholder="+96590987788"
                maxLength={16}
              />
            </label>
            {place.type === 'hotel_resort' && (
              <>
                <label>
                  Check-in time
                  <Input
                    name="check_in_time"
                    type="time"
                    defaultValue={(form?.check_in_time ?? place.check_in_time ?? '').slice(0, 5)}
                  />
                </label>
                <label>
                  Check-out time
                  <Input
                    name="check_out_time"
                    type="time"
                    defaultValue={(form?.check_out_time ?? place.check_out_time ?? '').slice(0, 5)}
                  />
                </label>
              </>
            )}
            {place.type === 'theater' && (
              <>
                <label>
                  Number of screens
                  <Input
                    name="screen_count"
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={form?.screen_count ?? place.screen_count ?? ''}
                  />
                </label>
              </>
            )}
          </div>
        </section>
      </Form>
    </AdminLayout>
  )
}
