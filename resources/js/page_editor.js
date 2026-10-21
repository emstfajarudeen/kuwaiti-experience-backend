import Quill from 'quill'

const toolbar = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'link'],
  ['clean'],
]

for (const field of document.querySelectorAll('.rich-field')) {
  const textarea = field.querySelector('[data-rich-body]')
  const editor = field.querySelector('[data-rich-editor]')
  const format = field.querySelector('[data-rich-format]')
  if (!textarea || !editor || !format) continue

  const quill = new Quill(editor, {
    theme: 'snow',
    modules: { toolbar },
    formats: ['header', 'bold', 'italic', 'underline', 'list', 'blockquote', 'link'],
    placeholder: 'Write page content here…',
  })
  if (textarea.value) {
    if (textarea.dataset.format === 'html') {
      quill.clipboard.dangerouslyPasteHTML(textarea.value, 'silent')
    } else {
      quill.setText(textarea.value, 'silent')
    }
  }

  textarea.classList.add('rich-source-hidden')
  textarea.required = false
  editor.classList.add('is-ready')
  format.value = 'html'

  quill.on('text-change', () => {
    textarea.value = quill.getText().trim() ? quill.getSemanticHTML() : ''
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })

  textarea.closest('form')?.addEventListener('submit', (event) => {
    textarea.value = quill.getText().trim() ? quill.getSemanticHTML() : ''
    if (textarea.id === 'page-body-en' && !textarea.value) {
      event.preventDefault()
      quill.focus()
    }
  })
}
