/** Red asterisk shown next to the label of a required field. */
export default function RequiredMark() {
  return (
    <span className="required-mark tw:text-red-700" style={{ color: '#9e2a2b' }} aria-hidden="true">
      {' '}
      *
    </span>
  )
}
