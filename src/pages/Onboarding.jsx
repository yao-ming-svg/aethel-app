import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCourses } from '../context/CoursesContext'
import styles from './Onboarding.module.css'

const COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TOTAL_STEPS = 4 // 0=welcome,1=classes,2=schedule,3=materials

function onboardingKey(userId) {
  return `aethel_onboarded_${userId}`
}

function newCourse() {
  return {
    id: crypto.randomUUID(),
    name: '',
    instructor: '',
    color: COLORS[0],
    schedule: [],
    materials: [],
  }
}

// ─── Step components ──────────────────────────────────────────────────────────

function StepWelcome({ user }) {
  return (
    <div className={styles.stepContent}>
      <div className={styles.welcomeIcon}>⚡</div>
      <h2 className={styles.stepTitle}>Welcome to Aethel, {user.firstName}!</h2>
      <p className={styles.stepDesc}>
        Let's get your study space set up. We'll walk you through adding your
        classes, their weekly schedule, and any course materials — it only takes
        a couple of minutes.
      </p>
      <div className={styles.featureList}>
        {[
          ['📚', 'Add your courses'],
          ['📅', 'Set your class schedule'],
          ['📎', 'Attach course materials'],
        ].map(([icon, text]) => (
          <div key={text} className={styles.featureItem}>
            <span>{icon}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepClasses({ courses, setCourses }) {
  function handleAdd() {
    setCourses((prev) => [...prev, newCourse()])
  }

  function handleChange(id, field, value) {
    setCourses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    )
  }

  function handleRemove(id) {
    setCourses((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className={styles.stepContent}>
      <h2 className={styles.stepTitle}>Your Classes</h2>
      <p className={styles.stepDesc}>
        Add the courses you're enrolled in this semester. You can always edit
        these later.
      </p>

      <div className={styles.courseList}>
        {courses.map((course, i) => (
          <div key={course.id} className={styles.courseCard}>
            <div className={styles.courseCardTop}>
              <span className={styles.courseNum}>Course {i + 1}</span>
              <button
                className={styles.removeBtn}
                onClick={() => handleRemove(course.id)}
                title="Remove course"
              >
                ✕
              </button>
            </div>

            <div className={styles.courseFields}>
              <div className={styles.field}>
                <label className={styles.label}>Course Name *</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="e.g. CS4800 – Software Engineering"
                  value={course.name}
                  onChange={(e) => handleChange(course.id, 'name', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Instructor (optional)</label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="e.g. Dr. Zaidi"
                  value={course.instructor}
                  onChange={(e) => handleChange(course.id, 'instructor', e.target.value)}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Color Label</label>
              <div className={styles.colorPicker}>
                {COLORS.map((color) => (
                  <button
                    key={color}
                    className={`${styles.colorSwatch} ${course.color === color ? styles.colorSelected : ''}`}
                    style={{ background: color }}
                    onClick={() => handleChange(course.id, 'color', color)}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className={styles.addCourseBtn} onClick={handleAdd}>
        + Add {courses.length === 0 ? 'a Course' : 'Another Course'}
      </button>
    </div>
  )
}

function StepSchedule({ courses, setCourses }) {
  function toggleDay(courseId, day) {
    setCourses((prev) =>
      prev.map((c) => {
        if (c.id !== courseId) return c
        const exists = c.schedule.find((s) => s.day === day)
        const schedule = exists
          ? c.schedule.filter((s) => s.day !== day)
          : [...c.schedule, { day, startTime: '09:00', endTime: '10:15' }]
        return { ...c, schedule }
      }),
    )
  }

  function updateTime(courseId, day, field, value) {
    setCourses((prev) =>
      prev.map((c) => {
        if (c.id !== courseId) return c
        const schedule = c.schedule.map((s) =>
          s.day === day ? { ...s, [field]: value } : s,
        )
        return { ...c, schedule }
      }),
    )
  }

  if (courses.length === 0) {
    return (
      <div className={styles.stepContent}>
        <h2 className={styles.stepTitle}>Class Schedule</h2>
        <div className={styles.emptyNote}>
          No courses added yet. Go back and add at least one course to set its schedule.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.stepContent}>
      <h2 className={styles.stepTitle}>Class Schedule</h2>
      <p className={styles.stepDesc}>
        Select which days each class meets and set the start/end times.
      </p>

      <div className={styles.courseList}>
        {courses.map((course) => (
          <div key={course.id} className={styles.courseCard}>
            <div className={styles.courseCardLabel} style={{ borderLeftColor: course.color }}>
              <span className={styles.dot} style={{ background: course.color }} />
              <span className={styles.courseName}>{course.name || '(Unnamed course)'}</span>
            </div>

            <div className={styles.dayToggleRow}>
              {DAYS.map((day) => {
                const active = course.schedule.some((s) => s.day === day)
                return (
                  <button
                    key={day}
                    className={`${styles.dayBtn} ${active ? styles.dayActive : ''}`}
                    style={active ? { background: course.color, borderColor: course.color } : {}}
                    onClick={() => toggleDay(course.id, day)}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {course.schedule.length > 0 && (
              <div className={styles.timeRows}>
                {course.schedule.map((s) => (
                  <div key={s.day} className={styles.timeRow}>
                    <span className={styles.timeDayLabel}>{s.day}</span>
                    <div className={styles.timeInputs}>
                      <input
                        className={styles.timeInput}
                        type="time"
                        value={s.startTime}
                        onChange={(e) => updateTime(course.id, s.day, 'startTime', e.target.value)}
                      />
                      <span className={styles.timeSep}>to</span>
                      <input
                        className={styles.timeInput}
                        type="time"
                        value={s.endTime}
                        onChange={(e) => updateTime(course.id, s.day, 'endTime', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {course.schedule.length === 0 && (
              <p className={styles.noScheduleHint}>Select days above to set times.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StepMaterials({ courses, setCourses }) {
  const fileInputRefs = useRef({})

  function handleFiles(courseId, fileList) {
    const newMaterials = Array.from(fileList).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      type: f.type,
      addedAt: new Date().toISOString(),
    }))
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? { ...c, materials: [...(c.materials || []), ...newMaterials] }
          : c,
      ),
    )
  }

  function removeMaterial(courseId, materialId) {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? { ...c, materials: (c.materials || []).filter((m) => m.id !== materialId) }
          : c,
      ),
    )
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function handleDrop(courseId, e) {
    e.preventDefault()
    handleFiles(courseId, e.dataTransfer.files)
  }

  if (courses.length === 0) {
    return (
      <div className={styles.stepContent}>
        <h2 className={styles.stepTitle}>Course Materials</h2>
        <div className={styles.emptyNote}>
          No courses added yet. Go back and add courses first.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.stepContent}>
      <h2 className={styles.stepTitle}>Course Materials</h2>
      <p className={styles.stepDesc}>
        Attach syllabi, notes, or any files for your courses. You can also skip
        this and add files later from the dashboard.
      </p>

      <div className={styles.courseList}>
        {courses.map((course) => (
          <div key={course.id} className={styles.courseCard}>
            <div className={styles.courseCardLabel} style={{ borderLeftColor: course.color }}>
              <span className={styles.dot} style={{ background: course.color }} />
              <span className={styles.courseName}>{course.name || '(Unnamed course)'}</span>
            </div>

            <div
              className={styles.dropZone}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(course.id, e)}
              onClick={() => fileInputRefs.current[course.id]?.click()}
            >
              <span className={styles.dropIcon}>📎</span>
              <p>Drop files here or <span className={styles.browseLink}>browse</span></p>
              <p className={styles.dropHint}>Syllabus, notes, slides, PDFs…</p>
              <input
                ref={(el) => (fileInputRefs.current[course.id] = el)}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleFiles(course.id, e.target.files)}
              />
            </div>

            {course.materials?.length > 0 && (
              <ul className={styles.materialList}>
                {course.materials.map((m) => (
                  <li key={m.id} className={styles.materialItem}>
                    <span className={styles.fileIcon}>📄</span>
                    <span className={styles.fileName}>{m.name}</span>
                    <span className={styles.fileSize}>{formatSize(m.size)}</span>
                    <button
                      className={styles.removeFileBtn}
                      onClick={() => removeMaterial(course.id, m.id)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StepDone({ courses }) {
  return (
    <div className={styles.stepContent}>
      <div className={styles.doneIcon}>🎉</div>
      <h2 className={styles.stepTitle}>You're all set!</h2>
      <p className={styles.stepDesc}>
        Here's a summary of what was saved. Everything can be edited from the
        dashboard at any time.
      </p>

      {courses.length === 0 ? (
        <div className={styles.emptyNote}>No courses were added. You can add them from the Tasks page.</div>
      ) : (
        <div className={styles.summaryList}>
          {courses.map((c) => (
            <div key={c.id} className={styles.summaryCard} style={{ borderLeftColor: c.color }}>
              <div className={styles.summaryCourseName}>
                <span className={styles.dot} style={{ background: c.color }} />
                {c.name || '(Unnamed)'}
              </div>
              <div className={styles.summaryMeta}>
                {c.instructor && <span>👤 {c.instructor}</span>}
                {c.schedule.length > 0 && (
                  <span>📅 {c.schedule.map((s) => s.day).join(', ')}</span>
                )}
                {c.materials?.length > 0 && (
                  <span>📎 {c.materials.length} file{c.materials.length !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function Onboarding() {
  const { user } = useAuth()
  const { importCourses } = useCourses()
  const navigate = useNavigate()

  // Hooks must come before any conditional returns
  const [step, setStep] = useState(0)
  const [courses, setCourses] = useState([])

  // Redirect already-onboarded users — must be in useEffect, not render
  useEffect(() => {
    if (user && localStorage.getItem(onboardingKey(user.id)) === 'true') {
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  function canAdvance() {
    if (step === 1) {
      // Every added course must have a name
      return courses.every((c) => c.name.trim().length > 0)
    }
    return true
  }

  function handleNext() {
    if (step < TOTAL_STEPS) setStep((s) => s + 1)
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1)
  }

  function handleFinish() {
    importCourses(courses)
    localStorage.setItem(onboardingKey(user.id), 'true')
    navigate('/dashboard', { replace: true })
  }

  const steps = [
    { label: 'Welcome' },
    { label: 'Classes' },
    { label: 'Schedule' },
    { label: 'Materials' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.wizard}>
        {/* Progress bar */}
        <div className={styles.progressBar}>
          {steps.map((s, i) => (
            <div key={s.label} className={styles.progressStep}>
              <div
                className={`${styles.progressDot} ${
                  i < step ? styles.progressDone :
                  i === step ? styles.progressCurrent : ''
                }`}
              >
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`${styles.progressLabel} ${i === step ? styles.progressLabelActive : ''}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className={styles.body}>
          {step === 0 && <StepWelcome user={user} />}
          {step === 1 && <StepClasses courses={courses} setCourses={setCourses} />}
          {step === 2 && <StepSchedule courses={courses} setCourses={setCourses} />}
          {step === 3 && <StepMaterials courses={courses} setCourses={setCourses} />}
          {step === 4 && <StepDone courses={courses} />}
        </div>

        {/* Navigation */}
        <div className={styles.nav}>
          {step > 0 ? (
            <button className={styles.backBtn} onClick={handleBack}>← Back</button>
          ) : (
            <div />
          )}

          <div className={styles.navRight}>
            {step < TOTAL_STEPS && step > 0 && (
              <button className={styles.skipBtn} onClick={handleNext}>
                Skip
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                className={styles.nextBtn}
                onClick={handleNext}
                disabled={!canAdvance()}
              >
                {step === 0 ? "Let's Start →" : 'Next →'}
              </button>
            ) : (
              <button className={styles.finishBtn} onClick={handleFinish}>
                Go to Dashboard →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
