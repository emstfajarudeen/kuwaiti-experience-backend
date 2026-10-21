import { test } from '@japa/runner'
import {
  hasPlaceholderPageCopy,
  normalizePageBody,
  pageBodyFormat,
} from '../../app/services/page_content_service.js'

test('Quill page HTML keeps headings, paragraphs and safe links while removing scripts', ({
  assert,
}) => {
  const body = normalizePageBody(
    '<h2>1. Acceptance of Terms</h2><p>Read our <a href="https://example.com">rules</a>.</p><script>alert(1)</script><p onclick="evil()">More</p><a href="javascript:alert(1)">bad link</a>',
    'html'
  )
  assert.include(body, '<h2>1. Acceptance of Terms</h2>')
  assert.include(body, '<a href="https://example.com">rules</a>')
  assert.notInclude(body, '<script')
  assert.notInclude(body, 'onclick')
  assert.notInclude(body, 'javascript:')
})

test('Page body validation rejects empty formatting and preserves plain text', ({ assert }) => {
  assert.throws(() => normalizePageBody('<p><br></p>', 'html'))
  assert.equal(normalizePageBody('  Plain page copy  ', 'plain_text'), 'Plain page copy')
  assert.equal(pageBodyFormat('unexpected'), 'plain_text')
  assert.isTrue(hasPlaceholderPageCopy('Draft demo content. Replace with approved copy.'))
})
