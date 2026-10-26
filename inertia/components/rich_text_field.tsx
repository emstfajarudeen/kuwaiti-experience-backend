import { useEffect, useRef } from 'react'

type Props = {
  id: string
  label: string
  name: string
  formatName: string
  value: string
  format: string
  rows: number
  required?: boolean
  rtl?: boolean
}

export default function RichTextField({
  id,
  label,
  name,
  formatName,
  value,
  format,
  rows,
  required = false,
  rtl = false,
}: Props) {
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const formatRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const source = sourceRef.current
    const editor = editorRef.current
    const formatInput = formatRef.current
    if (!source || !editor || !formatInput) return
    let disposed = false
    let submitHandler: ((event: SubmitEvent) => void) | undefined
    let toolbar: HTMLElement | null = null
    void import('quill').then(({ default: Quill }) => {
      if (disposed) return
      const quill = new Quill(editor, {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ header: [2, 3, false] }],
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'link'],
            ['clean'],
          ],
        },
        formats: ['header', 'bold', 'italic', 'underline', 'list', 'blockquote', 'link'],
        placeholder: 'Write page content here…',
      })
      if (value) {
        if (format === 'html') quill.clipboard.dangerouslyPasteHTML(value, 'silent')
        else quill.setText(value, 'silent')
      }
      source.classList.add('rich-source-hidden')
      source.required = false
      editor.classList.add('is-ready')
      formatInput.value = 'html'
      toolbar = editor.parentElement?.querySelector('.ql-toolbar') ?? null
      const sync = () => {
        source.value = quill.getText().trim() ? quill.getSemanticHTML() : ''
        source.dispatchEvent(new Event('input', { bubbles: true }))
      }
      quill.on('text-change', sync)
      submitHandler = (event) => {
        sync()
        if (required && !source.value) {
          event.preventDefault()
          quill.focus()
        }
      }
      source.closest('form')?.addEventListener('submit', submitHandler)
    })
    return () => {
      disposed = true
      if (submitHandler) source.closest('form')?.removeEventListener('submit', submitHandler)
      toolbar?.remove()
      if (editor) editor.innerHTML = ''
    }
  }, [value, format, required])
  return (
    <div
      className="rich-field tw:mt-2 tw:flex tw:flex-col tw:gap-2"
      dir={rtl ? 'rtl' : undefined}
      lang={rtl ? 'ar' : undefined}
    >
      <label htmlFor={id}>{label}</label>
      <input ref={formatRef} type="hidden" name={formatName} defaultValue={format} />
      <textarea
        ref={sourceRef}
        id={id}
        name={name}
        rows={rows}
        required={required}
        maxLength={50000}
        defaultValue={value}
      />
      <div
        ref={editorRef}
        className="rich-editor tw:min-h-[250px] tw:rounded-b-cms-sm tw:bg-white tw:text-[15px]"
        aria-label={`${rtl ? 'Arabic' : 'English'} page body editor`}
      />
    </div>
  )
}
