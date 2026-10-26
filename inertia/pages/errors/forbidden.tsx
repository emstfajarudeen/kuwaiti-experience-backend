import { Button } from 'antd'
import AdminLayout from '../../layouts/admin_layout'

type Props = { adminName: string; csrfToken: string; error: string }

export default function Forbidden({ adminName, csrfToken, error }: Props) {
  return <AdminLayout title="Access denied" active="" adminName={adminName} csrfToken={csrfToken} error={error}>
    <section className="panel tw:mx-auto tw:max-w-[640px] tw:p-8"><p className="eyebrow">ACCESS DENIED</p><h1>You do not have access to this page</h1><p className="subtitle">Your current staff roles do not allow this action. Ask a Super Admin if your access needs to change.</p><Button type="primary" href="/admin">Return to your CMS</Button></section>
  </AdminLayout>
}
