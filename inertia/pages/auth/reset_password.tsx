import { useState } from 'react'
import { Head } from '@inertiajs/react'
import { Button, Form, Input } from 'antd'
import Notice from '../../components/notice'
import { postCmsForm } from '../../lib/cms_form'

type Values = { token: string; newPassword: string; confirmPassword: string }

type Props = {
  csrfToken: string
  token: string
  tokenValid: boolean
  error: string | null
}

export default function ResetPassword({ csrfToken, token, tokenValid, error }: Props) {
  const [form] = Form.useForm<Values>()
  const [processing, setProcessing] = useState(false)

  function submit(values: Values) {
    postCmsForm({
      action: '/admin/reset-password',
      csrfToken,
      data: { ...values, token },
      form,
      setProcessing,
    })
  }

  return (
    <>
      <Head title="Choose a new password · The Kuwaiti Experience" />
      <main className="login-shell tw:grid tw:min-h-[540px] tw:w-full tw:max-w-[940px] tw:grid-cols-2 tw:overflow-hidden tw:rounded-cms-lg tw:bg-white tw:shadow-lg tw:max-[900px]:min-h-0 tw:max-[900px]:max-w-[440px] tw:max-[900px]:grid-cols-1">
        <section
          className="login-visual tw:relative tw:flex tw:flex-col tw:justify-between tw:bg-[linear-gradient(135deg,var(--navy-deep)_0%,var(--navy)_100%)] tw:px-8 tw:py-10 tw:text-white tw:max-[900px]:hidden"
          aria-label="Brand"
        >
          <div className="login-brand tw:font-bebas tw:text-2xl tw:leading-none tw:tracking-[0.05em] tw:text-brand-gold">
            THE KUWAITI EXPERIENCE
          </div>
          <h1 className="tw:m-0 tw:font-playfair tw:text-[32px] tw:font-medium tw:leading-[1.25] tw:text-white">
            Secure your account
          </h1>
        </section>
        <section className="login-panel tw:flex tw:flex-col tw:justify-center tw:px-8 tw:py-10 tw:max-[480px]:px-5 tw:max-[480px]:py-6">
          {tokenValid ? (
            <>
              <h2 className="tw:mb-2 tw:mt-1 tw:text-2xl tw:font-bold tw:text-brand-ink">
                Choose a new password
              </h2>
              <p className="tw:mb-6 tw:text-sm tw:leading-6 tw:text-brand-muted">
                Use at least 14 characters. This will sign out every active admin session.
              </p>
              {error && <Notice kind="error" message={error} />}
              <Form<Values> form={form} layout="vertical" className="editor-form" onFinish={submit}>
                <Form.Item
                  label="New password"
                  name="newPassword"
                  rules={[
                    { required: true, message: 'Enter a new password.' },
                    { min: 14, message: 'Use at least 14 characters.' },
                    { max: 200, message: 'Password must be 200 characters or fewer.' },
                  ]}
                >
                  <Input.Password autoComplete="new-password" maxLength={200} />
                </Form.Item>
                <Form.Item
                  label="Confirm new password"
                  name="confirmPassword"
                  dependencies={['newPassword']}
                  rules={[
                    { required: true, message: 'Confirm your new password.' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        return !value || getFieldValue('newPassword') === value
                          ? Promise.resolve()
                          : Promise.reject(new Error('Passwords do not match.'))
                      },
                    }),
                  ]}
                >
                  <Input.Password autoComplete="new-password" maxLength={200} />
                </Form.Item>
                <Button
                  className="button primary wide tw:mt-2"
                  type="primary"
                  htmlType="submit"
                  loading={processing}
                >
                  Reset password
                </Button>
              </Form>
            </>
          ) : (
            <>
              <h2 className="tw:mb-2 tw:mt-1 tw:text-2xl tw:font-bold tw:text-brand-ink">
                This reset link is invalid or has expired
              </h2>
              <p className="tw:mb-6 tw:text-sm tw:leading-6 tw:text-brand-muted">
                Reset links expire after 20 minutes and can be used once.
              </p>
              <a className="button primary wide tw:text-center" href="/admin/forgot-password">
                Request a new reset link
              </a>
            </>
          )}
          <a
            className="tw:mt-5 tw:text-center tw:text-sm tw:font-semibold tw:text-brand-navy hover:tw:text-brand-gold"
            href="/admin/login"
          >
            Back to sign in
          </a>
        </section>
      </main>
    </>
  )
}
