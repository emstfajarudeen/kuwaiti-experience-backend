import { useState } from 'react'
import { Button, Form, Input, InputNumber } from 'antd'
import { postCmsForm } from '../../lib/cms_form'
import AdminLayout from '../../layouts/admin_layout'
import ConfirmModal from '../../components/confirm_modal'
import ImageUpload from '../../components/image_upload'

type CategoryType = { code: string; name_en: string; name_ar: string | null; sort_order: number }
type FormValues = {
  code: string | null
  nameEn: string | null
  nameAr: string | null
  sortOrder: string | null
}
type Props = {
  adminName: string
  csrfToken: string
  error: string | null
  form: FormValues | null
  categoryType: CategoryType | null
  imageUrl: string | null
  nextOrder: number
}

export default function CategoryTypeEdit({
  adminName,
  csrfToken,
  error,
  form,
  categoryType,
  imageUrl,
  nextOrder,
}: Props) {
  const [antdForm] = Form.useForm()
  const [processing, setProcessing] = useState(false)
  const [removeImage, setRemoveImage] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const action = categoryType
    ? `/admin/category-types/${encodeURIComponent(categoryType.code)}/save`
    : '/admin/category-types'
  return (
    <AdminLayout
      title={categoryType ? 'Edit category type' : 'New category type'}
      active="category-types"
      adminName={adminName}
      csrfToken={csrfToken}
      error={error}
    >
      <a
        className="back-link tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:600] tw:[margin-bottom:var(--space-3)] tw:[transition:color_0.15s_ease]"
        href="/admin/category-types"
      >
        ← Back to category types
      </a>
      <div className="page-head form-page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <h1>{categoryType?.name_en || 'Create category type'}</h1>
        <div className="form-page-actions"><Button className="button primary" htmlType="submit" form="category-type-editor" loading={processing}>Save {categoryType ? 'changes' : 'category type'}</Button></div>
      </div>
      <Form
        form={antdForm}
        component="form"
        id="category-type-editor"
        layout="vertical"
        initialValues={{ code: form?.code ?? '', nameEn: form?.nameEn ?? categoryType?.name_en ?? '', nameAr: form?.nameAr ?? categoryType?.name_ar ?? '', sortOrder: Number(form?.sortOrder ?? categoryType?.sort_order ?? nextOrder) }}
        onFinish={() => {
          const element = document.getElementById('category-type-editor') as HTMLFormElement | null
          if (element) postCmsForm({ action, csrfToken, form: antdForm, setProcessing, data: new FormData(element) })
        }}
        action={action}
        method="POST"
        encType="multipart/form-data"
        className="editor-grid tw:grid tw:items-start tw:gap-4"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <div className="editor-main tw:flex tw:flex-col">
          <section className="panel form-panel tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
            <h2>Type details</h2>
            <div className="form-grid two tw:mt-4 tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
              <div>
                {categoryType ? (
                  <Form.Item label="Code"><Input value={categoryType.code} readOnly /></Form.Item>
                ) : (
                  <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Enter a code.' }, { pattern: /^[a-z0-9]+(_[a-z0-9]+)*$/, message: 'Use lowercase letters, numbers, and underscores.' }, { max: 32, message: 'Code must be 32 characters or fewer.' }]}><Input name="code" maxLength={32} placeholder="museum" /></Form.Item>
                )}
              </div>
              <Form.Item name="sortOrder" label="Display order" rules={[{ required: true, message: 'Enter a display order.' }]}><InputNumber name="sortOrder" className="tw:w-full" precision={0} /></Form.Item>
              <Form.Item name="nameEn" label="English name" rules={[{ required: true, min: 2, max: 160, message: 'Enter an English name between 2 and 160 characters.' }]}><Input name="nameEn" maxLength={160} placeholder="Museums" /></Form.Item>
              <Form.Item name="nameAr" label="Arabic name" rules={[{ max: 160, message: 'Arabic name must be 160 characters or fewer.' }]}><Input name="nameAr" dir="rtl" lang="ar" maxLength={160} placeholder="المتاحف" /></Form.Item>
              <Form.Item label="Image" className="full tw:col-span-full">
                <input type="hidden" name="removeImage" value={removeImage ? 'on' : ''} />
                {imageUrl && !removeImage ? (
                  <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-4">
                    <div className="tw:relative tw:flex tw:size-[110px] tw:shrink-0 tw:items-center tw:justify-center tw:overflow-hidden tw:rounded-cms tw:border tw:border-brand-line tw:bg-white tw:p-2 tw:shadow-sm">
                      <img
                        src={imageUrl}
                        alt={categoryType?.name_en ?? ''}
                        className="tw:max-h-full tw:max-w-full tw:object-contain"
                      />
                    </div>
                    <div className="tw:flex tw:flex-col tw:items-start tw:gap-2.5">
                      <ImageUpload name="image" />
                      <Button
                        danger
                        size="small"
                        onClick={() => setRemoveImage(true)}
                      >
                        Remove image
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="tw:flex tw:flex-col tw:items-start tw:gap-3">
                    {imageUrl && removeImage && (
                      <div className="tw:inline-flex tw:items-center tw:gap-3 tw:rounded-cms tw:border tw:border-dashed tw:border-red-300 tw:bg-red-50/70 tw:px-3.5 tw:py-2 tw:text-xs">
                        <span className="tw:font-medium tw:text-red-700">Image will be removed upon saving</span>
                        <Button size="small" onClick={() => setRemoveImage(false)}>
                          Undo
                        </Button>
                      </div>
                    )}
                    <ImageUpload name="image" />
                  </div>
                )}
              </Form.Item>
            </div>
          </section>
        </div>
      </Form>
      {categoryType && (
        <section className="panel danger-zone-panel tw:max-w-[600px] tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:[border-color:var(--danger-border)] tw:[background:#fdfaf9] tw:[padding:var(--space-5)_var(--space-6)] tw:[margin-top:var(--space-8)]">
          <h2>Danger zone</h2>
          <div className="tw:mt-3.5">
            <button type="button" className="button danger" onClick={() => setConfirmDelete(true)}>
              Delete category type
            </button>
          </div>
        </section>
      )}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete category type"
        message="Delete this category type? Ensure no places or categories use it first."
        action={
          categoryType
            ? `/admin/category-types/${encodeURIComponent(categoryType.code)}/delete`
            : ''
        }
        csrfToken={csrfToken}
        confirmLabel="Delete"
        danger
      />
    </AdminLayout>
  )
}
