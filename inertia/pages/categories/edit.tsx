import { useState } from 'react'
import { Button, Form, Input, InputNumber, Select, Switch } from 'antd'
import ConfirmModal from '../../components/confirm_modal'
import AdminLayout from '../../layouts/admin_layout'
import { postCmsForm } from '../../lib/cms_form'
import { ReadOnlyNotice, useReadOnly } from '../../components/read_only'

type Category = { id: number; type: string; slug: string; sort_order: number; active: boolean }
type Values = {
  type: string
  slug: string
  nameEn: string
  nameAr: string
  sortOrder: number
  active: boolean
}
type Props = {
  adminName: string
  csrfToken: string
  error: string | null
  form: Partial<Record<keyof Values, string>> | null
  category: Category | null
  enName: string | null
  arName: string | null
  types: Array<{ code: string; name_en: string }>
  defaultType: string | null
}

export default function CategoryEdit({
  adminName,
  csrfToken,
  error,
  form,
  category,
  enName,
  arName,
  types,
  defaultType,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [antdForm] = Form.useForm<Values>()
  const readOnly = useReadOnly('categories.update', Boolean(category))
  const title = readOnly ? 'View category' : category ? 'Edit category' : 'New category'
  const action = category ? `/admin/categories/${category.id}/save` : '/admin/categories'
  const initialValues: Values = {
    type: form?.type ?? category?.type ?? defaultType ?? '',
    slug: form?.slug ?? category?.slug ?? '',
    nameEn: form?.nameEn ?? enName ?? '',
    nameAr: form?.nameAr ?? arName ?? '',
    sortOrder: Number(form?.sortOrder ?? category?.sort_order ?? 0),
    active: form ? form.active === 'on' : !category || category.active,
  }
  return (
    <AdminLayout
      title={title}
      active="categories"
      adminName={adminName}
      csrfToken={csrfToken}
      error={error}
    >
      <a
        className="back-link tw:[display:inline-flex] tw:[margin-bottom:var(--space-3)]"
        href="/admin/categories"
      >
        ← Back to categories
      </a>
      <div className="page-head form-page-head tw:mb-6">
        <h1>{category ? enName || category.slug : 'Create category'}</h1>
      </div>
      {readOnly && <ReadOnlyNotice thing="category" />}
      <Form
        id="cms-category-editor"
        form={antdForm}
        initialValues={initialValues}
        layout="vertical"
        disabled={readOnly}
        onFinish={(values) =>
          postCmsForm({
            action,
            csrfToken,
            form: antdForm,
            setProcessing,
            data: {
              type: values.type,
              slug: values.slug,
              nameEn: values.nameEn,
              nameAr: values.nameAr,
              sortOrder: String(values.sortOrder ?? 0),
              active: values.active ? 'on' : '',
            },
          })
        }
      >
        <div className="editor-grid tw:grid tw:items-start tw:gap-4">
          <section className="panel form-panel tw:p-6">
            <h2>Category details</h2>
            <div className="form-grid two tw:mt-4 tw:grid tw:grid-cols-2 tw:gap-4 tw:max-[900px]:grid-cols-1">
              <Form.Item
                name="type"
                label="Category type"
                rules={[{ required: true, message: 'Select a category type.' }]}
              >
                <Select options={types.map((t) => ({ value: t.code, label: t.name_en }))} />
              </Form.Item>
              <Form.Item
                name="sortOrder"
                label="Display order"
                rules={[{ required: true, message: 'Enter a display order.' }]}
              >
                <InputNumber className="tw:w-full" precision={0} />
              </Form.Item>
              <Form.Item
                name="nameEn"
                label="English name"
                rules={[
                  {
                    required: true,
                    min: 2,
                    max: 160,
                    message: 'Enter an English name between 2 and 160 characters.',
                  },
                ]}
              >
                <Input maxLength={160} placeholder="Landmarks" />
              </Form.Item>
              <Form.Item
                name="nameAr"
                label="Arabic name"
                rules={[{ max: 160, message: 'Arabic name must be 160 characters or fewer.' }]}
              >
                <Input dir="rtl" lang="ar" maxLength={160} placeholder="معالم أثرية" />
              </Form.Item>
              <Form.Item
                className="full tw:col-span-full"
                name="slug"
                label="URL slug"
                rules={[
                  {
                    required: true,
                    pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
                    message: 'Use lowercase letters, numbers, and single hyphens.',
                  },
                  { max: 160, message: 'Slug must be 160 characters or fewer.' },
                ]}
              >
                <Input maxLength={160} placeholder="landmarks" />
              </Form.Item>
              <Form.Item
                className="full tw:col-span-full"
                name="active"
                label="Active"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </div>
            <div className="cms-form-actions">
              {readOnly ? (
                <Button href="/admin/categories" disabled={false}>
                  Back to categories
                </Button>
              ) : (
                <>
                  {category && (
                    <Button
                      danger
                      className="cms-form-actions-start"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete category
                    </Button>
                  )}
                  <Button href="/admin/categories">Cancel</Button>
                  <Button type="primary" htmlType="submit" loading={processing}>
                    Save {category ? 'changes' : 'category'}
                  </Button>
                </>
              )}
            </div>
          </section>
        </div>
      </Form>
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete category"
        message="Delete this category? Places assigned to it will become uncategorized."
        action={category ? `/admin/categories/${category.id}/delete` : ''}
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
