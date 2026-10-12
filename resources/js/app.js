import './admin_components.js'

for (const form of document.querySelectorAll('form.editor-grid, form.form-panel')) {
  let changed = false
  form.addEventListener('input', () => { changed = true })
  form.addEventListener('submit', () => { changed = false })
  window.addEventListener('beforeunload', (event) => {
    if (!changed) return
    event.preventDefault()
    event.returnValue = ''
  })
}
