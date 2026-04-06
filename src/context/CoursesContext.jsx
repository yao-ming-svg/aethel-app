import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const CoursesContext = createContext(null)

function storageKey(userId) {
  return `aethel_courses_${userId}`
}

export function CoursesProvider({ children }) {
  const { user } = useAuth()
  const [courses, setCourses] = useState([])

  // Load courses whenever the logged-in user changes
  useEffect(() => {
    if (!user) {
      setCourses([])
      return
    }
    try {
      const stored = localStorage.getItem(storageKey(user.id))
      setCourses(stored ? JSON.parse(stored) : [])
    } catch {
      setCourses([])
    }
  }, [user?.id])

  function persist(updated) {
    if (!user) return
    localStorage.setItem(storageKey(user.id), JSON.stringify(updated))
    setCourses(updated)
  }

  function addCourse(course) {
    persist([...courses, course])
  }

  function updateCourse(id, changes) {
    persist(courses.map((c) => (c.id === id ? { ...c, ...changes } : c)))
  }

  function removeCourse(id) {
    persist(courses.filter((c) => c.id !== id))
  }

  // Materials are stored as metadata only (no file contents) until a backend exists
  function addMaterials(courseId, newFiles) {
    persist(
      courses.map((c) =>
        c.id === courseId
          ? { ...c, materials: [...(c.materials || []), ...newFiles] }
          : c,
      ),
    )
  }

  function removeMaterial(courseId, materialId) {
    persist(
      courses.map((c) =>
        c.id === courseId
          ? { ...c, materials: (c.materials || []).filter((m) => m.id !== materialId) }
          : c,
      ),
    )
  }

  // ── Task CRUD ────────────────────────────────────────────────────────────
  function addTask(courseId, task) {
    persist(
      courses.map((c) =>
        c.id === courseId ? { ...c, tasks: [...(c.tasks || []), task] } : c,
      ),
    )
  }

  function updateTask(courseId, taskId, changes) {
    persist(
      courses.map((c) =>
        c.id === courseId
          ? { ...c, tasks: (c.tasks || []).map((t) => (t.id === taskId ? { ...t, ...changes } : t)) }
          : c,
      ),
    )
  }

  function removeTask(courseId, taskId) {
    persist(
      courses.map((c) =>
        c.id === courseId
          ? { ...c, tasks: (c.tasks || []).filter((t) => t.id !== taskId) }
          : c,
      ),
    )
  }

  // Replace all courses at once (used by onboarding)
  function importCourses(newCourses) {
    persist(newCourses)
  }

  return (
    <CoursesContext.Provider
      value={{ courses, addCourse, updateCourse, removeCourse, addMaterials, removeMaterial, importCourses, addTask, updateTask, removeTask }}
    >
      {children}
    </CoursesContext.Provider>
  )
}

export function useCourses() {
  const ctx = useContext(CoursesContext)
  if (!ctx) throw new Error('useCourses must be used within CoursesProvider')
  return ctx
}
