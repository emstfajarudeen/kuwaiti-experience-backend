import { useState } from 'react'
import { Head } from '@inertiajs/react'
import { Button, Form, Input } from 'antd'
import Notice from '../../components/notice'
import { postCmsForm } from '../../lib/cms_form'

type Values = { email: string }

type Props = {
  csrfToken: string
  submitted: boolean
  error: string | null
}

export default function ForgotPassword({ csrfToken, submitted, error }: Props) {
  const [form] = Form.useForm<Values>()
  const [processing, setProcessing] = useState(false)

  function submit(values: Values) {
    postCmsForm({
      action: '/admin/forgot-password',
      csrfToken,
      data: values,
      form,
      setProcessing,
    })
  }

  return (
    <>
      <Head title="Reset password · The Kuwaiti Experience" />
      <main className="login-shell tw:grid tw:min-h-[540px] tw:w-full tw:max-w-[940px] tw:grid-cols-2 tw:overflow-hidden tw:rounded-cms-lg tw:bg-white tw:shadow-lg tw:max-[900px]:min-h-0 tw:max-[900px]:max-w-[440px] tw:max-[900px]:grid-cols-1">
        <section
          className="login-visual tw:relative tw:flex tw:flex-col tw:justify-between tw:bg-[linear-gradient(135deg,var(--navy-deep)_0%,var(--navy)_100%)] tw:px-8 tw:py-10 tw:text-white tw:max-[900px]:hidden"
          aria-label="Brand"
        >
          <div className="login-brand tw:font-bebas tw:text-2xl tw:leading-none tw:tracking-[0.05em] tw:text-brand-gold">
            THE KUWAITI EXPERIENCE
          </div>
        </section>
        <section className="login-panel tw:flex tw:flex-col tw:justify-center tw:px-8 tw:py-10 tw:max-[480px]:px-5 tw:max-[480px]:py-6">
          <h2 className="tw:mb-2 tw:mt-1 tw:text-2xl tw:font-bold tw:text-brand-ink">
            Reset password
          </h2>
          <p className="tw:mb-6 tw:text-sm tw:leading-6 tw:text-brand-muted">
            Enter your administrator email address and we will send a reset link if the account is
            eligible.
          </p>
          {submitted && (
            <Notice
              kind="success"
              message="If an active administrator account matches that address, we have sent a password-reset link."
            />
          )}
          {error && <Notice kind="error" message={error} />}
          <Form<Values> form={form} layout="vertical" className="editor-form" onFinish={submit}>
            <Form.Item
              label="Email address"
              name="email"
              rules={[
                { required: true, message: 'Enter your email address.' },
                { type: 'email', message: 'Enter a valid email address.' },
                { max: 254, message: 'Email address must be 254 characters or fewer.' },
              ]}
            >
              <Input type="email" autoComplete="email" maxLength={254} />
            </Form.Item>
            <Button
              className="button primary wide tw:mt-2"
              type="primary"
              htmlType="submit"
              loading={processing}
            >
              Send reset link
            </Button>
          </Form>
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
