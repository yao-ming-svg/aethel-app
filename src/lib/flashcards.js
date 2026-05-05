function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeParsedCards(cards) {
  return (cards || [])
    .map((card) => {
      const front = cleanText(card.front ?? card.question ?? card.prompt ?? card.term)
      const answer = cleanText(card.answer ?? card.back ?? card.definition ?? card.explanation)
      return front && answer ? { id: crypto.randomUUID(), front, answer } : null
    })
    .filter(Boolean)
}

function parseJsonFlashcards(text) {
  const candidates = [text]
  const fencedBlocks = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)

  for (const block of fencedBlocks) {
    candidates.push(block[1])
  }

  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1))
  }

  const arrayStart = text.indexOf('[')
  const arrayEnd = text.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    candidates.push(text.slice(arrayStart, arrayEnd + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const cards = Array.isArray(parsed) ? parsed : parsed.cards || parsed.flashcards
      const normalized = normalizeParsedCards(cards)
      if (normalized.length > 0) return normalized
    } catch {
      /* try the next candidate */
    }
  }

  return []
}

function parseTaggedFlashcards(text) {
  const pattern =
    /Flash\s*Card(?:Number)?\s*(?:\d+)?\s*#?\s*:?\s*<front>\s*([\s\S]*?)<\/front>\s*<(?:answer|back)>\s*([\s\S]*?)(?:<\/(?:answer|back)>|<(?:answer|back)>|(?=Flash\s*Card|$))/gi
  const cards = []
  let match = pattern.exec(text)

  while (match) {
    const front = cleanText(match[1])
    const answer = cleanText(match[2])
    if (front && answer) {
      cards.push({ id: crypto.randomUUID(), front, answer })
    }
    match = pattern.exec(text)
  }

  return cards
}

function parseLinePairFlashcards(text) {
  const cards = []
  let pendingFront = ''

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine
      .trim()
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/\*\*/g, '')

    if (!line) continue

    const inline = line.match(/^(?:front|question|q)\s*[:-]\s*(.*?)\s+(?:answer|back|a)\s*[:-]\s*(.+)$/i)
    if (inline) {
      cards.push({ id: crypto.randomUUID(), front: cleanText(inline[1]), answer: cleanText(inline[2]) })
      pendingFront = ''
      continue
    }

    const front = line.match(/^(?:front|question|q|prompt)\s*[:-]\s*(.+)$/i)
    if (front) {
      pendingFront = cleanText(front[1])
      continue
    }

    const answer = line.match(/^(?:answer|back|a|definition|explanation)\s*[:-]\s*(.+)$/i)
    if (answer && pendingFront) {
      cards.push({ id: crypto.randomUUID(), front: pendingFront, answer: cleanText(answer[1]) })
      pendingFront = ''
    }
  }

  return cards.filter((card) => card.front && card.answer)
}

export function parseFlashcards(raw) {
  const text = String(raw ?? '')
  const parsed = [
    ...parseJsonFlashcards(text),
    ...parseTaggedFlashcards(text),
    ...parseLinePairFlashcards(text),
  ]
  const seen = new Set()

  return parsed.filter((card) => {
    const key = `${card.front}\n${card.answer}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function parseFlashcardsFromJson(raw) {
  const cards = parseJsonFlashcards(String(raw ?? ''))
  if (cards.length > 0) return cards

  return parseFlashcards(raw)
}

export function createFlashcardJsonPrompt(question) {
  const base = String(question || '').trim() || 'Create flashcards from the attached resource.'
  return `${base}

Create a study flashcard set from the provided document content. Return only valid JSON in this exact shape:
{"cards":[{"front":"question or term","answer":"answer or explanation"}]}

Rules:
- Include 8 to 20 cards when enough source material is available.
- Keep each front concise and each answer clear.
- Do not include markdown, code fences, commentary, or any text outside the JSON object.
- If the source has very little content, create as many useful cards as the content supports.`
}

export function looksLikeFlashcardRequest(value) {
  const text = String(value || '').toLowerCase()
  return (
    text.includes('flashcard') ||
    text.includes('flash card') ||
    text.includes('flashcards') ||
    text.includes('flash cards')
  )
}

export function fallbackFlashcardsFromText(raw, maxCards = 12) {
  const normalized = String(raw || '').replace(/\s+/g, ' ').trim()
  let snippets = (normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 50)
    .map((sentence) => (sentence.length > 260 ? `${sentence.slice(0, 257).trim()}...` : sentence))
    .slice(0, maxCards)

  if (snippets.length === 0 && normalized.length >= 50) {
    const words = normalized.split(' ')
    snippets = []
    for (let index = 0; index < words.length && snippets.length < maxCards; index += 35) {
      const chunk = words.slice(index, index + 35).join(' ').trim()
      if (chunk.length >= 50) snippets.push(chunk.length > 260 ? `${chunk.slice(0, 257).trim()}...` : chunk)
    }
  }

  return snippets.map((snippet, index) => ({
    id: crypto.randomUUID(),
    front: `What is a key point ${index + 1} from this resource?`,
    answer: snippet,
  }))
}

export function fallbackFlashcardsFromDocuments(documentBlocks, maxCards = 12) {
  const combined = (documentBlocks || []).map((block) => block.text || '').join(' ')
  return fallbackFlashcardsFromText(combined, maxCards)
}

export function pickFlashcardSourceName(attachments, resources) {
  const sourceAttachment = attachments.find((attachment) => attachment.sourceResourceId) || attachments[0]
  const sourceResource = resources.find((resource) => resource.id === sourceAttachment?.sourceResourceId)
  const sourceName = sourceResource?.name || sourceAttachment?.name || 'AI flashcards'

  return {
    sourceAttachment,
    sourceResource,
    sourceName,
  }
}

export function serializeFlashcards(cards) {
  return (cards || [])
    .map((card, index) => {
      const front = cleanText(card.front)
      const answer = cleanText(card.answer)
      return `FlashCard${index + 1}#: <front>${front}</front><answer>${answer}</answer>`
    })
    .join('\n')
}

export function normalizeFlashcards(cards) {
  return (cards || [])
    .map((card) => ({
      id: card.id || crypto.randomUUID(),
      front: cleanText(card.front),
      answer: cleanText(card.answer),
    }))
    .filter((card) => card.front && card.answer)
}
