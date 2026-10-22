import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/dialog/dialog.js'
import '@awesome.me/webawesome/dist/components/toast/toast.js'

// Confirmation Dialog using Web Awesome wa-dialog
const confirmationForms = [
  ...document.querySelectorAll('form[onsubmit], form[data-confirm]'),
].filter(
  (form) => form.getAttribute('onsubmit')?.includes('confirm(') || form.hasAttribute('data-confirm')
)

if (confirmationForms.length) {
  const dialog = document.createElement('wa-dialog')
  dialog.setAttribute('label', 'Confirm action')
  dialog.innerHTML = `
    <p class="confirm-message" style="margin: 0; font-size: 15px; line-height: 1.5; color: var(--ink);"></p>
    <div slot="footer" style="display: flex; gap: 8px; justify-content: flex-end;">
      <wa-button type="button" class="confirm-cancel">Cancel</wa-button>
      <wa-button type="button" variant="danger" appearance="filled" class="confirm-accept">Confirm</wa-button>
    </div>
  `
  document.body.append(dialog)

  let pendingForm = null
  let confirmedForm = null

  const resetDialog = () => {
    pendingForm = null
    dialog.open = false
  }

  dialog.querySelector('.confirm-cancel').addEventListener('click', resetDialog)
  dialog.addEventListener('wa-after-hide', () => {
    pendingForm = null
  })

  dialog.querySelector('.confirm-accept').addEventListener('click', () => {
    const form = pendingForm
    pendingForm = null
    dialog.open = false
    if (form) {
      confirmedForm = form
      form.requestSubmit()
    }
  })

  for (const form of confirmationForms) {
    const prompt =
      form.getAttribute('data-confirm') ||
      form.getAttribute('onsubmit')?.match(/confirm\('([^']+)'\)/)?.[1]
    if (!prompt) continue

    form.removeAttribute('onsubmit')
    form.onsubmit = null

    form.addEventListener('submit', (event) => {
      if (form === confirmedForm) {
        confirmedForm = null
        return
      }
      event.preventDefault()
      pendingForm = form

      const label = form.getAttribute('data-confirm-title') || 'Confirm action'
      const btnText = form.getAttribute('data-confirm-btn') || 'Confirm'
      const btnVariant = form.getAttribute('data-confirm-variant') || 'danger'

      dialog.setAttribute('label', label)
      dialog.querySelector('.confirm-message').textContent = prompt
      const acceptBtn = dialog.querySelector('.confirm-accept')
      if (acceptBtn) {
        acceptBtn.textContent = btnText
        acceptBtn.setAttribute('variant', btnVariant)
      }

      dialog.open = true
    })
  }
}

// Flash messages: Toasts for success, and inline dismissal buttons
const successNotices = [...document.querySelectorAll('.notice.success')]
if (successNotices.length) {
  const toast = document.createElement('wa-toast')
  toast.setAttribute('placement', 'top-end')
  document.body.append(toast)
  customElements.whenDefined('wa-toast').then(() => {
    for (const notice of successNotices) {
      const text =
        notice.querySelector('.notice-body')?.textContent.trim() || notice.textContent.trim()
      toast.create(text, {
        variant: 'success',
        duration: 4000,
      })
    }
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

// FilePond image uploads initialization
const uploads = [...document.querySelectorAll('input[type="file"][data-image-upload]')]
if (uploads.length) {
  Promise.all([
    import('filepond'),
    import('filepond-plugin-image-preview'),
    import('filepond-plugin-file-validate-type'),
    import('filepond-plugin-file-validate-size'),
  ]).then(([FilePond, preview, type, size]) => {
    FilePond.registerPlugin(preview.default, type.default, size.default)
    for (const upload of uploads) {
      const multiple = upload.multiple
      FilePond.create(upload, {
        storeAsFile: true,
        allowProcess: false,
        allowMultiple: multiple,
        maxFiles: multiple ? Number(upload.dataset.maxFiles) || null : 1,
        acceptedFileTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxFileSize: '5MB',
        credits: false,
        labelIdle: multiple
          ? 'Drop images or <span class="filepond--label-action">browse</span>'
          : 'Drop an image or <span class="filepond--label-action">browse</span>',
      })
    }
  })
}
