/** Client-side text extraction for AI chat attachments (PDF / DOCX only). */

/** Use on `<input type="file" accept={…}>` so the picker prefers PDF / Word only. */
export const ACCEPT_PDF_DOCX =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const ALLOWED_EXT = ['.pdf', '.docx']
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_TEXT_CHARS = 14_000

function extensionOf(filename) {
  const i = filename.lastIndexOf('.')
  return i === -1 ? '' : filename.slice(i).toLowerCase()
}

/**
 * @param {File} file
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateChatFile(file) {
  const name = file.name || ''
  const ext = extensionOf(name)

  if (!ALLOWED_EXT.includes(ext)) {
    return { ok: false, error: 'Only PDF (.pdf) and Word (.docx) files are allowed.' }
  }

  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'File is too large (max 15 MB).' }
  }

  if (file.type && ALLOWED_MIME.has(file.type)) {
    return { ok: true }
  }

  if (!file.type || file.type === '' || file.type === 'application/octet-stream') {
    return { ok: true }
  }

  if (ext === '.pdf' && file.type !== 'application/pdf') {
    return { ok: false, error: 'This file does not look like a valid PDF.' }
  }

  if (ext === '.docx' && !ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: 'This file does not look like a valid Word document (.docx).' }
  }

  return { ok: true }
}

function truncate(text) {
  const t = text.replace(/\r\n/g, '\n').trim()
  if (t.length <= MAX_TEXT_CHARS) return t
  return `${t.slice(0, MAX_TEXT_CHARS)}\n\n[…truncated after ${MAX_TEXT_CHARS} characters]`
}

async function extractPdfText(arrayBuffer) {
  const pdfjsLib = await import('pdfjs-dist')
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const parts = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
      .join(' ')
    parts.push(line)
  }
  return parts.join('\n').trim()
}

async function extractDocxText(arrayBuffer) {
  const mammoth = await import('mammoth')
  const { value, messages } = await mammoth.extractRawText({ arrayBuffer })
  if (messages?.length && messages.some((m) => m.type === 'error')) {
    const err = messages.find((m) => m.type === 'error')
    if (err?.message) throw new Error(err.message)
  }
  return (value || '').trim()
}

/**
 * @param {File} file
 * @returns {Promise<{ name: string, text: string }>}
 */
export async function extractDocumentText(file) {
  const v = validateChatFile(file)
  if (!v.ok) throw new Error(v.error)

  const name = file.name || 'document'
  const ext = extensionOf(name)
  const buf = await file.arrayBuffer()

  let raw
  if (ext === '.pdf') {
    try {
      raw = await extractPdfText(buf)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not read PDF.'
      throw new Error(msg.includes('password') ? 'This PDF appears to be password-protected.' : msg)
    }
  } else {
    try {
      raw = await extractDocxText(buf)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Could not read Word document.')
    }
  }

  if (!raw) {
    throw new Error('No readable text was found in this file.')
  }

  return { name, text: truncate(raw) }
}
