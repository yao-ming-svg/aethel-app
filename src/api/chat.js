/**
 * @typedef {{ name: string, text: string }} ChatDocumentBlock
 */

/**
 * @typedef {{ role: 'user' | 'assistant', content: string, documentBlocks?: ChatDocumentBlock[] }} ChatMessage
 */

const MAX_API_CHARS = 100_000

/**
 * @param {ChatMessage} m
 * @returns {{ role: 'user' | 'assistant', content: string }}
 */
export function messageToApiPayload(m) {
  if (m.role !== 'user' || !m.documentBlocks?.length) {
    return { role: m.role, content: m.content }
  }

  const blocks = m.documentBlocks
    .map((d) => `[Document: ${d.name}]\n${d.text}`)
    .join('\n\n---\n\n')

  const question =
    m.content.trim() ||
    'Review the attached document(s) and provide a concise summary plus any study-relevant highlights.'

  const content = `${blocks}\n\n---\n\nQuestion:\n${question}`
  return { role: 'user', content: content.length > MAX_API_CHARS ? content.slice(0, MAX_API_CHARS) : content }
}

/**
 * @param {ChatMessage[]} messages
 * @param {string} [context]
 * @returns {Promise<string>}
 */
export async function sendChat(messages, context = '') {
  const apiMessages = messages.map(messageToApiPayload)
  const body = { messages: apiMessages }
  if (context) body.context = context

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  let data = {}
  try {
    data = await res.json()
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const err = typeof data.error === 'string' ? data.error : `Request failed (${res.status})`
    throw new Error(err)
  }

  if (typeof data.message !== 'string') {
    throw new Error('Invalid response from assistant.')
  }

  return data.message
}
