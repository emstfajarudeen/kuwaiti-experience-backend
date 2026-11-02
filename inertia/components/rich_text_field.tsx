import { useEffect, useRef } from 'react'

type Props = {
  id: string
  label: string
  name: string
  formatName: string
  value: string
  format: string
  required?: boolean
  rtl?: boolean
  error?: string | null
  hint?: string
  onChange?: (value: string) => void
}

export default function RichTextField({
  id,
  label,
  name,
  formatName,
  value,
  format,
  required = false,
  rtl = false,
  error,
  hint,
  onChange,
}: Props) {
  const sourceRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const formatRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    const source = sourceRef.current
    const editor = editorRef.current
    const formatInput = formatRef.current
    if (!source || !editor || !formatInput) return
    let disposed = false
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
      const editable = editor.querySelector('[contenteditable="true"]')
      editable?.setAttribute('aria-labelledby', `${id}-label`)
      editable?.setAttribute('aria-required', String(required))
      if (error) {
        editable?.setAttribute('aria-invalid', 'true')
        editable?.setAttribute('aria-describedby', `${id}-error`)
      }
      editor.classList.add('is-ready')
      formatInput.value = 'html'
      toolbar = editor.parentElement?.querySelector('.ql-toolbar') ?? null
      const sync = () => {
        source.value = quill.getText().trim() ? quill.getSemanticHTML() : ''
        source.dispatchEvent(new Event('input', { bubbles: true }))
        onChangeRef.current?.(source.value)
      }
      quill.on('text-change', sync)
    })
    return () => {
      disposed = true
      toolbar?.remove()
      if (editor) editor.innerHTML = ''
    }
  }, [value, format, required])
  useEffect(() => {
    const editable = editorRef.current?.querySelector('[contenteditable="true"]')
    if (!editable) return
    if (error) {
      editable.setAttribute('aria-invalid', 'true')
      editable.setAttribute('aria-describedby', `${id}-error`)
    } else {
      editable.removeAttribute('aria-invalid')
      editable.removeAttribute('aria-describedby')
    }
  }, [error, id])
  return (
    <div
      className="rich-field tw:mt-2 tw:flex tw:flex-col tw:gap-2"
      dir={rtl ? 'rtl' : undefined}
      lang={rtl ? 'ar' : undefined}
    >
      <label id={`${id}-label`}>
        {label}
        {required ? ' *' : ''}
      </label>
      <input ref={formatRef} type="hidden" name={formatName} defaultValue={format} />
      <input ref={sourceRef} type="hidden" id={`${id}-source`} name={name} defaultValue={value} />
      {hint && <p className="tw:m-0 tw:text-sm tw:text-brand-muted">{hint}</p>}
      <div
        ref={editorRef}
        id={id}
        className="rich-editor tw:min-h-[250px] tw:rounded-b-cms-sm tw:bg-white tw:text-[15px]"
        aria-label={`${rtl ? 'Arabic' : 'English'} page body editor`}
        aria-invalid={error ? true : undefined}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="tw:m-0 tw:text-sm tw:text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
