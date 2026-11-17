import { useState } from 'react'
import { Button, Form, Input, InputNumber, Switch } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import { postCmsForm } from '../../lib/cms_form'
import { ReadOnlyNotice, useReadOnly } from '../../components/read_only'

type Country = {
  code: string
  name_en: string
  name_ar: string | null
  active: boolean
  sort_order: number
}
type FormValues = {
  code: string
  nameEn: string
  nameAr: string
  active: boolean
  sortOrder: number
}
type Props = {
  adminName: string
  csrfToken: string
  error: string | null
  form: Partial<FormValues> | null
  country: Country | null
}

export default function CountryEdit({ adminName, csrfToken, error, form, country }: Props) {
  const [antdForm] = Form.useForm<FormValues>()
  const [processing, setProcessing] = useState(false)
  const readOnly = useReadOnly('countries.update', Boolean(country))
  const action = country
    ? `/admin/countries/${encodeURIComponent(country.code)}/save`
    : '/admin/countries'
  return (
    <AdminLayout
      title={readOnly ? 'View country' : country ? 'Edit country' : 'New country'}
      active="countries"
      adminName={adminName}
      csrfToken={csrfToken}
      error={error}
    >
      <div className="tw:mb-6 tw:flex tw:items-center tw:justify-between tw:gap-4">
        <a className="back-link tw:inline-flex" href="/admin/countries">
          ← Back to countries
        </a>
      </div>
      {readOnly && <ReadOnlyNotice thing="country" />}
      <section className="panel form-panel tw:w-full tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:p-6 tw:shadow-[0_4px_14px_rgba(0,23,46,0.06)]">
        <h2>Country details</h2>
        <Form<FormValues>
          form={antdForm}
          id="country-editor"
          layout="vertical"
          disabled={readOnly}
          className="tw:mt-5"
          initialValues={{
            code: form?.code ?? country?.code ?? '',
            nameEn: form?.nameEn ?? country?.name_en ?? '',
            nameAr: form?.nameAr ?? country?.name_ar ?? '',
            active: form?.active ?? country?.active ?? true,
            sortOrder: Number(form?.sortOrder ?? country?.sort_order ?? 0),
          }}
          onFinish={(values) =>
            postCmsForm({
              action,
              csrfToken,
              form: antdForm,
              setProcessing,
              data: {
                ...values,
                code: country?.code ?? values.code.trim().toUpperCase(),
                nameAr: values.nameAr || '',
              },
            })
          }
        >
          <div className="tw:grid tw:grid-cols-2 tw:gap-x-4 tw:max-[700px]:grid-cols-1">
            {country ? (
              <Form.Item label="Country code">
                <Input value={country.code} readOnly />
              </Form.Item>
            ) : (
              <Form.Item
                name="code"
                label="Country code (ISO alpha-2)"
                rules={[
                  { required: true, message: 'Enter a two-letter country code.' },
                  { pattern: /^[a-zA-Z]{2}$/, message: 'Use two letters, such as KW.' },
                ]}
              >
                <Input maxLength={2} autoCapitalize="characters" placeholder="KW" />
              </Form.Item>
            )}
            <Form.Item
              name="sortOrder"
              label="Display order"
              rules={[{ required: true, message: 'Enter a display order.' }]}
            >
              <InputNumber min={0} precision={0} className="tw:w-full" />
            </Form.Item>
            <Form.Item
              name="nameEn"
              label="English name"
              rules={[
                {
                  required: true,
                  min: 2,
                  max: 160,
                  message: 'Enter a name between 2 and 160 characters.',
                },
              ]}
            >
              <Input maxLength={160} />
            </Form.Item>
            <Form.Item name="nameAr" label="Arabic name">
              <Input dir="rtl" lang="ar" maxLength={160} />
            </Form.Item>
          </div>
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <div className="cms-form-actions">
            {readOnly ? (
              <Button href="/admin/countries" disabled={false}>
                Back to countries
              </Button>
            ) : (
              <>
                <Button href="/admin/countries">Cancel</Button>
                <Button type="primary" htmlType="submit" loading={processing}>
                  Save country
                </Button>
              </>
            )}
          </div>
        </Form>
      </section>
    </AdminLayout>
  )
}
