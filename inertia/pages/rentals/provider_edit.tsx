import { useState } from 'react'
import { Button, Form, Input, Select, Switch, message } from 'antd'
import { router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import ConfirmModal from '../../components/confirm_modal'
import {
  FormField,
  FormSection,
  Panel,
  RentalFormShell,
  SwitchField,
  formatDateTime,
  useCan,
  type SharedProps,
} from '../../components/rental_ui'

type Provider = {
  id: number
  name_en: string
  name_ar: string | null
  phone: string | null
  email: string | null
  address: string | null
  active: boolean
  logo_url: string | null
}

type PortalLogin = {
  id: number
  name: string
  email: string
  state: 'active' | 'invited' | 'invite_expired' | 'disabled'
  invitedAt: string | null
  inviteExpiresAt: string | null
  lastLoginAt: string | null
}

type Props = SharedProps & {
  provider: Provider | null
  /** Service areas for pickup at the customer's address (with-driver bookings). */
  areaOptions: { value: number; label: string }[]
  excludedAreaIds: number[]
  branchCount: number
  driverCount: number
  documentCount: number
  login: PortalLogin | null
  loginForm: Record<string, unknown> | null
  /** Shown once when the invite email could not be sent. */
  inviteLink: string | null
  form: Record<string, unknown> | null
}

/** Areas this provider's drivers do not go to; posts native excludedAreaIds inputs. */
function ExcludedAreasField({ options }: { options: { value: number; label: string }[] }) {
  const form = Form.useFormInstance()
  const selected = (Form.useWatch('excludedAreaIds', form) as number[] | undefined) ?? []
  return (
    <section className="cms-form-section">
      <h2>Areas not served</h2>
      <p className="tw:mt-1 tw:text-[13px] tw:text-brand-muted">
        For with-driver bookings, the driver picks the customer up at their address. This
        provider&apos;s cars are not offered for addresses in the areas chosen here. Leave empty if
        the provider serves everywhere.
      </p>
      <Form.Item name="excludedAreaIds" className="tw:mt-4">
        <Select
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={options.length ? 'Search and choose areas' : 'No service areas yet'}
          disabled={!options.length}
          notFoundContent="Add areas under Rental fleet → Service areas."
          options={options}
          className="tw:w-full"
        />
      </Form.Item>
      <input type="hidden" name="excludedAreasSent" value="1" />
      {selected.map((id) => (
        <input key={id} type="hidden" name="excludedAreaIds" value={id} />
      ))}
    </section>
  )
}

const loginStates: Record<PortalLogin['state'], { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'published' },
  invited: { label: 'Invite sent', tone: 'draft' },
  invite_expired: { label: 'Invite expired', tone: 'archived' },
  disabled: { label: 'Turned off', tone: 'archived' },
}

/** The provider's own login to the portal: create, invite, turn off or remove. */
function PortalLoginPanel({
  provider,
  login,
  inviteLink,
  csrfToken,
  embedded = false,
}: {
  provider: Provider
  embedded?: boolean
  login: PortalLogin | null
  inviteLink: string | null
  csrfToken: string
}) {
  const can = useCan()
  const [switching, setSwitching] = useState(false)
  const [removing, setRemoving] = useState(false)
  const base = `/admin/rentals/providers/${provider.id}/login`
  const canManage = can('rentals.update')
  const state = login ? loginStates[login.state] : null
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      void message.success('Link copied.')
    } catch {
      void message.error('Copy the link manually.')
    }
  }
  return (
    <Panel
      embedded={embedded}
      actions={
        login && state ? (
          <span className="tw:flex tw:items-center tw:gap-3">
            <span className={`status ${state.tone}`}>{state.label}</span>
            {canManage && (
              <Switch
                aria-label={login.state === 'disabled' ? 'Turn login on' : 'Turn login off'}
                checkedChildren="On"
                unCheckedChildren="Off"
                checked={login.state !== 'disabled'}
                loading={switching}
                onChange={(checked) =>
                  router.post(
                    `${base}/status`,
                    { active: checked, _csrf: csrfToken },
                    {
                      preserveScroll: true,
                      onStart: () => setSwitching(true),
                      onFinish: () => setSwitching(false),
                    }
                  )
                }
              />
            )}
          </span>
        ) : null
      }
    >
      {inviteLink && (
        <div className="tw:mb-4 tw:rounded-cms-sm tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-4">
          <p className="tw:m-0 tw:mb-2 tw:text-[13px] tw:font-semibold">
            Send this set-password link to the provider (valid for 72 hours, one use):
          </p>
          <div className="tw:flex tw:gap-2">
            <Input readOnly value={inviteLink} onFocus={(event) => event.target.select()} />
            <Button onClick={() => void copy(inviteLink)}>Copy</Button>
          </div>
        </div>
      )}

      {login ? (
        <div className="tw:flex tw:flex-col tw:gap-4">
          <dl className="tw:m-0 tw:grid tw:grid-cols-3 tw:gap-4 tw:max-[900px]:grid-cols-1">
            <div className="tw:flex tw:flex-col tw:gap-0.5">
              <dt className="tw:text-[12px] tw:font-semibold tw:uppercase tw:text-brand-muted">
                Name
              </dt>
              <dd className="tw:m-0 tw:text-[14px]">{login.name}</dd>
            </div>
            <div className="tw:flex tw:flex-col tw:gap-0.5">
              <dt className="tw:text-[12px] tw:font-semibold tw:uppercase tw:text-brand-muted">
                Sign-in email
              </dt>
              <dd className="tw:m-0 tw:text-[14px]">{login.email}</dd>
            </div>
            <div className="tw:flex tw:flex-col tw:gap-0.5">
              <dt className="tw:text-[12px] tw:font-semibold tw:uppercase tw:text-brand-muted">
                {login.state === 'invited' ? 'Invite expires' : 'Last sign-in'}
              </dt>
              <dd className="tw:m-0 tw:text-[14px]">
                {login.state === 'invited'
                  ? formatDateTime(login.inviteExpiresAt)
                  : login.lastLoginAt
                    ? formatDateTime(login.lastLoginAt)
                    : 'Never'}
              </dd>
            </div>
          </dl>
          {canManage && (
            <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              {can('rentals.delete') && (
                <Button danger onClick={() => setRemoving(true)}>
                  Remove login
                </Button>
              )}
            </div>
          )}
        </div>
      ) : null}

      <ConfirmModal
        open={removing}
        onClose={() => setRemoving(false)}
        title="Remove login"
        message={`Remove the portal login of ${login?.email ?? 'this provider'}? They are signed out and can no longer sign in. You can create a new login later.`}
        action={`${base}/delete`}
        csrfToken={csrfToken}
        confirmLabel="Remove login"
        danger
      />
    </Panel>
  )
}

export default function RentalProviderEdit({
  adminName,
  csrfToken,
  success,
  error,
  provider,
  areaOptions,
  excludedAreaIds,
  branchCount,
  driverCount,
  documentCount,
  login,
  inviteLink,
  form,
}: Props) {
  const can = useCan()
  const [inviting, setInviting] = useState(false)
  const value = (key: string, fallback: unknown) =>
    form?.[key] !== undefined ? form[key] : (fallback ?? '')
  return (
    <AdminLayout
      title={provider ? 'Edit provider' : 'New provider'}
      active="rental-providers"
      adminName={adminName}
      csrfToken={csrfToken}
      success={success}
      error={error}
    >
      <a className="back-link tw:mb-4 tw:inline-flex" href="/admin/rentals/providers">
        ← Back to providers
      </a>
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
        <h1>{provider ? provider.name_en : 'New provider'}</h1>
        {provider && (
          <div className="tw:flex tw:flex-wrap tw:gap-2">
            <a
              className="button primary tw:border-brand-navy-subtle tw:bg-brand-navy-subtle"
              href={`/admin/rentals/locations?provider=${provider.id}`}
            >
              Branches
              <span className="tw:inline-flex tw:h-[22px] tw:min-w-[22px] tw:items-center tw:justify-center tw:rounded-full tw:bg-white tw:px-1.5 tw:text-[12px] tw:font-bold tw:leading-none tw:text-brand-navy-deep">
                {branchCount}
              </span>
            </a>
            <a
              className="button primary tw:border-brand-navy-subtle tw:bg-brand-navy-subtle"
              href={`/admin/rentals/working-hours?provider=${provider.id}`}
            >
              Working hours
            </a>
            <a
              className="button primary tw:border-brand-navy-subtle tw:bg-brand-navy-subtle"
              href={`/admin/rentals/drivers?provider=${provider.id}`}
            >
              Drivers
              <span className="tw:inline-flex tw:h-[22px] tw:min-w-[22px] tw:items-center tw:justify-center tw:rounded-full tw:bg-white tw:px-1.5 tw:text-[12px] tw:font-bold tw:leading-none tw:text-brand-navy-deep">
                {driverCount}
              </span>
            </a>
            <a
              className="button primary tw:border-brand-navy-subtle tw:bg-brand-navy-subtle"
              href={`/admin/rentals/documents?provider=${provider.id}`}
            >
              Documents
              <span className="tw:inline-flex tw:h-[22px] tw:min-w-[22px] tw:items-center tw:justify-center tw:rounded-full tw:bg-white tw:px-1.5 tw:text-[12px] tw:font-bold tw:leading-none tw:text-brand-navy-deep">
                {documentCount}
              </span>
            </a>
          </div>
        )}
      </div>
      <div className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-6 tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)]">
        <RentalFormShell
          id="rental-provider-form"
          wrap={false}
          multipart
          action={
            provider ? `/admin/rentals/providers/${provider.id}/save` : '/admin/rentals/providers'
          }
          csrfToken={csrfToken}
          cancelHref="/admin/rentals/providers"
          submitLabel="Save provider"
          extraActions={
            provider &&
            can('rentals.update') &&
            login?.state !== 'disabled' &&
            (login || provider.email) ? (
              <Button
                type="primary"
                className="cms-form-actions-start"
                loading={inviting}
                onClick={() =>
                  router.post(
                    login
                      ? `/admin/rentals/providers/${provider.id}/login/invite`
                      : `/admin/rentals/providers/${provider.id}/login`,
                    login
                      ? { _csrf: csrfToken }
                      : { name: provider.name_en, email: provider.email ?? '', _csrf: csrfToken },
                    {
                      preserveScroll: true,
                      onStart: () => setInviting(true),
                      onFinish: () => setInviting(false),
                    }
                  )
                }
              >
                {!login
                  ? 'Send invite'
                  : login.state === 'active'
                    ? 'Send password reset link'
                    : 'Re-invite'}
              </Button>
            ) : null
          }
          initialValues={{
            nameEn: value('nameEn', provider?.name_en),
            nameAr: value('nameAr', provider?.name_ar),
            phone: value('phone', provider?.phone),
            email: value('email', provider?.email),
            address: value('address', provider?.address),
            active: form?.active !== undefined ? Boolean(form.active) : (provider?.active ?? true),
            excludedAreaIds: Array.isArray(form?.excludedAreaIds)
              ? (form.excludedAreaIds as unknown[]).map(Number)
              : excludedAreaIds,
          }}
        >
          <FormSection title="Provider details">
            <FormField
              label="Name (English)"
              name="nameEn"
              required
              message="Enter the English name."
            >
              <Input name="nameEn" maxLength={160} />
            </FormField>
            <FormField label="Name (Arabic)" name="nameAr">
              <Input name="nameAr" dir="rtl" lang="ar" maxLength={160} />
            </FormField>
            <FormField
              label="Phone"
              name="phone"
              hint="Shown to customers on confirmed bookings. Use international format, e.g. +96512345678."
              rules={[
                {
                  pattern: /^$|^\+[1-9]\d{7,14}$/,
                  message: 'Use international format, e.g. +96512345678.',
                },
              ]}
            >
              <Input name="phone" maxLength={16} />
            </FormField>
            <FormField
              label="Email"
              name="email"
              hint="For staff reference; not shown in the app."
              rules={[{ type: 'email', message: 'Enter a valid email address.' }]}
            >
              <Input name="email" maxLength={254} />
            </FormField>
            <FormField label="Address" name="address">
              <Input name="address" maxLength={500} />
            </FormField>
            <SwitchField
              label="Status"
              name="active"
              hint="Vehicles of inactive providers are hidden from the app."
            />
          </FormSection>
          <ExcludedAreasField options={areaOptions} />
          <section className="cms-form-section">
            <h2>Logo</h2>
            <div className="image-block tw:mt-4">
              <ImageUpload
                name="logo"
                currentImageUrl={provider?.logo_url}
                currentImageAlt="Provider logo"
                removeName="removeLogo"
              />
            </div>
          </section>
        </RentalFormShell>
        {provider && (login || inviteLink) && (
          <PortalLoginPanel
            embedded
            provider={provider}
            login={login}
            inviteLink={inviteLink}
            csrfToken={csrfToken}
          />
        )}
      </div>
    </AdminLayout>
  )
}
