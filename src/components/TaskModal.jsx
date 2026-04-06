import { useState, useRef, useEffect } from 'react'
import styles from './TaskModal.module.css'

export const TASK_TYPES = [
  { value: 'homework',  label: 'Homework',   color: '#4f46e5' },
  { value: 'exam',      label: 'Exam',        color: '#ef4444' },
  { value: 'quiz',      label: 'Quiz',        color: '#f59e0b' },
  { value: 'lab',       label: 'Lab',         color: '#10b981' },
  { value: 'project',   label: 'Project',     color: '#8b5cf6' },
  { value: 'reading',   label: 'Reading',     color: '#14b8a6' },
  { value: 'other',     label: 'Other',       color: '#64748b' },
]

export const TASK_STATUSES = [
  { value: 'todo',      label: 'To Do' },
  { value: 'completed', label: 'Completed' },
]

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function blankTask() {
  return {
    id: crypto.randomUUID(),
    title: '',
    type: 'homework',
    status: 'todo',
    dueDate: '',
    dueTime: '',
    description: '',
    materials: [],
    createdAt: new Date().toISOString(),
  }
}

export default function TaskModal({ initial, courseName, courseColor, onSave, onClose }) {
  const isEdit = Boolean(initial)
  const [task, setTask] = useState(() =>
    initial
      ? { ...initial, materials: initial.materials ?? [] }
      : blankTask(),
  )
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(field, value) {
    setTask((t) => ({ ...t, [field]: value }))
    setError('')
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      type: f.type,
      addedAt: new Date().toISOString(),
    }))
    setTask((t) => ({ ...t, materials: [...t.materials, ...incoming] }))
  }

  function removeMaterial(id) {
    setTask((t) => ({ ...t, materials: t.materials.filter((m) => m.id !== id) }))
  }

  function handleSave() {
    if (!task.title.trim()) {
      setError('Task title is required.')
      return
    }
    onSave({ ...task, title: task.title.trim() })
  }

  const selectedType = TASK_TYPES.find((t) => t.value === task.type) ?? TASK_TYPES[0]

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>{isEdit ? 'Edit Task' : 'Add Task'}</h2>
            {courseName && (
              <span className={styles.courseTag} style={{ borderColor: courseColor, color: courseColor }}>
                <span className={styles.courseDot} style={{ background: courseColor }} />
                {courseName}
              </span>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          {/* Title */}
          <div className={styles.field}>
            <label className={styles.label}>Task Title *</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. Chapter 5 Problem Set"
              value={task.title}
              onChange={(e) => set('title', e.target.value)}
              autoFocus
            />
          </div>

          {/* Type + Status */}
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Type</label>
              <div className={styles.typeGrid}>
                {TASK_TYPES.map((t) => (
                  <button
                    key={t.value}
                    className={`${styles.typeBtn} ${task.type === t.value ? styles.typeBtnActive : ''}`}
                    style={task.type === t.value ? { background: t.color, borderColor: t.color } : {}}
                    onClick={() => set('type', t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Status</label>
              <div className={styles.statusGroup}>
                {TASK_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    className={`${styles.statusBtn} ${task.status === s.value ? styles.statusBtnActive : ''}`}
                    onClick={() => set('status', s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Due date + time */}
          <div className={styles.dueDateRow}>
            <div className={styles.field}>
              <label className={styles.label}>Due Date <span className={styles.optional}>(optional)</span></label>
              <input
                className={`${styles.input} ${styles.dateInput}`}
                type="date"
                value={task.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Due Time <span className={styles.optional}>(optional)</span></label>
              <input
                className={`${styles.input} ${styles.timeInput}`}
                type="time"
                value={task.dueTime}
                onChange={(e) => set('dueTime', e.target.value)}
                disabled={!task.dueDate}
                title={!task.dueDate ? 'Set a due date first' : ''}
              />
            </div>
          </div>

          {/* Description */}
          <div className={styles.field}>
            <label className={styles.label}>Description / Instructions <span className={styles.optional}>(optional)</span></label>
            <textarea
              className={styles.textarea}
              placeholder="Add any notes, instructions, or details about this task…"
              value={task.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
            />
          </div>

          {/* Materials */}
          <div className={styles.field}>
            <label className={styles.label}>Materials <span className={styles.optional}>(optional)</span></label>
            <div
              className={styles.dropZone}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
            >
              <span>📎</span>
              <span>Drop files or <span className={styles.browseLink}>browse</span></span>
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
                onChange={(e) => addFiles(e.target.files)} />
            </div>

            {task.materials.length > 0 && (
              <ul className={styles.fileList}>
                {task.materials.map((m) => (
                  <li key={m.id} className={styles.fileItem}>
                    <span>📄</span>
                    <span className={styles.fileName}>{m.name}</span>
                    <span className={styles.fileSize}>{formatSize(m.size)}</span>
                    <button className={styles.removeFile} onClick={() => removeMaterial(m.id)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {isEdit ? 'Save Changes' : 'Add Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
