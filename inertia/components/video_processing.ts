/** Conversion state of the uploaded file, shown to admins. */
export function processingLabel(row: {
  processing_status: string
  processing_error: string | null
}) {
  if (row.processing_status === 'pending' || row.processing_status === 'processing')
    return {
      tone: 'tw:text-brand-gold',
      text: 'Converting for the app… It appears in the app once this finishes.',
    }
  if (row.processing_status === 'failed')
    return {
      tone: 'tw:text-red-700',
      text: `Conversion failed. Upload the video again.${row.processing_error ? ` (${row.processing_error})` : ''}`,
    }
  return null
}
