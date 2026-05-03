import { useEffect, useRef, useState } from 'react'
import { useCourses } from '../context/CoursesContext'
import { useStudySessions } from '../context/StudySessionsContext'
import styles from './StudyTimer.module.css'

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function StudyTimer() {
  const { courses } = useCourses()
  const { timerStartedAt, timerCourseId, startTimer, stopTimer } = useStudySessions()
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState(false)
  const intervalRef = useRef(null)

  const running = timerStartedAt !== null

  // Auto-select first course on load
  useEffect(() => {
    if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(timerCourseId || courses[0].id)
    }
  }, [courses])

  // Sync selectedCourseId when timer is already running (e.g. navigated back)
  useEffect(() => {
    if (running && timerCourseId) setSelectedCourseId(timerCourseId)
  }, [running, timerCourseId])

  // Tick while running
  useEffect(() => {
    if (!running) {
      clearInterval(intervalRef.current)
      setElapsed(0)
      return
    }
    // Immediately set correct elapsed (handles returning to the page mid-session)
    setElapsed(Math.round((Date.now() - timerStartedAt) / 1000))
    intervalRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - timerStartedAt) / 1000))
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running, timerStartedAt])

  function handleStart() {
    if (!selectedCourseId) return
    setSaved(false)
    startTimer(selectedCourseId)
  }

  function handleStop() {
    stopTimer(courses)
    setSaved(true)
  }

  if (courses.length === 0) return null

  const activeCourse = courses.find((c) => c.id === (running ? timerCourseId : selectedCourseId))

  return (
    <div className={`card ${styles.timerCard}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>Study Timer</h2>
        {running && <span className={styles.recordingDot} title="Session in progress" />}
      </div>

      <div className={styles.body}>
        <select
          className={styles.select}
          value={running ? timerCourseId : selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          disabled={running}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className={styles.elapsed} style={{ color: running && activeCourse ? activeCourse.color : undefined }}>
          {formatElapsed(elapsed)}
        </div>

        <button
          className={`btn ${running ? 'btn-outline' : 'btn-primary'} ${styles.timerBtn}`}
          onClick={running ? handleStop : handleStart}
          disabled={!selectedCourseId}
        >
          {running ? 'Stop & Save' : 'Start Session'}
        </button>

        {saved && !running && (
          <p className={styles.savedMsg}>Session saved!</p>
        )}
      </div>
    </div>
  )
}
