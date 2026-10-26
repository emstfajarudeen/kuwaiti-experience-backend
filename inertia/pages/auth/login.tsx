import { useState } from 'react'
import { Head } from '@inertiajs/react'
import { Button, Form, Input } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import Notice from '../../components/notice'
import { postCmsForm } from '../../lib/cms_form'

type LoginValues = { email: string; password: string }

type Props = {
  canRefresh: boolean
  csrfToken: string
  loginError: string | null
  email: string
}

export default function Login({ canRefresh, csrfToken, loginError, email }: Props) {
  const [form] = Form.useForm<LoginValues>()
  const [processing, setProcessing] = useState(false)

  function submit(values: LoginValues) {
    postCmsForm({
      action: '/admin/login',
      csrfToken,
      data: values,
      form,
      setProcessing,
    })
  }

  return (
    <>
      <Head title="Admin sign in · The Kuwaiti Experience" />
      <main className="login-shell login-shell--sign-in">
        <section className="login-visual" aria-label="The Kuwaiti Experience Content Studio">
          <div className="login-visual-top">
            <div className="login-monogram" aria-hidden="true">
              K
            </div>
            <div className="login-brand-lockup">
              <span className="login-brand">The Kuwaiti Experience</span>
              <span>Content Studio</span>
            </div>
          </div>
          <div className="login-visual-copy">
            <h1>
              Stories that <em>move</em> Kuwait.
            </h1>
          </div>
        </section>

        <section className="login-panel">
          <div className="login-mobile-brand" aria-hidden="true">
            <span>K</span>
            <p>The Kuwaiti Experience</p>
          </div>
          <h2>Welcome back</h2>
          {loginError && (
            <div className="login-notice">
              <Notice kind="error" message={loginError} />
            </div>
          )}
          <Form<LoginValues>
            form={form}
            layout="vertical"
            className="editor-form"
            initialValues={{ email }}
            onFinish={submit}
          >
            <div className="form-grid tw:grid tw:grid-cols-1">
              <Form.Item
                label="Email address"
                name="email"
                rules={[
                  { required: true, message: 'Enter your email address.' },
                  { type: 'email', message: 'Enter a valid email address.' },
                  { max: 254, message: 'Email address must be 254 characters or fewer.' },
                ]}
              >
                <Input
                  type="email"
                  name="email"
                  autoComplete="username"
                  maxLength={254}
                  size="large"
                  variant="filled"
                  prefix={<MailOutlined aria-hidden="true" />}
                />
              </Form.Item>
              <Form.Item
                label="Password"
                name="password"
                rules={[
                  { required: true, message: 'Enter your password.' },
                  { max: 200, message: 'Password must be 200 characters or fewer.' },
                ]}
              >
                <Input.Password
                  name="password"
                  autoComplete="current-password"
                  maxLength={200}
                  size="large"
                  variant="filled"
                  prefix={<LockOutlined aria-hidden="true" />}
                />
              </Form.Item>
              <div className="login-form-actions">
                <a className="login-forgot-link" href="/admin/forgot-password">
                  Forgot password?
                </a>
              </div>
              <Button
                className="button primary wide login-submit"
                type="primary"
                htmlType="submit"
                loading={processing}
              >
                Sign in
              </Button>
            </div>
          </Form>
          {canRefresh && (
            <div className="login-continue">
              <form action="/admin/refresh" method="POST" className="continue-form">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <button className="text-button" type="submit">
                  Continue previous session
                </button>
              </form>
            </div>
          )}
        </section>
      </main>
    </>
  )
}
