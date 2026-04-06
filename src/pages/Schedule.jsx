import { useState, useRef, useEffect } from 'react'
import { useCourses } from '../context/CoursesContext'
import { TASK_TYPES } from '../components/TaskModal'
import '../App.css'
import styles from './Schedule.module.css'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const START_HOUR    = 0
const END_HOUR      = 24
const SCROLL_TO_HOUR = 7   // initial scroll position
const HOUR_PX    = 64

const TYPE_MAP = Object.fromEntries(TASK_TYPES.map((t) => [t.value, t]))

const STATUS_COLORS = { todo: '#94a3b8', completed: '#22c55e' }
const STATUS_CYCLE  = { todo: 'completed', completed: 'todo' }

// ── Date helpers ──────────────────────────────────────────────────────────────
function getWeekMonday(offset = 0) {
  const today = new Date()
  const dow  = today.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const mon  = new Date(today)
  mon.setDate(today.getDate() + diff + offset * 7)
  mon.setHours(0, 0, 0, 0)
  return mon
}

function getWeekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatMonthRange(days) {
  const first = days[0], last = days[6]
  const opts = { month: 'short', day: 'numeric' }
  if (first.getMonth() === last.getMonth())
    return `${first.toLocaleDateString('en-US', opts)} – ${last.getDate()}, ${first.getFullYear()}`
  return `${first.toLocaleDateString('en-US', opts)} – ${last.toLocaleDateString('en-US', opts)}, ${last.getFullYear()}`
}

// ── Time helpers ──────────────────────────────────────────────────────────────
function toMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function formatHour(h) {
  if (h === 0 || h === 24) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function formatTimeRange(s, e) {
  function fmt(t) {
    const [h, m] = t.split(':').map(Number)
    const sfx = h < 12 ? 'AM' : 'PM'
    const h12 = h % 12 || 12
    return m === 0 ? `${h12} ${sfx}` : `${h12}:${m.toString().padStart(2, '0')} ${sfx}`
  }
  return `${fmt(s)} – ${fmt(e)}`
}

function formatTime(t) {
  const [h, m] = t.split(':').map(Number)
  const sfx = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12} ${sfx}` : `${h12}:${m.toString().padStart(2, '0')} ${sfx}`
}

function classBlockStyle(startTime, endTime, color) {
  const top    = ((toMinutes(startTime) - START_HOUR * 60) / 60) * HOUR_PX
  const height = Math.max(((toMinutes(endTime) - toMinutes(startTime)) / 60) * HOUR_PX, 28)
  return { top, height, background: color }
}

// Timed deadline block: anchored at dueTime, fixed 30-min height
function deadlineBlockStyle(dueTime, color) {
  const startMin = toMinutes(dueTime)
  const top      = ((startMin - START_HOUR * 60) / 60) * HOUR_PX
  return {
    top,
    minHeight: 44,
    borderLeft: `3px solid ${color}`,
    background: color + '1a',   // ~10% opacity
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Schedule() {
  const { courses, updateTask } = useCourses()

  function cycleStatus(courseId, task) {
    updateTask(courseId, task.id, { status: STATUS_CYCLE[task.status] ?? 'todo' })
  }
  const [weekOffset, setWeekOffset] = useState(0)
  const scrollRef = useRef(null)

  // Scroll to SCROLL_TO_HOUR on first render and whenever the calendar appears
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_PX
    }
  }, [])

  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const monday   = getWeekMonday(weekOffset)
  const weekDays = getWeekDays(monday)

  const hours = []
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h)
  const totalHeight = (END_HOUR - START_HOUR) * HOUR_PX

  // ── Class events (repeating weekly by day name) ───────────────────────────
  const classEvents = {}
  DAYS.forEach((d) => { classEvents[d] = [] })
  courses.forEach((course) => {
    ;(course.schedule ?? []).forEach((s) => {
      if (classEvents[s.day]) classEvents[s.day].push({ course, startTime: s.startTime, endTime: s.endTime })
    })
  })

  // ── Task routing for this week ─────────────────────────────────────────────
  // Three buckets per calendar date:
  //   timedByDate[key]              → tasks with dueTime  → timetable block
  //   untimedInClassByDate[key][cId]→ tasks without dueTime, course has class that day → inside class block
  //   pillsByDate[key]              → tasks without dueTime, course has no class that day → header pill

  const timedByDate          = {}   // key → [{ task, course }]
  const untimedInClassByDate = {}   // key → { courseId → [task] }
  const pillsByDate          = {}   // key → [{ task, course }]

  weekDays.forEach((date, i) => {
    const key = date.toDateString()
    timedByDate[key]          = []
    untimedInClassByDate[key] = {}
    pillsByDate[key]          = []

    const dayName = DAYS[i]

    courses.forEach((course) => {
      const courseHasClass = (course.schedule ?? []).some((s) => s.day === dayName)
      ;(course.tasks ?? [])
        .filter((t) => t.dueDate && isSameDay(parseLocalDate(t.dueDate), date))
        .forEach((task) => {
          if (task.dueTime) {
            timedByDate[key].push({ task, course })
          } else if (courseHasClass) {
            if (!untimedInClassByDate[key][course.id]) untimedInClassByDate[key][course.id] = []
            untimedInClassByDate[key][course.id].push(task)
          } else {
            pillsByDate[key].push({ task, course })
          }
        })
    })
  })

  const hasSchedule = courses.some((c) => c.schedule?.length > 0)
  const hasAnything = courses.length > 0

  return (
    <div className="page">
      <div className={styles.pageHeader}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Schedule</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 2 }}>Your weekly class timetable and deadlines.</p>
        </div>
        <div className={styles.weekNav}>
          <button className={styles.navBtn} onClick={() => setWeekOffset((o) => o - 1)}>‹</button>
          <span className={styles.weekLabel}>{formatMonthRange(weekDays)}</span>
          <button className={styles.navBtn} onClick={() => setWeekOffset((o) => o + 1)}>›</button>
          {weekOffset !== 0 && (
            <button className={styles.todayBtn} onClick={() => setWeekOffset(0)}>Today</button>
          )}
        </div>
      </div>

      {!hasAnything && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="placeholder-block">
            <p>No courses yet. Add courses from the Dashboard to see your schedule.</p>
          </div>
        </div>
      )}

      {hasAnything && (
        <div className={`card ${styles.calendarCard}`}>

          {/* ── Day header row ─────────────────────────────────────────── */}
          <div className={styles.headerWrapper}>
            <div className={styles.headerRow}>
              <div className={styles.gutterCell} />
              {weekDays.map((date, i) => {
                const isToday = isSameDay(date, today)
                return (
                  <div key={i} className={`${styles.dayHeader} ${isToday ? styles.dayHeaderToday : ''}`}>
                    <span className={styles.dayName}>{DAYS[i]}</span>
                    <span className={`${styles.dayDate} ${isToday ? styles.dayDateToday : ''}`}>
                      {date.getDate()}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Pills float below the header, overlaid on the timetable */}
            <div className={styles.pillsRow}>
              <div className={styles.gutterSpacer} />
              {weekDays.map((date, i) => {
                const pills = pillsByDate[date.toDateString()] ?? []
                return (
                  <div key={i} className={styles.pillsCell}>
                    {pills.map(({ task, course }) => {
                      const typeInfo = TYPE_MAP[task.type] ?? TYPE_MAP.other
                      return (
                        <span
                          key={task.id}
                          className={styles.deadlinePill}
                          style={{ background: typeInfo.color + '22', color: typeInfo.color, borderColor: typeInfo.color + '55' }}
                          title={`${task.title} (${course.name}) — Due today`}
                        >
                          <span className={styles.pillDot} style={{ background: course.color }} />
                          {task.title.length > 14 ? task.title.slice(0, 13) + '…' : task.title}
                        </span>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Timetable body ─────────────────────────────────────────── */}
          {!hasSchedule ? (
            <div style={{ padding: '24px 16px' }}>
              <div className="placeholder-block">
                <p>No class times set. Edit your courses to add a schedule.</p>
              </div>
            </div>
          ) : (
            <div className={styles.bodyScroll} ref={scrollRef}>
              <div className={styles.bodyInner} style={{ height: totalHeight }}>

                {/* Hour grid lines */}
                {hours.map((h) => (
                  <div key={h} className={styles.hourRow} style={{ top: (h - START_HOUR) * HOUR_PX }}>
                    <div className={styles.hourLabel}>{formatHour(h)}</div>
                    <div className={styles.hourLine} />
                  </div>
                ))}

                {/* Day columns */}
                <div className={styles.columnsRow}>
                  <div className={styles.gutterSpacer} />
                  {weekDays.map((date, i) => {
                    const day     = DAYS[i]
                    const isToday = isSameDay(date, today)
                    const dateKey = date.toDateString()

                    return (
                      <div key={i} className={`${styles.dayCol} ${isToday ? styles.dayColToday : ''}`}>
                        {/* Class blocks (with untimed tasks embedded) */}
                        {classEvents[day].map(({ course, startTime, endTime }, j) => {
                          const untimedTasks = untimedInClassByDate[dateKey]?.[course.id] ?? []
                          return (
                            <div
                              key={j}
                              className={styles.eventBlock}
                              style={classBlockStyle(startTime, endTime, course.color)}
                              title={`${course.name}\n${formatTimeRange(startTime, endTime)}`}
                            >
                              <span className={styles.eventName}>{course.name}</span>
                              {untimedTasks.length > 0 && (
                                <div className={styles.untimedTasks}>
                                  {untimedTasks.map((task) => {
                                    const typeInfo = TYPE_MAP[task.type] ?? TYPE_MAP.other
                                    const done = task.status === 'completed'
                                    return (
                                      <div
                                        key={task.id}
                                        className={`${styles.untimedTask} ${done ? styles.untimedTaskDone : ''}`}
                                        onClick={(e) => { e.stopPropagation(); cycleStatus(course.id, task) }}
                                        title={`Status: ${task.status} — click to cycle`}
                                      >
                                        <span className={styles.untimedTitle}>{task.title}</span>
                                        <span className={styles.untimedType}>{typeInfo.label}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                              <span className={styles.eventTime}>{formatTimeRange(startTime, endTime)}</span>
                              {course.instructor && (
                                <span className={styles.eventInstructor}>{course.instructor}</span>
                              )}
                            </div>
                          )
                        })}

                        {/* Timed deadline blocks */}
                        {(timedByDate[dateKey] ?? []).map(({ task, course }) => {
                          const typeInfo = TYPE_MAP[task.type] ?? TYPE_MAP.other
                          const done = task.status === 'completed'
                          return (
                            <div
                              key={task.id}
                              className={`${styles.deadlineBlock} ${done ? styles.deadlineBlockDone : ''}`}
                              style={deadlineBlockStyle(task.dueTime, course.color)}
                              title={`${task.title}\nDue: ${formatTime(task.dueTime)} — click to cycle status`}
                              onClick={() => cycleStatus(course.id, task)}
                            >
                              <div className={styles.deadlineTop}>
                                <span className={`${styles.deadlineName} ${done ? styles.deadlineNameDone : ''}`}>{task.title}</span>
                                <span
                                  className={styles.deadlineTypeBadge}
                                  style={{ background: typeInfo.color + '33', color: typeInfo.color }}
                                >
                                  {typeInfo.label}
                                </span>
                              </div>
                              <span className={styles.deadlineTime}>
                                🔔 Due {formatTime(task.dueTime)} · {course.name}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          {hasSchedule && (
            <div className={styles.legend}>
              {courses.filter((c) => c.schedule?.length > 0).map((c) => (
                <div key={c.id} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: c.color }} />
                  <span className={styles.legendName}>{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
