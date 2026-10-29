// Flash messages: Toasts for success, and inline dismissal buttons
const successNotices = [...document.querySelectorAll('.notice.success')]
if (successNotices.length) {
  const messages = successNotices.map((notice) => {
    const text =
      notice.querySelector('.notice-body')?.textContent.trim() || notice.textContent.trim()
    notice.remove()
    return text
  })
  void import('../../inertia/lib/legacy_notifications').then(({ showSuccessNotifications }) => {
    showSuccessNotifications(messages)
  })
}

// Inline notice dismiss buttons
document.querySelectorAll('.notice').forEach((notice) => {
  const closeBtn = notice.querySelector('.notice-close')
  if (closeBtn) {
    closeBtn.addEventListener('click', () => notice.remove())
  }
})

// Mobile Sidebar Drawer Toggle
const toggleBtn = document.querySelector('[data-sidebar-toggle]')
const backdrop = document.querySelector('.sidebar-backdrop')
if (toggleBtn && backdrop) {
  toggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('cms-sidebar-open')
  })
  backdrop.addEventListener('click', () => {
    document.body.classList.remove('cms-sidebar-open')
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.body.classList.remove('cms-sidebar-open')
    }
  })
}

// Password Reveal Affordance
document.querySelectorAll('[data-password-toggle]').forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const input = toggle.parentElement?.querySelector('input[type="password"], input[type="text"]')
    if (!input) return
    if (input.type === 'password') {
      input.type = 'text'
      toggle.textContent = 'Hide'
      toggle.setAttribute('aria-label', 'Hide password')
    } else {
      input.type = 'password'
      toggle.textContent = 'Show'
      toggle.setAttribute('aria-label', 'Show password')
    }
  })
})

// Table Row Actions Dropdown Menu (3-dot)
function setupRowMenus() {
  const closeAllMenus = () => {
    for (const menu of document.querySelectorAll('[data-row-menu].is-open')) {
      menu.classList.remove('is-open')
      menu.querySelector('.action-dots-btn')?.setAttribute('aria-expanded', 'false')
      const dropdown = menu.querySelector('.row-menu-dropdown')
      if (dropdown) {
        dropdown.style.top = ''
        dropdown.style.right = ''
        dropdown.style.left = ''
        dropdown.style.bottom = ''
      }
    }
  }

  document.addEventListener('click', (event) => {
    const toggleBtn = event.target.closest('[data-row-menu] .action-dots-btn')
    const clickedInsideDropdown = event.target.closest('.row-menu-dropdown')

    if (toggleBtn) {
      event.preventDefault()
      event.stopPropagation()
      const parentMenu = toggleBtn.closest('[data-row-menu]')
      const wasOpen = parentMenu.classList.contains('is-open')

      closeAllMenus()

      if (!wasOpen) {
        parentMenu.classList.add('is-open')
        toggleBtn.setAttribute('aria-expanded', 'true')

        const dropdown = parentMenu.querySelector('.row-menu-dropdown')
        if (dropdown) {
          const rect = toggleBtn.getBoundingClientRect()
          const spaceBelow = window.innerHeight - rect.bottom
          const dropdownHeight = 120
          if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
            dropdown.style.top = 'auto'
            dropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`
          } else {
            dropdown.style.bottom = 'auto'
            dropdown.style.top = `${rect.bottom + 4}px`
          }
          dropdown.style.right = `${Math.max(10, window.innerWidth - rect.right)}px`
          dropdown.style.left = 'auto'
        }
      }
      return
    }

    if (clickedInsideDropdown) {
      setTimeout(closeAllMenus, 150)
      return
    }

    closeAllMenus()
  })

  window.addEventListener('scroll', closeAllMenus, true)
  window.addEventListener('resize', closeAllMenus)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllMenus()
  })
}

setupRowMenus()
