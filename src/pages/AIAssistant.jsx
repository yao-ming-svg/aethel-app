import { useEffect, useRef, useState } from 'react'
import ChatMarkdown from '../components/ChatMarkdown'
import { useResources } from '../context/ResourcesContext'
import { useCourses } from '../context/CoursesContext'
import { useAuth } from '../context/AuthContext'
import { sendChat } from '../api/chat'
import { ACCEPT_PDF_DOCX, extractDocumentText, validateChatFile } from '../lib/documentExtract'
import { getResourceBlob } from '../lib/resourceBlobStore'
import { formatResourceLabelSuggestion, suggestResourceLabelsFromFileName } from '../lib/resourceLabelSuggestions'
import {
  createFlashcardJsonPrompt,
  fallbackFlashcardsFromDocuments,
  looksLikeFlashcardRequest,
  parseFlashcardsFromJson,
  pickFlashcardSourceName,
} from '../lib/flashcards'
import '../App.css'
import styles from './AIAssistant.module.css'

const features = [
  { icon: '📅', title: 'Study Schedule Generator', desc: 'Generate a personalized study schedule based on your deadlines and availability.' },
  { icon: '📄', title: 'Document Summarizer',       desc: 'Upload PDFs or notes and get concise, exam-focused summaries.' },
  { icon: '🔍', title: 'Resource Recommender',      desc: 'Get AI-curated textbooks, videos, and articles tailored to your subjects.' },
  { icon: 'FC', title: 'Flashcard Builder',            desc: 'Create class-ready flashcards from a selected resource or attachment.' },
]

const TRY_PROMPTS = {
  'Study Schedule Generator': 'Based on my courses and upcoming assignments, create a study schedule for this week. I can study about 2 hours on weekdays and 4 hours on weekends.',
  'Document Summarizer': 'Summarize the main ideas I should memorize for an exam, as bullet points with one-line explanations.',
  'Resource Recommender': 'Based on my courses, recommend free online resources (videos or articles) for each subject, with a one-line note for each.',
  'Flashcard Builder': 'Create flashcards from the attached resource.',
}

const MAX_ATTACHMENTS = 4

const MAX_RESOURCE_CONTEXT_CHARS = 18000
const PER_RESOURCE_CHARS = 3500

function buildStudentContext(courses, resourceTexts) {
  const lines = []

  if (courses.length) {
    lines.push('The student is enrolled in the following courses:')

    for (const course of courses) {
      const days = (course.schedule || [])
        .map((s) => {
          const time = s.startTime
            ? ` ${s.startTime}${s.endTime ? '–' + s.endTime : ''}`
            : ''
          return s.day + time
        })
        .join(', ')

      lines.push(
        `\n**${course.name}**${course.instructor ? ` (${course.instructor})` : ''}${days ? ' — meets ' + days : ''}`,
      )

      const tasks = course.tasks || []
      const pending = tasks
        .filter((t) => t.status !== 'completed')
        .sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return a.dueDate.localeCompare(b.dueDate)
        })
      const done = tasks.filter((t) => t.status === 'completed')

      if (pending.length) {
        lines.push('  Pending assignments:')
        for (const t of pending) {
          const due = t.dueDate
            ? ` — due ${t.dueDate}${t.dueTime ? ' at ' + t.dueTime : ''}`
            : ''
          const desc = t.description ? ` (${t.description.slice(0, 80)})` : ''
          lines.push(`  - [${t.type || 'assignment'}] ${t.title}${due}${desc}`)
        }
      }
      if (done.length) {
        lines.push(`  Completed: ${done.map((t) => t.title).join(', ')}`)
      }
      if (!tasks.length) {
        lines.push('  No assignments yet.')
      }
    }
  }

  if (resourceTexts && resourceTexts.size > 0) {
    lines.push('\n\n---\n\nThe student has uploaded the following study documents (use these to answer questions about their coursework):')
    let totalChars = 0
    for (const { name, text } of resourceTexts.values()) {
      if (totalChars >= MAX_RESOURCE_CONTEXT_CHARS) {
        lines.push('\n[Additional documents omitted — student can attach them directly to a message]')
        break
      }
      const snippet = text.slice(0, PER_RESOURCE_CHARS)
      lines.push(`\n[Document: ${name}]\n${snippet}${text.length > PER_RESOURCE_CHARS ? '\n[…truncated]' : ''}`)
      totalChars += snippet.length
    }
  }

  return lines.join('\n')
}

function newId() {
  return crypto.randomUUID()
}

function withoutExtension(name) {
  return String(name || 'Resource').replace(/\.[^.]+$/, '')
}

export default function AIAssistant() {
  const { user } = useAuth()
  const { resources, labelPresets, courseLabels, addResource, getResourceFile, addFlashcardSet } = useResources()
  const { courses } = useCourses()
  const [resourceTexts, setResourceTexts] = useState(new Map())
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pendingAttachments, setPendingAttachments] = useState([])
  const [extracting, setExtracting] = useState(false)
  const [resourcePrompt, setResourcePrompt] = useState(null)
  const [attachmentChoiceOpen, setAttachmentChoiceOpen] = useState(false)
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false)
  const [attachingResourceId, setAttachingResourceId] = useState(null)
  const [flashcardMode, setFlashcardMode] = useState(false)
  const [notice, setNotice] = useState(null)
  const endRef = useRef(null)
  const fileInputRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
  }, [input])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    async function extractAll() {
      const next = new Map()

      // Saved resources (Resources page)
      for (const r of resources) {
        if (cancelled) return
        try {
          const result = await getResourceFile(r.id)
          if (!result.ok) continue
          const { name, text } = await extractDocumentText(result.file)
          next.set(r.id, { name, text })
        } catch { /* skip unreadable */ }
      }

      // Course materials and task materials
      for (const course of courses) {
        for (const m of (course.materials || [])) {
          if (cancelled) return
          try {
            const buf = await getResourceBlob(user.id, m.id)
            if (!buf) continue
            const file = new File([buf], m.name, { type: m.type || 'application/octet-stream' })
            const { name, text } = await extractDocumentText(file)
            next.set(m.id, { name, text })
          } catch { /* skip unreadable */ }
        }
        for (const task of (course.tasks || [])) {
          for (const m of (task.materials || [])) {
            if (cancelled) return
            try {
              const buf = await getResourceBlob(user.id, m.id)
              if (!buf) continue
              const file = new File([buf], m.name, { type: m.type || 'application/octet-stream' })
              const { name, text } = await extractDocumentText(file)
              next.set(m.id, { name, text })
            } catch { /* skip unreadable */ }
          }
        }
      }

      if (!cancelled) setResourceTexts(next)
    }

    extractAll()
    return () => { cancelled = true }
  }, [resources, courses, getResourceFile, user?.id])

  async function handleSend() {
    const question = input.trim()
    if ((!question && pendingAttachments.length === 0) || loading) return

    setError(null)
    setNotice(null)
    setInput('')
    const sentAttachments = pendingAttachments
    const shouldCreateFlashcards = flashcardMode || looksLikeFlashcardRequest(question)

    const documentBlocks =
      sentAttachments.length > 0
        ? sentAttachments.map(({ name, text }) => ({ name, text }))
        : undefined

    const userMsg = {
      role: 'user',
      content: question,
      ...(documentBlocks ? { documentBlocks } : {}),
    }

    setPendingAttachments([])
    const next = [...messages, userMsg]
    const modelMsg = shouldCreateFlashcards
      ? {
          ...userMsg,
          content: createFlashcardJsonPrompt(question),
        }
      : userMsg
    const modelMessages = [...messages, modelMsg]
    setMessages(next)
    setLoading(true)

    try {
      const reply = await sendChat(modelMessages, buildStudentContext(courses, resourceTexts))
      if (shouldCreateFlashcards) {
        let cards = parseFlashcardsFromJson(reply)
        if (cards.length === 0 && documentBlocks?.length) {
          cards = fallbackFlashcardsFromDocuments(documentBlocks)
        }

        if (cards.length > 0) {
          const { sourceAttachment, sourceResource, sourceName } = pickFlashcardSourceName(sentAttachments, resources)
          const setName = `${withoutExtension(sourceName)} flashcards`
          const saved = addFlashcardSet({
            name: setName,
            courseLabel: sourceResource?.courseLabel || null,
            cards,
            sourceResourceId: sourceResource?.id || sourceAttachment?.sourceResourceId || null,
            sourceResourceName: sourceName,
          })

          if (!saved.ok) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `I created a flashcard set, but I could not save it to Resources: ${saved.error}`,
              },
            ])
            return
          }

          const cardWord = cards.length === 1 ? 'card' : 'cards'
          const sourceLine = sourceAttachment ? ` from ${sourceName}` : ''
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `Done - I created "${setName}" with ${cards.length} ${cardWord}${sourceLine}. It is ready to study in the Resources tab.`,
            },
          ])
          setNotice('Flashcard set created in Resources.')
          return
        }

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              'I could not create a flashcard set from that response. Try attaching a specific resource and asking me to make flashcards from it.',
          },
        ])
        return
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setMessages((prev) => prev.slice(0, -1))
      setInput(question)
      if (documentBlocks?.length) {
        setPendingAttachments(sentAttachments)
      }
    } finally {
      setLoading(false)
    }
  }

  function handleTry(title) {
    const prompt = TRY_PROMPTS[title]
    if (prompt) setInput(prompt)
    setFlashcardMode(title === 'Flashcard Builder')
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function removePending(id) {
    setPendingAttachments((list) => list.filter((a) => a.id !== id))
  }

  function askSaveToResources(fileName, suggestion) {
    return new Promise((resolve) => {
      setResourcePrompt({ fileName, suggestion, resolve })
    })
  }

  function answerResourcePrompt(shouldSave) {
    const resolve = resourcePrompt?.resolve
    setResourcePrompt(null)
    resolve?.(shouldSave)
  }

  function openAttachmentChoice() {
    setError(null)
    setAttachmentChoiceOpen(true)
  }

  function chooseComputerUpload() {
    setAttachmentChoiceOpen(false)
    fileInputRef.current?.click()
  }

  function chooseSavedResource() {
    setAttachmentChoiceOpen(false)
    setResourcePickerOpen(true)
  }

  async function attachSavedResource(resource) {
    if (pendingAttachments.some((a) => a.sourceResourceId === resource.id)) {
      return
    }

    if (pendingAttachments.length >= MAX_ATTACHMENTS) {
      setError(`You can attach at most ${MAX_ATTACHMENTS} files at once.`)
      return
    }

    setError(null)
    setExtracting(true)
    setAttachingResourceId(resource.id)
    try {
      const result = await getResourceFile(resource.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const { name, text } = await extractDocumentText(result.file)
      setPendingAttachments((prev) => [
        ...prev,
        { id: newId(), name, text, sourceResourceId: resource.id },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that resource.')
    } finally {
      setAttachingResourceId(null)
      setExtracting(false)
    }
  }

  async function onFilesChosen(e) {
    const files = e.target.files
    if (!files?.length) return

    setError(null)
    const list = Array.from(files)
    e.target.value = ''

    let added = 0
    for (const file of list) {
      if (pendingAttachments.length + added >= MAX_ATTACHMENTS) {
        setError(`You can attach at most ${MAX_ATTACHMENTS} files at once.`)
        break
      }

      const check = validateChatFile(file)
      if (!check.ok) {
        setError(check.error)
        continue
      }

      setExtracting(true)
      try {
        const { name, text } = await extractDocumentText(file)
        const attachmentId = newId()
        setPendingAttachments((prev) => [...prev, { id: attachmentId, name, text }])
        added += 1

        const suggestion = suggestResourceLabelsFromFileName(name, labelPresets, courseLabels)
        const saveToResources = await askSaveToResources(name, suggestion)
        if (saveToResources) {
          const saved = await addResource({
            file,
            label: suggestion.label || null,
            courseLabel: suggestion.courseLabel || null,
          })
          if (!saved.ok) {
            setError(`Attached for chat, but could not save to Resources: ${saved.error}`)
          } else {
            setPendingAttachments((prev) =>
              prev.map((attachment) =>
                attachment.id === attachmentId
                  ? { ...attachment, sourceResourceId: saved.id }
                  : attachment,
              ),
            )
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that file.')
      } finally {
        setExtracting(false)
      }
    }
  }

  const canSend = (input.trim().length > 0 || pendingAttachments.length > 0) && !loading && !extracting
  const attachedResourceIds = new Set(
    pendingAttachments.map((a) => a.sourceResourceId).filter(Boolean),
  )

  return (
    <div className="page">
      <div className="page-header">
        <h1>AI Assistant</h1>
        <p>Your AI-powered study companion. Ask questions, get a schedule, or summarize notes.</p>
      </div>

      <div className="card">
        <h2 className={styles.chatTitle}>Chat with AI</h2>

        {error && (
          <div className={styles.chatError} role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div className={styles.chatNotice} role="status">
            {notice}
          </div>
        )}

        <div className={`${styles.chatWindow} ${messages.length > 0 ? styles.chatWindowActive : ''}`}>
          {messages.length === 0 ? (
            <div className={styles.chatEmpty}>
              <p>Start a conversation with the AI assistant.</p>
              <p style={{ marginTop: 6, fontSize: 12 }}>
                Try: &quot;Create a study schedule for my Math exam on Friday&quot; or attach a PDF / Word file (📎).
              </p>
            </div>
          ) : (
            <ul className={styles.messageList}>
              {messages.map((m, i) => (
                <li
                  key={`${i}-${m.role}`}
                  className={m.role === 'user' ? styles.msgUser : styles.msgAssistant}
                >
                  <span className={styles.msgLabel}>{m.role === 'user' ? 'You' : 'Aethel'}</span>
                  <div className={styles.msgBody}>
                    {m.role === 'assistant' ? (
                      <ChatMarkdown>{m.content}</ChatMarkdown>
                    ) : (
                      <>
                        {m.documentBlocks?.length > 0 && (
                          <div className={styles.attachmentTags}>
                            {m.documentBlocks.map((d, di) => (
                              <span key={`${di}-${d.name}`} className={styles.attachmentTag} title={d.name}>
                                📄 {d.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {m.content ? (
                          <span className={styles.userPlain}>{m.content}</span>
                        ) : m.documentBlocks?.length ? (
                          <span className={styles.userPlainMuted}>(Attached documents only)</span>
                        ) : null}
                      </>
                    )}
                  </div>
                </li>
              ))}
              {loading && (
                <li className={styles.msgAssistant}>
                  <span className={styles.msgLabel}>Aethel</span>
                  <div className={styles.msgBodyMuted} aria-hidden>
                    <span className={styles.typingDots}>
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} />
                    </span>
                  </div>
                </li>
              )}
              <li ref={endRef} aria-hidden className={styles.scrollAnchor} />
            </ul>
          )}
        </div>

        {pendingAttachments.length > 0 && (
          <div className={styles.pendingAttachments} aria-label="Files to send with next message">
            {pendingAttachments.map((a) => (
              <span key={a.id} className={styles.pendingChip}>
                <span className={styles.pendingChipName} title={a.name}>
                  📄 {a.name}
                </span>
                <button
                  type="button"
                  className={styles.pendingChipRemove}
                  onClick={() => removePending(a.id)}
                  aria-label={`Remove ${a.name}`}
                  disabled={loading || extracting}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <label className={styles.flashcardToggle}>
          <input
            type="checkbox"
            checked={flashcardMode}
            onChange={(e) => setFlashcardMode(e.target.checked)}
            disabled={loading || extracting}
          />
          <span>Create flashcards from the next message</span>
        </label>

        <div className={styles.inputRow}>
          <input
            ref={fileInputRef}
            type="file"
            className={styles.fileInputHidden}
            accept={ACCEPT_PDF_DOCX}
            title="PDF or Word (.docx) only"
            multiple
            onChange={onFilesChosen}
            aria-hidden
            tabIndex={-1}
          />
          <div className={styles.chatInputWrap}>
            {loading && (
              <div className={styles.chatInputLoadingOverlay} aria-live="polite" aria-busy="true">
                <span className={styles.chatInputLoadingText}>Thinking</span>
                <span className={styles.chatInputLoadingDots} aria-hidden>
                  <span className={styles.chatInputLoadingDot} />
                  <span className={styles.chatInputLoadingDot} />
                  <span className={styles.chatInputLoadingDot} />
                </span>
              </div>
            )}
            <textarea
              ref={inputRef}
              className={`${styles.chatInput} ${loading ? styles.chatInputBehindLoading : ''}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything about your studies..."
              disabled={loading || extracting}
              autoComplete="off"
              rows="1"
            />
          </div>
          <button
            className={`btn ${styles.uploadBtn}`}
            type="button"
            title="Attach PDF or Word (.docx)"
            disabled={loading || extracting || pendingAttachments.length >= MAX_ATTACHMENTS}
            onClick={openAttachmentChoice}
          >
            📎
          </button>
          <button className="btn btn-primary" type="button" disabled={!canSend} onClick={handleSend}>
            {extracting ? 'Reading…' : 'Send'}
          </button>
        </div>
        <p className={styles.uploadHint}>Attachments: PDF or Word (.docx) only, up to {MAX_ATTACHMENTS} files, 15 MB each.</p>
      </div>

      <div className={styles.trySection}>
        <div className={styles.tryHeader}>
          <h2>Start with a template</h2>
          <p>Use these shortcuts to fill the chat with a focused study request, then edit it before sending.</p>
        </div>
        <div className="grid-3">
          {features.map((f) => (
            <div key={f.title} className={`card ${styles.featureCard}`}>
              <span className={styles.featureIcon}>{f.icon}</span>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
              <button
                type="button"
                className={`btn btn-outline ${styles.featureBtn}`}
                onClick={() => handleTry(f.title)}
              >
                Try it
              </button>
            </div>
          ))}
        </div>
      </div>

      {attachmentChoiceOpen && (
        <div
          className={styles.resourcePromptBackdrop}
          role="presentation"
          onClick={() => setAttachmentChoiceOpen(false)}
        >
          <div
            className={styles.resourcePromptPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attachment-choice-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="attachment-choice-title" className={styles.resourcePromptTitle}>
              Add an attachment
            </h2>
            <div className={styles.attachChoiceGrid}>
              <button type="button" className={styles.attachChoiceBtn} onClick={chooseComputerUpload}>
                <span className={styles.attachChoiceTitle}>Upload file</span>
                <span className={styles.attachChoiceText}>Choose a PDF or Word file from this device.</span>
              </button>
              <button
                type="button"
                className={styles.attachChoiceBtn}
                onClick={chooseSavedResource}
                disabled={resources.length === 0}
              >
                <span className={styles.attachChoiceTitle}>Use resource</span>
                <span className={styles.attachChoiceText}>
                  {resources.length === 0 ? 'No saved resources yet.' : 'Pick a file from Resources.'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {resourcePickerOpen && (
        <div
          className={styles.resourcePromptBackdrop}
          role="presentation"
          onClick={() => !extracting && setResourcePickerOpen(false)}
        >
          <div
            className={`${styles.resourcePromptPanel} ${styles.resourcePickerPanel}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="resource-picker-title" className={styles.resourcePromptTitle}>
              Choose from Resources
            </h2>
            {resources.length === 0 ? (
              <p className={styles.resourcePromptText}>No saved resources yet.</p>
            ) : (
              <div className={styles.resourcePickerList}>
                {resources.map((resource) => {
                  const alreadyAttached = attachedResourceIds.has(resource.id)
                  const isReading = attachingResourceId === resource.id
                  return (
                    <button
                      key={resource.id}
                      type="button"
                      className={`${styles.resourcePickerItem} ${alreadyAttached ? styles.resourcePickerItemAttached : ''}`}
                      onClick={() => attachSavedResource(resource)}
                      disabled={extracting || alreadyAttached || pendingAttachments.length >= MAX_ATTACHMENTS}
                    >
                      <span className={styles.resourcePickerName}>{resource.name}</span>
                      <span className={styles.resourcePickerMeta}>
                        {alreadyAttached ? 'Added' : isReading ? 'Reading...' : resource.label || 'No label'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className={styles.resourcePromptActions}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={extracting}
                onClick={() => setResourcePickerOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {resourcePrompt && (
        <div className={styles.resourcePromptBackdrop} role="presentation">
          <div
            className={styles.resourcePromptPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-save-title"
          >
            <h2 id="resource-save-title" className={styles.resourcePromptTitle}>
              Save file to Resources?
            </h2>
            <p className={styles.resourcePromptText}>
              {resourcePrompt.fileName} will stay attached to this chat either way.
            </p>
            {(resourcePrompt.suggestion?.label || resourcePrompt.suggestion?.courseLabel) && (
              <p className={styles.resourcePromptSuggestion}>
                {formatResourceLabelSuggestion(resourcePrompt.suggestion)}
              </p>
            )}
            <div className={styles.resourcePromptActions}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => answerResourcePrompt(false)}
              >
                Use in chat only
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => answerResourcePrompt(true)}
              >
                Save to Resources
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
