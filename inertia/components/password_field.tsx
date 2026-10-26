import { useState } from 'react'

type Props = {
  id: string
  label: string
  name: string
  autoComplete: string
  placeholder: string
  minLength?: number
}

export default function PasswordField({
  id,
  label,
  name,
  autoComplete,
  placeholder,
  minLength,
}: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-field tw:flex tw:flex-col tw:gap-1.5">
      <label htmlFor={id}>{label}</label>
      <div className="password-field-wrap tw:relative tw:flex tw:items-center">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={minLength}
          required
        />
        <button
          type="button"
          className="password-toggle-btn tw:absolute tw:right-3 tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-1 tw:text-[13px] tw:font-semibold tw:leading-none tw:text-brand-muted tw:hover:text-brand-ink"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}
