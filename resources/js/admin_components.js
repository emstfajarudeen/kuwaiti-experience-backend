import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/checkbox/checkbox.js'
import '@awesome.me/webawesome/dist/components/details/details.js'
import '@awesome.me/webawesome/dist/components/dialog/dialog.js'
import '@awesome.me/webawesome/dist/components/input/input.js'
import '@awesome.me/webawesome/dist/components/option/option.js'
import '@awesome.me/webawesome/dist/components/select/select.js'
import '@awesome.me/webawesome/dist/components/textarea/textarea.js'
import '@awesome.me/webawesome/dist/components/toast/toast.js'

function copyAttributes(source, target, excluded = []) {
  for (const { name, value } of source.attributes) {
    if (!excluded.includes(name)) target.setAttribute(name, value)
  }
}

function fieldLabel(control) {
  const label = control.closest('label') ?? document.querySelector(`label[for="${control.id}"]`)
  if (!label) return ''
  return [...label.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .join(' ')
}

function decorateField(source, target) {
  copyAttributes(source, target, ['onchange'])
  const wrapper = source.closest('label')
  const label = fieldLabel(source)
  if (label) target.setAttribute('label', label)
  if (wrapper) {
    target.classList.add(...wrapper.classList)
    const hint = wrapper.querySelector('small')?.textContent.trim()
    if (hint) target.setAttribute('hint', hint)
    wrapper.replaceWith(target)
  } else {
    source.replaceWith(target)
  }
}

for (const input of document.querySelectorAll('input:not([type="hidden"]):not([type="file"])')) {
  if (input.type === 'checkbox') {
    const label = input.closest('label')
    const checkbox = document.createElement('wa-checkbox')
    copyAttributes(input, checkbox, ['type'])
    checkbox.setAttribute('value', input.value || 'on')
    if (input.checked) checkbox.setAttribute('checked', '')
    checkbox.textContent = label?.textContent.trim() || fieldLabel(input)
    if (label) {
      checkbox.className = label.className
      label.replaceWith(checkbox)
    } else {
      input.replaceWith(checkbox)
    }
    continue
  }

  const field = document.createElement('wa-input')
  if (input.type === 'password') field.setAttribute('password-toggle', '')
  decorateField(input, field)
}

for (const textarea of document.querySelectorAll('textarea')) {
  const field = document.createElement('wa-textarea')
  field.setAttribute('value', textarea.value)
  decorateField(textarea, field)
}

for (const select of document.querySelectorAll('select:not([data-native-filter])')) {
  const field = document.createElement('wa-select')
  copyAttributes(select, field, ['onchange', 'size'])
  const wrapper = select.closest('label')
  const label = fieldLabel(select)
  if (label) field.setAttribute('label', label)
  if (select.multiple) {
    field.setAttribute('with-clear', '')
    field.setAttribute('max-options-visible', '3')
  }
  for (const option of select.options) {
    const item = document.createElement('wa-option')
    copyAttributes(option, item)
    item.textContent = option.textContent
    if (option.selected) item.setAttribute('selected', '')
    field.append(item)
  }
  if (wrapper) {
    field.classList.add(...wrapper.classList)
    wrapper.replaceWith(field)
  } else {
    document.querySelector(`label[for="${select.id}"]`)?.remove()
    select.replaceWith(field)
  }
}

for (const button of document.querySelectorAll('button')) {
  const replacement = document.createElement('wa-button')
  copyAttributes(button, replacement)
  replacement.innerHTML = button.innerHTML
  button.replaceWith(replacement)
}

for (const details of document.querySelectorAll('details')) {
  const summary = details.querySelector(':scope > summary')
  if (!summary) continue
  const replacement = document.createElement('wa-details')
  copyAttributes(details, replacement)
  const heading = document.createElement('span')
  heading.setAttribute('slot', 'summary')
  heading.innerHTML = summary.innerHTML
  if (heading.lastElementChild?.textContent.trim() === '↗') heading.lastElementChild.remove()
  replacement.append(heading)
  for (const child of [...details.children]) {
    if (child !== summary) replacement.append(child)
  }
  details.replaceWith(replacement)
}

const confirmationForms = [...document.querySelectorAll('form[onsubmit]')].filter((form) =>
  form.getAttribute('onsubmit')?.includes('confirm(')
)
if (confirmationForms.length) {
  const dialog = document.createElement('wa-dialog')
  dialog.setAttribute('label', 'Confirm action')
  dialog.innerHTML =
    '<p class="confirm-message"></p><wa-button slot="footer" type="button" class="confirm-cancel">Cancel</wa-button><wa-button slot="footer" type="button" variant="danger" appearance="filled" class="confirm-accept">Confirm</wa-button>'
  document.body.append(dialog)
  let pendingForm = null
  let confirmedForm = null
  dialog.querySelector('.confirm-cancel').addEventListener('click', () => {
    pendingForm = null
    dialog.open = false
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
    const prompt = form.getAttribute('onsubmit')?.match(/confirm\('([^']+)'\)/)?.[1]
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
      dialog.querySelector('.confirm-message').textContent = prompt
      dialog.open = true
    })
  }
}

const messages = [...document.querySelectorAll('.notice')].map((notice) => ({
  text: notice.textContent.trim(),
  error: notice.classList.contains('error'),
  element: notice,
}))
if (messages.length) {
  const toast = document.createElement('wa-toast')
  toast.setAttribute('placement', 'top-end')
  document.body.append(toast)
  customElements.whenDefined('wa-toast').then(() => {
    for (const message of messages) {
      toast.create(message.text, {
        variant: message.error ? 'danger' : 'success',
        duration: message.error ? 0 : 5000,
      })
      message.element.remove()
    }
  })
}

const upload = document.querySelector('input[type="file"][name="file"]')
if (upload) {
  Promise.all([
    import('filepond'),
    import('filepond-plugin-image-preview'),
    import('filepond-plugin-file-validate-type'),
    import('filepond-plugin-file-validate-size'),
  ]).then(([FilePond, preview, type, size]) => {
    FilePond.registerPlugin(preview.default, type.default, size.default)
    FilePond.create(upload, {
      storeAsFile: true,
      allowProcess: false,
      allowMultiple: false,
      acceptedFileTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxFileSize: '5MB',
      labelIdle: 'Drop an image or <span class="filepond--label-action">browse</span>',
    })
  })
}
