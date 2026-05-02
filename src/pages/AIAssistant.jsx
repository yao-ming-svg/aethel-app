import { useEffect, useRef, useState } from 'react'
import ChatMarkdown from '../components/ChatMarkdown'
import { useResources } from '../context/ResourcesContext'
import { sendChat } from '../api/chat'
import { ACCEPT_PDF_DOCX, extractDocumentText, validateChatFile } from '../lib/documentExtract'
import '../App.css'
import styles from './AIAssistant.module.css'

const features = [
  { icon: '📅', title: 'Study Schedule Generator', desc: 'Generate a personalized study schedule based on your deadlines and availability.' },
  { icon: '📄', title: 'Document Summarizer',       desc: 'Upload PDFs or notes and get concise, exam-focused summaries.' },
  { icon: '🔍', title: 'Resource Recommender',      desc: 'Get AI-curated textbooks, videos, and articles tailored to your subjects.' },
]

const TRY_PROMPTS = {
  'Study Schedule Generator': 'Create a 5-day study schedule for an upcoming exam. I can study about 2 hours on weekdays and 4 hours on weekends.',
  'Document Summarizer': 'Summarize the main ideas I should memorize for an exam, as bullet points with one-line explanations.',
  'Resource Recommender': 'Recommend free online resources (videos or articles) to learn calculus derivatives, with a one-line note for each.',
}

const MAX_ATTACHMENTS = 4

function newId() {
  return crypto.randomUUID()
}

export default function AIAssistant() {
  const { addResource } = useResources()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pendingAttachments, setPendingAttachments] = useState([])
  const [extracting, setExtracting] = useState(false)
  const endRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const question = input.trim()
    if ((!question && pendingAttachments.length === 0) || loading) return

    setError(null)
    setInput('')

    const documentBlocks =
      pendingAttachments.length > 0
        ? pendingAttachments.map(({ name, text }) => ({ name, text }))
        : undefined

    const userMsg = {
      role: 'user',
      content: question,
      ...(documentBlocks ? { documentBlocks } : {}),
    }

    setPendingAttachments([])
    const next = [...messages, userMsg]
    setMessages(next)
    setLoading(true)

    try {
      const reply = await sendChat(next)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setMessages((prev) => prev.slice(0, -1))
      setInput(question)
      if (documentBlocks?.length) {
        setPendingAttachments(
          documentBlocks.map((d) => ({ id: newId(), name: d.name, text: d.text })),
        )
      }
    } finally {
      setLoading(false)
    }
  }

  function handleTry(title) {
    const prompt = TRY_PROMPTS[title]
    if (prompt) setInput(prompt)
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
        setPendingAttachments((prev) => [...prev, { id: newId(), name, text }])
        added += 1
        void addResource({ file, label: null }).then((res) => {
          if (!res.ok) {
            console.warn('[Resources]', res.error)
          }
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that file.')
      } finally {
        setExtracting(false)
      }
    }
  }

  const canSend = (input.trim().length > 0 || pendingAttachments.length > 0) && !loading && !extracting

  return (
    <div className="page">
      <div className="page-header">
        <h1>AI Assistant</h1>
        <p>Your AI-powered study companion. Ask questions, get a schedule, or summarize notes.</p>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
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

      <div className="card">
        <h2 className={styles.chatTitle}>Chat with AI</h2>

        {error && (
          <div className={styles.chatError} role="alert">
            {error}
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
            <input
              className={`${styles.chatInput} ${loading ? styles.chatInputBehindLoading : ''}`}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything about your studies..."
              disabled={loading || extracting}
              autoComplete="off"
            />
          </div>
          <button
            className={`btn ${styles.uploadBtn}`}
            type="button"
            title="Attach PDF or Word (.docx)"
            disabled={loading || extracting || pendingAttachments.length >= MAX_ATTACHMENTS}
            onClick={() => fileInputRef.current?.click()}
          >
            📎
          </button>
          <button className="btn btn-primary" type="button" disabled={!canSend} onClick={handleSend}>
            {extracting ? 'Reading…' : 'Send'}
          </button>
        </div>
        <p className={styles.uploadHint}>Attachments: PDF or Word (.docx) only, up to {MAX_ATTACHMENTS} files, 15 MB each.</p>
      </div>
    </div>
  )
}
