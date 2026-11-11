import { Button } from 'antd'
import AdminLayout from '../../layouts/admin_layout'
import { usePortal } from '../../lib/authorization'

type Props = { adminName: string; csrfToken: string; error: string }

export default function Forbidden({ adminName, csrfToken, error }: Props) {
  const portal = usePortal()
  return (
    <AdminLayout
      title="Access denied"
      active=""
      adminName={adminName}
      csrfToken={csrfToken}
      error={portal ? null : error}
    >
      <section className="panel tw:mx-auto tw:max-w-[640px] tw:p-8">
        <p className="eyebrow">ACCESS DENIED</p>
        <h1>You do not have access to this page</h1>
        <p className="subtitle">
          {portal
            ? 'The provider portal covers your bookings, vehicles, branches and working hours. For anything else, contact the Kuwaiti Experience team.'
            : 'Your current staff roles do not allow this action. Ask a Super Admin if your access needs to change.'}
        </p>
        <Button type="primary" href="/admin">
          {portal ? 'Back to dashboard' : 'Return to your CMS'}
        </Button>
      </section>
    </AdminLayout>
  )
}
