import { useState } from 'react'
import { useCourses } from '../context/CoursesContext'
import CourseModal from '../components/CourseModal'
import TaskModal, { TASK_TYPES, TASK_STATUSES } from '../components/TaskModal'
import '../App.css'
import styles from './Tasks.module.css'

const TYPE_MAP = Object.fromEntries(TASK_TYPES.map((t) => [t.value, t]))
const STATUS_FILTERS = ['All', ...TASK_STATUSES.map((s) => s.label)]

function isOverdue(dueDate) {
  if (!dueDate) return false
  return new Date(dueDate + 'T23:59:59') < new Date()
}

function formatDue(dueDate) {
  if (!dueDate) return null
  const d = new Date(dueDate + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Tasks() {
  const { courses, addCourse, updateCourse, removeCourse, addTask, updateTask, removeTask } = useCourses()

  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

  const [courseModalOpen, setCourseModalOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) ?? null
  const tasks = selectedCourse?.tasks ?? []

  // Apply filters
  const filteredTasks = tasks.filter((t) => {
    const statusMatch =
      statusFilter === 'All' ||
      TASK_STATUSES.find((s) => s.label === statusFilter)?.value === t.status
    const typeMatch = typeFilter === 'All' || t.type === typeFilter
    return statusMatch && typeMatch
  })

  // ── Course handlers ───────────────────────────────────────────────────────
  function handleCourseSave(course) {
    if (editingCourse) {
      updateCourse(course.id, course)
    } else {
      addCourse(course)
      setSelectedCourseId(course.id)
    }
    setEditingCourse(null)
    setCourseModalOpen(false)
  }

  function openEditCourse(course, e) {
    e?.stopPropagation()
    setEditingCourse(course)
    setCourseModalOpen(true)
  }

  function handleRemoveCourse(id, e) {
    e?.stopPropagation()
    removeCourse(id)
    if (selectedCourseId === id) setSelectedCourseId(null)
  }

  // ── Task handlers ─────────────────────────────────────────────────────────
  function handleTaskSave(task) {
    if (!selectedCourse) return
    if (editingTask) {
      updateTask(selectedCourse.id, task.id, task)
    } else {
      addTask(selectedCourse.id, task)
    }
    setEditingTask(null)
    setTaskModalOpen(false)
  }

  function openEditTask(task) {
    setEditingTask(task)
    setTaskModalOpen(true)
  }

  function toggleStatus(task) {
    const next = task.status === 'todo' ? 'completed' : 'todo'
    updateTask(selectedCourse.id, task.id, { status: next })
  }

  // ── Counts for sidebar badges ─────────────────────────────────────────────
  function taskCount(course) {
    return (course.tasks ?? []).filter((t) => t.status !== 'completed').length
  }

  return (
    <div className="page">
      <div className={styles.pageHeader}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Tasks</h1>
          <p>Manage assignments, exams, and deadlines per course.</p>
        </div>
        <button className="btn btn-outline" onClick={() => { setEditingCourse(null); setCourseModalOpen(true) }}>
          + Add Course
        </button>
      </div>

      <div className={styles.layout}>
        {/* ── Course sidebar ─────────────────────────────────────────────── */}
        <aside className={styles.sidebar}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className={styles.sidebarHead}>
              <span className={styles.sidebarTitle}>Courses</span>
              <button className={styles.addBtn} onClick={() => { setEditingCourse(null); setCourseModalOpen(true) }} title="Add course">+</button>
            </div>

            {courses.length === 0 ? (
              <div className={styles.sidebarEmpty}>
                <p>No courses yet.</p>
                <button className="btn btn-primary" style={{ marginTop: 10, width: '100%', fontSize: 13 }}
                  onClick={() => { setEditingCourse(null); setCourseModalOpen(true) }}>
                  + Add Course
                </button>
              </div>
            ) : (
              <ul className={styles.courseList}>
                {courses.map((c) => {
                  const pending = taskCount(c)
                  return (
                    <li
                      key={c.id}
                      className={`${styles.courseItem} ${selectedCourseId === c.id ? styles.courseItemActive : ''}`}
                      onClick={() => setSelectedCourseId(c.id === selectedCourseId ? null : c.id)}
                    >
                      <span className={styles.courseDot} style={{ background: c.color }} />
                      <span className={styles.courseName}>{c.name}</span>
                      <div className={styles.courseRight}>
                        {pending > 0 && <span className={styles.badge}>{pending}</span>}
                        <div className={styles.courseActions}>
                          <button className={styles.miniBtn} onClick={(e) => openEditCourse(c, e)} title="Edit">✏️</button>
                          <button className={styles.miniBtn} onClick={(e) => handleRemoveCourse(c.id, e)} title="Remove">🗑️</button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Task pane ──────────────────────────────────────────────────── */}
        <div className={styles.taskPane}>
          {!selectedCourse ? (
            <div className="card">
              <div className="placeholder-block">
                {courses.length === 0
                  ? 'Add a course on the left to get started.'
                  : 'Select a course to view and manage its tasks.'}
              </div>
            </div>
          ) : (
            <>
              {/* Course header strip */}
              <div className={styles.courseStrip} style={{ borderLeftColor: selectedCourse.color }}>
                <span className={styles.stripDot} style={{ background: selectedCourse.color }} />
                <div className={styles.stripInfo}>
                  <span className={styles.stripName}>{selectedCourse.name}</span>
                  {selectedCourse.instructor && (
                    <span className={styles.stripMeta}>👤 {selectedCourse.instructor}</span>
                  )}
                </div>
                <button className="btn btn-primary" onClick={() => { setEditingTask(null); setTaskModalOpen(true) }}>
                  + Add Task
                </button>
              </div>

              {/* Filters */}
              <div className={styles.filterBar}>
                <div className={styles.filterGroup}>
                  {STATUS_FILTERS.map((f) => (
                    <button
                      key={f}
                      className={`${styles.filterBtn} ${statusFilter === f ? styles.filterActive : ''}`}
                      onClick={() => setStatusFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <select
                  className={styles.typeSelect}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="All">All Types</option>
                  {TASK_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Task list */}
              {filteredTasks.length === 0 ? (
                <div className="card">
                  <div className="placeholder-block">
                    {tasks.length === 0
                      ? <><p>No tasks for this course yet.</p><p style={{ marginTop: 6 }}>Click "+ Add Task" to create one.</p></>
                      : <p>No tasks match the current filters.</p>
                    }
                  </div>
                </div>
              ) : (
                <div className={styles.taskList}>
                  {filteredTasks.map((task) => {
                    const typeInfo = TYPE_MAP[task.type] ?? TYPE_MAP.other
                    const overdue = isOverdue(task.dueDate) && task.status !== 'completed'
                    const done = task.status === 'completed'
                    return (
                      <div key={task.id} className={`card ${styles.taskCard} ${done ? styles.taskDone : ''}`}>
                        {/* Status toggle */}
                        <button
                          className={`${styles.statusCircle} ${done ? styles.statusDone : ''}`}
                          onClick={() => toggleStatus(task)}
                          title="Cycle status"
                          style={done ? {} : { borderColor: typeInfo.color }}
                        >
                          {done && '✓'}
                        </button>

                        <div className={styles.taskBody}>
                          <div className={styles.taskTop}>
                            <span className={styles.taskTitle}>{task.title}</span>
                            <span
                              className={styles.typeBadge}
                              style={{ background: typeInfo.color + '22', color: typeInfo.color, border: `1px solid ${typeInfo.color}44` }}
                            >
                              {typeInfo.label}
                            </span>
                          </div>

                          <div className={styles.taskMeta}>
                            {task.dueDate && (
                              <span className={`${styles.dueDate} ${overdue ? styles.overdue : ''}`}>
                                {overdue ? '⚠ ' : '📅 '}Due {formatDue(task.dueDate)}
                              </span>
                            )}
                            <span className={`${styles.statusPill} ${styles['status_' + task.status]}`}>
                              {TASK_STATUSES.find((s) => s.value === task.status)?.label}
                            </span>
                            {task.materials?.length > 0 && (
                              <span className={styles.metaItem}>📎 {task.materials.length} file{task.materials.length !== 1 ? 's' : ''}</span>
                            )}
                          </div>

                          {task.description && (
                            <p className={styles.taskDesc}>{task.description}</p>
                          )}
                        </div>

                        <div className={styles.taskActions}>
                          <button className={styles.miniBtn} onClick={() => openEditTask(task)} title="Edit">✏️</button>
                          <button className={styles.miniBtn} onClick={() => removeTask(selectedCourse.id, task.id)} title="Delete">🗑️</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {courseModalOpen && (
        <CourseModal
          initial={editingCourse}
          onSave={handleCourseSave}
          onClose={() => { setCourseModalOpen(false); setEditingCourse(null) }}
        />
      )}

      {taskModalOpen && selectedCourse && (
        <TaskModal
          initial={editingTask}
          courseName={selectedCourse.name}
          courseColor={selectedCourse.color}
          onSave={handleTaskSave}
          onClose={() => { setTaskModalOpen(false); setEditingTask(null) }}
        />
      )}
    </div>
  )
}
