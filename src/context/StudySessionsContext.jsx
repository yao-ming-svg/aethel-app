import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

const StudySessionsContext = createContext(null)

function storageKey(userId) {
  return `aethel_study_sessions_${userId}`
}

export function StudySessionsProvider({ children }) {
  const { user } = useAuth()
  const [sessions, setSessions] = useState([])

  // Active timer — kept here so it survives route changes
  const [timerStartedAt, setTimerStartedAt] = useState(null) // ms timestamp
  const [timerCourseId, setTimerCourseId] = useState('')

  useEffect(() => {
    if (!user) { setSessions([]); return }
    try {
      const stored = localStorage.getItem(storageKey(user.id))
      setSessions(stored ? JSON.parse(stored) : [])
    } catch {
      setSessions([])
    }
  }, [user?.id])

  function startTimer(courseId) {
    setTimerCourseId(courseId)
    setTimerStartedAt(Date.now())
  }

  function stopTimer(courses) {
    if (!timerStartedAt) return
    const elapsed = Math.round((Date.now() - timerStartedAt) / 1000)
    const course = courses.find((c) => c.id === timerCourseId)
    setTimerStartedAt(null)
    setTimerCourseId('')
    if (!user || !course || elapsed < 10) return
    logSession({ courseId: course.id, courseName: course.name, courseColor: course.color, duration: elapsed })
  }

  function logSession({ courseId, courseName, courseColor, duration }) {
    if (!user || duration < 10) return
    const session = {
      id: crypto.randomUUID(),
      courseId,
      courseName,
      courseColor,
      duration,
      date: new Date().toISOString().slice(0, 10),
      startedAt: new Date(Date.now() - duration * 1000).toISOString(),
    }
    const updated = [session, ...sessions]
    setSessions(updated)
    localStorage.setItem(storageKey(user.id), JSON.stringify(updated))
  }

  return (
    <StudySessionsContext.Provider value={{ sessions, logSession, timerStartedAt, timerCourseId, startTimer, stopTimer }}>
      {children}
    </StudySessionsContext.Provider>
  )
}

export function useStudySessions() {
  const ctx = useContext(StudySessionsContext)
  if (!ctx) throw new Error('useStudySessions must be used within StudySessionsProvider')
  return ctx
}
