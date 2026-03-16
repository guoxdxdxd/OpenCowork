export interface SelectFileTextSegment {
  type: 'text' | 'file'
  text: string
  raw: string
}

export interface SelectFileMentionQuery {
  start: number
  end: number
  query: string
}

const SELECT_FILE_TAG_RE = /<select-file>([\s\S]*?)<\/select-file>/gi
const SELECT_FILE_TAG_TEST_RE = /<select-file>[\s\S]*?<\/select-file>/i

function decodeTagText(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function encodeTagText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function createSelectFileTag(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').trim()
  if (!normalized) return ''
  return `<select-file>${encodeTagText(normalized)}</select-file>`
}

export function parseSelectFileText(text: string): SelectFileTextSegment[] {
  if (!text) return []

  const segments: SelectFileTextSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(SELECT_FILE_TAG_RE)) {
    const matchIndex = match.index ?? 0
    const raw = match[0] ?? ''
    const fileText = decodeTagText(match[1] ?? '').trim()

    if (matchIndex > lastIndex) {
      const plainText = text.slice(lastIndex, matchIndex)
      if (plainText) {
        segments.push({ type: 'text', text: plainText, raw: plainText })
      }
    }

    segments.push({
      type: 'file',
      text: fileText,
      raw
    })

    lastIndex = matchIndex + raw.length
  }

  if (lastIndex < text.length) {
    const plainText = text.slice(lastIndex)
    if (plainText) {
      segments.push({ type: 'text', text: plainText, raw: plainText })
    }
  }

  return segments
}

export function hasSelectFileTag(text: string): boolean {
  return SELECT_FILE_TAG_TEST_RE.test(text)
}

export function selectFileTextToPlainText(text: string): string {
  const segments = parseSelectFileText(text)
  if (segments.length === 0) return text
  return segments.map((segment) => segment.text).join('')
}

export function getSelectFileMentionQuery(
  text: string,
  cursor: number
): SelectFileMentionQuery | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length))
  let tokenStart = safeCursor

  while (tokenStart > 0) {
    const char = text[tokenStart - 1]
    if (/\s/.test(char)) break
    tokenStart -= 1
  }

  const token = text.slice(tokenStart, safeCursor)
  if (!token.startsWith('@')) return null
  if (token.includes('<') || token.includes('>')) return null

  return {
    start: tokenStart,
    end: safeCursor,
    query: token.slice(1)
  }
}
