import { useCourses } from '../context/CoursesContext'
import { useStudySessions } from '../context/StudySessionsContext'
import '../App.css'
import styles from './Analytics.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function calcStreak(sessions) {
  const dates = new Set(sessions.map((s) => s.date))
  let streak = 0
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  while (dates.has(toLocalDateStr(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

function last7Days() {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    days.push({ date: toLocalDateStr(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }) })
  }
  return days
}

function last30Days() {
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    days.push(toLocalDateStr(d))
  }
  return days
}

// ── Charts ────────────────────────────────────────────────────────────────────

function BarChart({ bars, maxValue, formatLabel, emptyMsg }) {
  if (bars.every((b) => b.value === 0)) {
    return <div className="placeholder-block" style={{ minHeight: 140 }}><p>{emptyMsg}</p></div>
  }
  const peak = Math.max(...bars.map((b) => b.value), maxValue || 0)
  return (
    <div className={styles.barChart}>
      {bars.map((bar) => (
        <div key={bar.key} className={styles.barCol}>
          <span className={styles.barValueLabel}>
            {bar.value > 0 ? formatLabel(bar.value) : ''}
          </span>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{
                height: peak > 0 ? `${(bar.value / peak) * 100}%` : '0%',
                background: bar.color || 'var(--primary)',
              }}
            />
          </div>
          <span className={styles.barAxisLabel}>{bar.label}</span>
        </div>
      ))}
    </div>
  )
}

function HorizontalBars({ rows, emptyMsg }) {
  if (rows.length === 0) {
    return <div className="placeholder-block" style={{ minHeight: 140 }}><p>{emptyMsg}</p></div>
  }
  const peak = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div className={styles.hBarList}>
      {rows.map((row) => (
        <div key={row.key} className={styles.hBarRow}>
          <span className={styles.hBarLabel}>{row.label}</span>
          <div className={styles.hBarTrack}>
            <div
              className={styles.hBarFill}
              style={{ width: `${(row.value / peak) * 100}%`, background: row.color || 'var(--primary)' }}
            />
          </div>
          <span className={styles.hBarCount}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function TrendChart({ days, sessionsByDate, emptyMsg }) {
  const values = days.map((d) => {
    const secs = (sessionsByDate[d] || []).reduce((sum, s) => sum + s.duration, 0)
    return Math.round(secs / 60)
  })
  const peak = Math.max(...values, 1)
  const hasData = values.some((v) => v > 0)
  if (!hasData) {
    return <div className="placeholder-block" style={{ minHeight: 100 }}><p>{emptyMsg}</p></div>
  }
  return (
    <div className={styles.trendChart}>
      {values.map((v, i) => (
        <div
          key={days[i]}
          className={styles.trendBar}
          style={{ height: `${Math.max((v / peak) * 100, v > 0 ? 4 : 0)}%`, background: v > 0 ? 'var(--primary)' : 'transparent' }}
          title={v > 0 ? `${days[i]}: ${v} min` : days[i]}
        />
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { courses } = useCourses()
  const { sessions } = useStudySessions()

  // ── Metrics ──────────────────────────────────────────────────────────────
  const totalSeconds = sessions.reduce((sum, s) => sum + s.duration, 0)
  const totalHours = totalSeconds / 3600
  const allTasks = courses.flatMap((c) => c.tasks || [])
  const completedTasks = allTasks.filter((t) => t.status === 'completed').length
  const avgMinutes = sessions.length ? Math.round(totalSeconds / sessions.length / 60) : null
  const streak = calcStreak(sessions)

  // ── Weekly hours chart ───────────────────────────────────────────────────
  const sessionsByDate = sessions.reduce((acc, s) => {
    acc[s.date] = acc[s.date] || []
    acc[s.date].push(s)
    return acc
  }, {})

  const weeklyBars = last7Days().map(({ date, label }) => {
    const secs = (sessionsByDate[date] || []).reduce((sum, s) => sum + s.duration, 0)
    return { key: date, label, value: secs / 3600 }
  })

  // ── Tasks by subject ─────────────────────────────────────────────────────
  const taskRows = courses
    .map((c) => ({
      key: c.id,
      label: c.name,
      color: c.color,
      value: (c.tasks || []).filter((t) => t.status === 'completed').length,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)

  // ── Performance trends (30 days) ─────────────────────────────────────────
  const trendDays = last30Days()

  // ── Metric cards ─────────────────────────────────────────────────────────
  const metrics = [
    {
      label: 'Total Study Hours',
      value: totalHours >= 1 ? `${totalHours.toFixed(1)}h` : totalSeconds > 0 ? `${Math.round(totalSeconds / 60)}m` : '0h',
      desc: 'All time',
    },
    {
      label: 'Tasks Completed',
      value: String(completedTasks),
      desc: 'All time',
    },
    {
      label: 'Avg. Session Length',
      value: avgMinutes !== null ? `${avgMinutes}m` : '—',
      desc: 'Minutes per session',
    },
    {
      label: 'Study Streak',
      value: String(streak),
      desc: streak === 1 ? 'Day in a row' : 'Days in a row',
    },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Track your study progress and performance trends.</p>
      </div>

      <div className={styles.metricsGrid}>
        {metrics.map((m) => (
          <div key={m.label} className="card">
            <p className={styles.metricLabel}>{m.label}</p>
            <p className={styles.metricValue}>{m.value}</p>
            <p className={styles.metricDesc}>{m.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 className={styles.sectionTitle}>Study Hours — Last 7 Days</h2>
          <BarChart
            bars={weeklyBars}
            formatLabel={(v) => v >= 1 ? `${v.toFixed(1)}h` : `${Math.round(v * 60)}m`}
            emptyMsg="Start a study session on the Dashboard to see your weekly hours."
          />
        </div>

        <div className="card">
          <h2 className={styles.sectionTitle}>Tasks Completed — By Subject</h2>
          <HorizontalBars
            rows={taskRows}
            emptyMsg="Complete tasks to see your breakdown by subject."
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className={styles.sectionTitle}>Daily Study Minutes — Last 30 Days</h2>
        <TrendChart
          days={trendDays}
          sessionsByDate={sessionsByDate}
          emptyMsg="Log study sessions to see your activity over time."
        />
      </div>
    </div>
  )
}
