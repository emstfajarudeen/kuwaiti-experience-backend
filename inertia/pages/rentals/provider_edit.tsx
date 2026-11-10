import { useState } from 'react'
import { Input, Switch, Table } from 'antd'
import { router } from '@inertiajs/react'
import ConfirmModal from '../../components/confirm_modal'
import RowActionMenu from '../../components/row_action_menu'
import AdminLayout from '../../layouts/admin_layout'
import ImageUpload from '../../components/image_upload'
import {
  FormField,
  FormSection,
  RentalFormShell,
  SwitchField,
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

type Branch = {
  id: number
  name_en: string
  address: string | null
  phone: string | null
  active: boolean
  hours_enabled: boolean
  vehicle_count: number
}

type Props = SharedProps & {
  provider: Provider | null
  branches: Branch[]
  form: Record<string, unknown> | null
}

/** The provider's pickup and return branches. */
function BranchesPanel({
  provider,
  branches,
  csrfToken,
}: {
  provider: Provider
  branches: Branch[]
  csrfToken: string
}) {
  const can = useCan()
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Branch | null>(null)
  const here = `/admin/rentals/providers/${provider.id}/edit`
  return (
    <section className="panel table-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-0">
      <div className="panel-heading tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-brand-line-subtle tw:px-6 tw:py-5">
        <h2>Branches ({branches.length})</h2>
        {can('rentals.create') && (
          <a
            className="button primary"
            href={`/admin/rentals/locations/new?providerId=${provider.id}`}
          >
            + Add branch
          </a>
        )}
      </div>
      <div className="table-scroll">
        <Table<Branch>
          className="cms-antd-table"
          rowKey="id"
          dataSource={branches}
          pagination={false}
          locale={{ emptyText: 'No branches yet. Add one so vehicles can be picked up there.' }}
          columns={[
            ...(can('rentals.update')
              ? [
                  {
                    title: 'Edit',
                    key: 'edit',
                    width: 70,
                    render: (_: unknown, row: Branch) => (
                      <a
                        href={`/admin/rentals/locations/${row.id}/edit`}
                        className="action-pencil-btn"
                        aria-label={`Edit ${row.name_en}`}
                      >
                        ✎
                      </a>
                    ),
                  },
                ]
              : []),
            {
              title: 'Branch',
              key: 'branch',
              render: (_: unknown, row: Branch) => (
                <div className="tw:flex tw:flex-col">
                  <strong>{row.name_en}</strong>
                  <span className="tw:text-[12px] tw:text-brand-muted">{row.address ?? '—'}</span>
                </div>
              ),
            },
            { title: 'Phone', key: 'phone', render: (_: unknown, row: Branch) => row.phone ?? '—' },
            {
              title: 'Hours',
              key: 'hours',
              render: (_: unknown, row: Branch) =>
                row.hours_enabled ? 'Set' : <span className="tw:text-brand-muted">Any time</span>,
            },
            { title: 'Vehicles', dataIndex: 'vehicle_count', key: 'vehicles' },
            {
              title: 'Status',
              key: 'active',
              width: 90,
              render: (_: unknown, row: Branch) => (
                <Switch
                  aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${row.name_en}`}
                  checked={row.active}
                  loading={busy === row.id}
                  disabled={!can('rentals.update') || busy !== null}
                  onChange={(active) =>
                    router.post(
                      `/admin/rentals/locations/${row.id}/status`,
                      { active, returnTo: here, _csrf: csrfToken },
                      {
                        preserveScroll: true,
                        onStart: () => setBusy(row.id),
                        onFinish: () => setBusy(null),
                      }
                    )
                  }
                />
              ),
            },
            ...(can('rentals.delete')
              ? [
                  {
                    title: 'Actions',
                    key: 'more',
                    width: 90,
                    render: (_: unknown, row: Branch) => (
                      <RowActionMenu
                        label={`More actions for ${row.name_en}`}
                        actions={[
                          { label: 'Delete', danger: true, onClick: () => setDeleting(row) },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete branch"
        message={`Delete ${deleting?.name_en ?? 'this branch'}? Branches with bookings cannot be deleted; deactivate them instead.`}
        action={deleting ? `/admin/rentals/locations/${deleting.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </section>
  )
}

export default function RentalProviderEdit({
  adminName,
  csrfToken,
  success,
  error,
  provider,
  branches,
  form,
}: Props) {
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
      <div className="page-head tw:mb-6">
        <h1>{provider ? provider.name_en : 'New provider'}</h1>
      </div>
      <RentalFormShell
        id="rental-provider-form"
        multipart
        action={
          provider ? `/admin/rentals/providers/${provider.id}/save` : '/admin/rentals/providers'
        }
        csrfToken={csrfToken}
        cancelHref="/admin/rentals/providers"
        submitLabel="Save provider"
        initialValues={{
          nameEn: value('nameEn', provider?.name_en),
          nameAr: value('nameAr', provider?.name_ar),
          phone: value('phone', provider?.phone),
          email: value('email', provider?.email),
          address: value('address', provider?.address),
          active: form?.active !== undefined ? Boolean(form.active) : (provider?.active ?? true),
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
      {provider && <BranchesPanel provider={provider} branches={branches} csrfToken={csrfToken} />}
    </AdminLayout>
  )
}
