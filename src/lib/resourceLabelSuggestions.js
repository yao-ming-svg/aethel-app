const LABEL_KEYWORD_HINTS = {
  articles: ['article', 'articles', 'journal', 'paper', 'papers', 'publication', 'research'],
  notes: ['handout', 'handouts', 'lecture', 'lectures', 'note', 'notes', 'outline', 'slide', 'slides', 'summary'],
  practice: [
    'assignment',
    'exam',
    'final',
    'homework',
    'hw',
    'midterm',
    'practice',
    'problem',
    'problems',
    'quiz',
    'review',
    'solution',
    'solutions',
    'test',
    'worksheet',
    'worksheets',
  ],
  textbooks: ['book', 'chapter', 'chap', 'ch', 'reading', 'readings', 'textbook', 'textbooks'],
  videos: ['lecturecast', 'recording', 'video', 'videos'],
  websites: ['link', 'links', 'site', 'url', 'web', 'website', 'websites'],
}

const COURSE_STOPWORDS = new Set(['and', 'class', 'course', 'for', 'intro', 'introduction', 'of', 'the', 'to'])

function stripExtension(name) {
  return String(name || '').replace(/\.[^.]+$/, '')
}

function textInfo(value) {
  const normalized = stripExtension(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const tokens = normalized.split(/\s+/).filter(Boolean)
  return {
    normalized,
    compact: normalized.replace(/\s+/g, ''),
    tokens,
    tokenSet: new Set(tokens),
  }
}

function acronymFor(tokens) {
  return tokens
    .filter((token) => /^[a-z]/.test(token))
    .map((token) => token[0])
    .join('')
}

function scoreTokenMatch(fileInfo, token) {
  if (fileInfo.tokenSet.has(token)) {
    if (/^\d+$/.test(token)) return 8
    if (token.length <= 2) return 12
    return 25
  }

  if (token.length < 4) return 0

  for (const fileToken of fileInfo.tokens) {
    if (fileToken.length < 3) continue
    if (token.startsWith(fileToken) || fileToken.startsWith(token)) return 25
  }

  return 0
}

function scoreOptionMatch(fileInfo, option, type) {
  const optionInfo = textInfo(option)
  if (!optionInfo.normalized) return 0

  let score = 0
  const optionTokens = optionInfo.tokens
  const meaningfulTokens = optionTokens.filter((token) => token.length > 1 && !COURSE_STOPWORDS.has(token))

  if (fileInfo.normalized.includes(optionInfo.normalized)) score += 100 + optionTokens.length * 8
  if (optionInfo.compact.length >= 3 && fileInfo.compact.includes(optionInfo.compact)) score += 90

  const acronym = acronymFor(optionTokens)
  if (type === 'course' && acronym.length >= 2 && fileInfo.compact.includes(acronym)) score += 50

  for (const token of meaningfulTokens) {
    score += scoreTokenMatch(fileInfo, token)
  }

  if (type === 'label') {
    const hints = LABEL_KEYWORD_HINTS[optionInfo.normalized] || []
    for (const hint of hints) {
      if (fileInfo.tokenSet.has(hint) || (hint.length > 2 && fileInfo.normalized.includes(hint))) score += 70
    }
  }

  return score
}

function bestFileNameMatch(fileName, options, type) {
  const fileInfo = textInfo(fileName)
  const threshold = 25
  let best = { value: '', score: 0 }

  for (const option of options || []) {
    const score = scoreOptionMatch(fileInfo, option, type)
    if (score > best.score) best = { value: option, score }
  }

  return best.score >= threshold ? best.value : ''
}

export function suggestResourceLabelsFromFileName(fileName, labelOptions, courseOptions) {
  return {
    label: bestFileNameMatch(fileName, labelOptions, 'label'),
    courseLabel: bestFileNameMatch(fileName, courseOptions, 'course'),
  }
}

export function formatResourceLabelSuggestion({ label, courseLabel }) {
  const suggestions = []
  if (label) suggestions.push(`label "${label}"`)
  if (courseLabel) suggestions.push(`course "${courseLabel}"`)

  return suggestions.length > 0
    ? `Matched ${suggestions.join(' and ')} from the file name.`
    : 'No matching saved label or course was found from the file name.'
}
