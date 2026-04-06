import { useState, useRef, useEffect } from 'react'
import styles from './CourseModal.module.css'

export const COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function blankCourse() {
  return {
    id: crypto.randomUUID(),
    name: '',
    instructor: '',
    color: COLORS[0],
    schedule: [],
    materials: [],
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function CourseModal({ initial, onSave, onClose }) {
  const isEdit = Boolean(initial)
  const [course, setCourse] = useState(() =>
    initial ? { ...initial, schedule: initial.schedule ?? [], materials: initial.materials ?? [] } : blankCourse(),
  )
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Field helpers ──────────────────────────────────────────────────────────
  function set(field, value) {
    setCourse((c) => ({ ...c, [field]: value }))
    setError('')
  }

  function toggleDay(day) {
    setCourse((c) => {
      const exists = c.schedule.find((s) => s.day === day)
      const schedule = exists
        ? c.schedule.filter((s) => s.day !== day)
        : [...c.schedule, { day, startTime: '09:00', endTime: '10:15' }]
      return { ...c, schedule }
    })
  }

  function updateTime(day, field, value) {
    setCourse((c) => ({
      ...c,
      schedule: c.schedule.map((s) => (s.day === day ? { ...s, [field]: value } : s)),
    }))
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      type: f.type,
      addedAt: new Date().toISOString(),
    }))
    setCourse((c) => ({ ...c, materials: [...c.materials, ...incoming] }))
  }

  function removeMaterial(id) {
    setCourse((c) => ({ ...c, materials: c.materials.filter((m) => m.id !== id) }))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSave() {
    if (!course.name.trim()) {
      setError('Course name is required.')
      return
    }
    onSave({ ...course, name: course.name.trim(), instructor: course.instructor.trim() })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>{isEdit ? 'Edit Course' : 'Add Course'}</h2>
          <button className={styles.closeBtn} onClick={onClose} title="Close">✕</button>
        </div>

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          {/* Name + Instructor */}
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Course Name *</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. CS4800 – Software Engineering"
                value={course.name}
                onChange={(e) => set('name', e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Instructor (optional)</label>
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. Dr. Zaidi"
                value={course.instructor}
                onChange={(e) => set('instructor', e.target.value)}
              />
            </div>
          </div>

          {/* Color */}
          <div className={styles.field}>
            <label className={styles.label}>Color Label</label>
            <div className={styles.colorPicker}>
              {COLORS.map((color) => (
                <button
                  key={color}
                  className={`${styles.colorSwatch} ${course.color === color ? styles.colorSelected : ''}`}
                  style={{ background: color }}
                  onClick={() => set('color', color)}
                  title={color}
                />
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className={styles.field}>
            <label className={styles.label}>Schedule</label>
            <div className={styles.dayRow}>
              {DAYS.map((day) => {
                const active = course.schedule.some((s) => s.day === day)
                return (
                  <button
                    key={day}
                    className={`${styles.dayBtn} ${active ? styles.dayActive : ''}`}
                    style={active ? { background: course.color, borderColor: course.color } : {}}
                    onClick={() => toggleDay(day)}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {course.schedule.length > 0 && (
              <div className={styles.timeList}>
                {course.schedule.map((s) => (
                  <div key={s.day} className={styles.timeRow}>
                    <span className={styles.dayLabel}>{s.day}</span>
                    <input
                      className={styles.timeInput}
                      type="time"
                      value={s.startTime}
                      onChange={(e) => updateTime(s.day, 'startTime', e.target.value)}
                    />
                    <span className={styles.timeSep}>to</span>
                    <input
                      className={styles.timeInput}
                      type="time"
                      value={s.endTime}
                      onChange={(e) => updateTime(s.day, 'endTime', e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Materials */}
          <div className={styles.field}>
            <label className={styles.label}>Materials (optional)</label>
            <div
              className={styles.dropZone}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
            >
              <span className={styles.dropIcon}>📎</span>
              <span>Drop files or <span className={styles.browseLink}>browse</span></span>
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
                onChange={(e) => addFiles(e.target.files)} />
            </div>

            {course.materials.length > 0 && (
              <ul className={styles.fileList}>
                {course.materials.map((m) => (
                  <li key={m.id} className={styles.fileItem}>
                    <span className={styles.fileIcon}>📄</span>
                    <span className={styles.fileName}>{m.name}</span>
                    <span className={styles.fileSize}>{formatSize(m.size)}</span>
                    <button className={styles.removeFile} onClick={() => removeMaterial(m.id)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {isEdit ? 'Save Changes' : 'Add Course'}
          </button>
        </div>
      </div>
    </div>
  )
}
