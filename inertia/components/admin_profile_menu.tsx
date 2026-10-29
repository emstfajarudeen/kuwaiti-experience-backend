import { useState } from 'react'
import { Button, Dropdown, Modal } from 'antd'
import type { MenuProps } from 'antd'

type Props = {
  adminName: string
  csrfToken: string
}

export default function AdminProfileMenu({ adminName, csrfToken }: Props) {
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') setConfirmingLogout(true)
  }

  return (
    <>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          onClick: onMenuClick,
          items: [
            { key: 'profile', label: <a href="/admin/account">My profile</a> },
            { type: 'divider' },
            { key: 'logout', label: 'Sign out', danger: true },
          ],
        }}
      >
        <button
          type="button"
          className="tw:ml-2 tw:inline-flex tw:min-h-10 tw:items-center tw:gap-2 tw:rounded-cms-sm tw:border tw:border-brand-line tw:bg-white tw:px-2 tw:py-1 tw:text-[13px] tw:font-semibold tw:text-brand-ink tw:transition-colors tw:hover:border-brand-line-strong tw:hover:bg-brand-surface-subtle"
          aria-label={`Profile menu for ${adminName}`}
        >
          <span className="tw:grid tw:size-7 tw:place-items-center tw:rounded-full tw:bg-brand-navy tw:text-xs tw:font-bold tw:text-brand-gold">
            {adminName.slice(0, 1).toUpperCase()}
          </span>
          <span className="tw:max-[600px]:hidden">{adminName}</span>
          <span aria-hidden="true" className="tw:text-xs tw:text-brand-muted">
            ▾
          </span>
        </button>
      </Dropdown>
      <Modal
        open={confirmingLogout}
        title="Sign out"
        onCancel={() => setConfirmingLogout(false)}
        width={420}
        footer={
          <div className="tw:flex tw:justify-end tw:gap-2">
            <Button onClick={() => setConfirmingLogout(false)}>Cancel</Button>
            <form action="/admin/logout" method="POST">
              <input type="hidden" name="_csrf" value={csrfToken} />
              <Button htmlType="submit" type="primary">
                Sign out
              </Button>
            </form>
          </div>
        }
      >
        <p className="tw:mb-2 tw:mt-0">Are you sure you want to log out of the admin panel?</p>
      </Modal>
    </>
  )
}
