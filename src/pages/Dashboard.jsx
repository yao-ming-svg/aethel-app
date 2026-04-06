import { useState } from 'react'
import { useCourses } from '../context/CoursesContext'
import CourseModal from '../components/CourseModal'
import { TASK_TYPES } from '../components/TaskModal'
import '../App.css'
import styles from './Dashboard.module.css'

const TYPE_MAP = Object.fromEntries(TASK_TYPES.map((t) => [t.value, t]))

function parseLocalDate(str) {
  // Parse YYYY-MM-DD as local midnight, not UTC
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isOverdue(dueDate) {
  if (!dueDate) return false
  return parseLocalDate(dueDate) < new Date(new Date().setHours(0, 0, 0, 0))
}

function formatDue(dueDate) {
  const d = parseLocalDate(dueDate)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const diff = Math.round((d - today) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 0 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const { courses, addCourse, updateCourse, removeCourse } = useCourses()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  // Flatten all non-completed tasks across every course
  const allTasks = courses.flatMap((course) =>
    (course.tasks ?? [])
      .filter((t) => t.status !== 'completed')
      .map((t) => ({ ...t, course }))
  )

  // Sort: overdue first, then by due date ascending, then no-due-date at end
  const sortedTasks = [...allTasks].sort((a, b) => {
    const aOver = isOverdue(a.dueDate)
    const bOver = isOverdue(b.dueDate)
    if (aOver !== bOver) return aOver ? -1 : 1
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return parseLocalDate(a.dueDate) - parseLocalDate(b.dueDate)
  })

  // Stats
  const completedCount = courses.flatMap((c) => c.tasks ?? []).filter((t) => t.status === 'completed').length
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const in7 = new Date(today); in7.setDate(today.getDate() + 7)
  const upcomingCount = allTasks.filter((t) => {
    if (!t.dueDate) return false
    const d = parseLocalDate(t.dueDate)
    return d >= today && d <= in7
  }).length

  function handleSave(course) {
    if (editing) { updateCourse(course.id, course); setEditing(null) }
    else addCourse(course)
    setModalOpen(false)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Here's an overview of your study space.</p>
      </div>

      {/* Stats */}
      {courses.length > 0 && (
        <div className={styles.statsGrid}>
          <div className="card">
            <p className={styles.statLabel}>Courses</p>
            <p className={styles.statValue}>{courses.length}</p>
          </div>
          <div className="card">
            <p className={styles.statLabel}>Open Tasks</p>
            <p className={styles.statValue}>{allTasks.length}</p>
          </div>
          <div className="card">
            <p className={styles.statLabel}>Completed</p>
            <p className={styles.statValue}>{completedCount}</p>
          </div>
          <div className="card">
            <p className={styles.statLabel}>Due This Week</p>
            <p className={`${styles.statValue} ${upcomingCount > 0 ? styles.statAccent : ''}`}>{upcomingCount}</p>
          </div>
        </div>
      )}

      {/* Upcoming tasks */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Upcoming Tasks</h2>
      </div>

      {sortedTasks.length === 0 ? (
        <div className={`card ${styles.emptyCard}`} style={{ padding: '24px', marginBottom: 20 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {courses.length === 0
              ? 'Add courses and tasks to see them here.'
              : 'No open tasks — you\'re all caught up!'}
          </p>
        </div>
      ) : (
        <div className={styles.taskList}>
          {sortedTasks.map((task) => {
            const typeInfo = TYPE_MAP[task.type] ?? TYPE_MAP.other
            const overdue = isOverdue(task.dueDate)
            return (
              <div key={task.id} className={`card ${styles.taskRow}`}>
                <span className={styles.typeBar} style={{ background: typeInfo.color }} />
                <span className={styles.courseDot} style={{ background: task.course.color }} />
                <div className={styles.taskInfo}>
                  <div className={styles.taskTopRow}>
                    <span className={styles.taskTitle}>{task.title}</span>
                    <span className={styles.typeBadge}
                      style={{ background: typeInfo.color + '22', color: typeInfo.color, border: `1px solid ${typeInfo.color}44` }}>
                      {typeInfo.label}
                    </span>
                  </div>
                  <div className={styles.taskMeta}>
                    <span className={styles.courseName}>{task.course.name}</span>
                    {task.dueDate && (
                      <span className={`${styles.dueDate} ${overdue ? styles.overdue : ''}`}>
                        {overdue ? '⚠ Overdue · ' : '📅 '}{formatDue(task.dueDate)}
                      </span>
                    )}
                    <span className={`${styles.statusPill} ${styles['status_' + task.status]}`}>
                      {task.status === 'todo' ? 'To Do' : 'Completed'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Courses */}
      <div className={styles.sectionHeader} style={{ marginTop: 8 }}>
        <h2 className={styles.sectionTitle}>My Courses</h2>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>+ Add Course</button>
      </div>

      {courses.length === 0 ? (
        <div className={`card ${styles.emptyCard}`}>
          <div className={styles.emptyIcon}>📚</div>
          <p className={styles.emptyTitle}>No courses yet</p>
          <p className={styles.emptyDesc}>Add your classes to get started.</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }}
            onClick={() => { setEditing(null); setModalOpen(true) }}>
            + Add Your First Course
          </button>
        </div>
      ) : (
        <div className={styles.courseGrid}>
          {courses.map((course) => {
            const open = (course.tasks ?? []).filter((t) => t.status !== 'completed').length
            return (
              <div key={course.id} className={`card ${styles.courseCard}`}>
                <div className={styles.courseStripe} style={{ background: course.color }} />
                <div className={styles.courseBody}>
                  <div className={styles.courseTop}>
                    <span className={styles.courseName}>{course.name}</span>
                    <div className={styles.courseActions}>
                      <button className={styles.iconBtn} onClick={() => { setEditing(course); setModalOpen(true) }}>✏️</button>
                      <button className={styles.iconBtn} onClick={() => removeCourse(course.id)}>🗑️</button>
                    </div>
                  </div>
                  {course.instructor && <p className={styles.courseMeta}>👤 {course.instructor}</p>}
                  {course.schedule?.length > 0 && (
                    <div className={styles.scheduleChips}>
                      {course.schedule.map((s) => (
                        <span key={s.day} className={styles.chip} style={{ borderColor: course.color, color: course.color }}>
                          {s.day} {s.startTime}–{s.endTime}
                        </span>
                      ))}
                    </div>
                  )}
                  {open > 0 && (
                    <p className={styles.courseMeta} style={{ marginTop: 6 }}>
                      📋 {open} open task{open !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <CourseModal
          initial={editing}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
