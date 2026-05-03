/** Vite middleware: POST /api/chat — keeps OPENAI_API_KEY off the client. */

const DEFAULT_MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT = `You are Aethel, a study assistant inside a student productivity app. Be concise, accurate, and encouraging.

When outlining activities, modules, or study plans, use GitHub-flavored structure so the app can format it well:
- Use ### for section titles (e.g. ### Study Activities:).
- Use a bullet list; for each major category use a line like - **Category Name:** then indented nested bullets for items under it (two spaces before - for each nesting level).
- Use **double asterisks** for category labels and subheaders in lists.

When the user attaches document text (blocks labeled [Document: …]), base your answer on that content and cite the filename if helpful.

When the user asks for a website or internet resource, provide at least two to four links relating to the resource and a brief description of the resource. Try to prioritize free and open source resources.

If the user asks for something harmful or unrelated to learning, decline briefly and offer study-related help instead.`

async function readRequestBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 100000) }))
}

async function handleChat(req, res, apiKey, defaultModel) {
  if (!apiKey) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error:
          'OpenAI API key is not configured. Create a .env file in the project root with OPENAI_API_KEY=sk-...',
      }),
    )
    return
  }

  let body
  try {
    body = JSON.parse((await readRequestBody(req)) || '{}')
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return
  }

  const clientMessages = sanitizeMessages(body.messages)
  if (clientMessages.length === 0) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Provide a non-empty messages array with user or assistant entries.' }))
    return
  }

  const model = typeof body.model === 'string' && body.model ? body.model : defaultModel

  const contextSection =
    typeof body.context === 'string' && body.context.trim()
      ? `\n\n---\n\nStudent profile:\n${body.context.trim().slice(0, 30000)}`
      : ''
  const systemContent = SYSTEM_PROMPT + contextSection

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemContent }, ...clientMessages],
    }),
  })

  const data = await upstream.json().catch(() => ({}))

  if (!upstream.ok) {
    const msg = data?.error?.message || upstream.statusText || 'OpenAI request failed'
    res.statusCode = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: msg }))
    return
  }

  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string') {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Unexpected response from OpenAI.' }))
    return
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ message: text }))
}

function attachMiddleware(server, apiKey, model) {
  server.middlewares.use((req, res, next) => {
    const pathname = req.url?.split('?')[0] ?? ''
    if (pathname !== '/api/chat' || req.method !== 'POST') {
      next()
      return
    }

    handleChat(req, res, apiKey, model).catch((err) => {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: err?.message || 'Server error' }))
    })
  })
}

/**
 * @param {{ apiKey?: string; model?: string }} options
 */
export function openaiApiPlugin(options = {}) {
  const apiKey = options.apiKey || ''
  const model = options.model || DEFAULT_MODEL

  return {
    name: 'openai-api',
    configureServer(server) {
      attachMiddleware(server, apiKey, model)
    },
    configurePreviewServer(server) {
      attachMiddleware(server, apiKey, model)
    },
  }
}
