import { useMemo, useState } from 'react'
import { useResources } from '../context/ResourcesContext'
import styles from './FlashcardSets.module.css'

function formatAdded(iso) {
  try {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
    const date = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(iso)

    if (Number.isNaN(date.getTime())) return iso
    return date.toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return iso
  }
}

function courseOptionsFor(presets, currentCourse) {
  const set = new Set(presets)
  if (currentCourse) set.add(currentCourse)
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function setMatchesKeyword(set, keywordLower) {
  if (!keywordLower) return true
  const name = (set.name || '').toLowerCase()
  const course = (set.courseLabel || '').toLowerCase()
  const source = (set.sourceResourceName || '').toLowerCase()
  return name.includes(keywordLower) || course.includes(keywordLower) || source.includes(keywordLower)
}

function newDraftCard(card = {}) {
  return {
    id: card.id || crypto.randomUUID(),
    front: card.front || '',
    answer: card.answer || '',
  }
}

export default function FlashcardSets({ filterCourseId = 'all', searchKeyword = '' }) {
  const {
    flashcardSets,
    courseLabels,
    addCourseLabelPreset,
    addFlashcardSet,
    updateFlashcardSet,
    removeFlashcardSet,
  } = useResources()

  const [modalMode, setModalMode] = useState(null)
  const [editingSet, setEditingSet] = useState(null)
  const [setName, setSetName] = useState('')
  const [courseSelect, setCourseSelect] = useState('')
  const [newCourseDraft, setNewCourseDraft] = useState('')
  const [cardDrafts, setCardDrafts] = useState([newDraftCard()])
  const [editorIndex, setEditorIndex] = useState(0)
  const [modalError, setModalError] = useState(null)
  const [banner, setBanner] = useState(null)
  const [studySetId, setStudySetId] = useState(null)
  const [studyIndex, setStudyIndex] = useState(0)
  const [answerVisible, setAnswerVisible] = useState(false)

  const searchLower = searchKeyword.trim().toLowerCase()

  const visibleSets = useMemo(() => {
    const courseFiltered =
      filterCourseId === 'all'
        ? flashcardSets
        : filterCourseId === 'none'
          ? flashcardSets.filter((set) => !set.courseLabel)
          : flashcardSets.filter((set) => set.courseLabel === filterCourseId)

    return courseFiltered.filter((set) => setMatchesKeyword(set, searchLower))
  }, [filterCourseId, flashcardSets, searchLower])

  const activeStudySet = flashcardSets.find((set) => set.id === studySetId)
  const activeStudyCard = activeStudySet?.cards?.[studyIndex]

  function openCreate() {
    setModalMode('create')
    setEditingSet(null)
    setSetName('')
    setCourseSelect('')
    setNewCourseDraft('')
    setCardDrafts([newDraftCard()])
    setEditorIndex(0)
    setModalError(null)
  }

  function openEdit(set) {
    setModalMode('edit')
    setEditingSet(set)
    setSetName(set.name || '')
    setCourseSelect(set.courseLabel || '')
    setNewCourseDraft('')
    setCardDrafts(set.cards?.length ? set.cards.map((card) => newDraftCard(card)) : [newDraftCard()])
    setEditorIndex(0)
    setModalError(null)
  }

  function closeModal() {
    setModalMode(null)
    setEditingSet(null)
    setModalError(null)
  }

  function resolveCourseLabel() {
    if (courseSelect === '__create__') {
      const trimmed = newCourseDraft.trim()
      if (!trimmed) return { ok: true, label: null }
      const added = addCourseLabelPreset(trimmed)
      if (!added.ok) return added
      return { ok: true, label: added.label }
    }

    return { ok: true, label: courseSelect || null }
  }

  function updateDraftCard(field, value) {
    setCardDrafts((cards) =>
      cards.map((card, index) => (index === editorIndex ? { ...card, [field]: value } : card)),
    )
  }

  function addDraftCard() {
    const nextCard = newDraftCard()
    setCardDrafts((cards) => [...cards, nextCard])
    setEditorIndex(cardDrafts.length)
    setModalError(null)
  }

  function removeDraftCard() {
    if (cardDrafts.length <= 1) {
      setCardDrafts([newDraftCard()])
      setEditorIndex(0)
      setModalError(null)
      return
    }

    setCardDrafts((cards) => cards.filter((_, index) => index !== editorIndex))
    setEditorIndex((index) => Math.max(Math.min(index, cardDrafts.length - 2), 0))
    setModalError(null)
  }

  function goToEditorCard(nextIndex) {
    setEditorIndex(Math.min(Math.max(nextIndex, 0), cardDrafts.length - 1))
    setModalError(null)
  }

  function submitFlashcardSet(e) {
    e.preventDefault()
    setModalError(null)

    const cards = cardDrafts
      .map((card) => ({
        id: card.id,
        front: card.front.trim(),
        answer: card.answer.trim(),
      }))
      .filter((card) => card.front || card.answer)

    if (cards.length === 0) {
      setModalError('Add at least one flashcard.')
      return
    }

    const firstIncompleteDraftIndex = cardDrafts.findIndex((card) => {
      const hasFront = card.front.trim().length > 0
      const hasAnswer = card.answer.trim().length > 0
      return (hasFront || hasAnswer) && (!hasFront || !hasAnswer)
    })

    if (firstIncompleteDraftIndex !== -1) {
      setEditorIndex(firstIncompleteDraftIndex)
      setModalError('Complete both the front and answer for this card.')
      return
    }

    const course = resolveCourseLabel()
    if (!course.ok) {
      setModalError(course.error || 'Could not save class label.')
      return
    }

    const result =
      modalMode === 'edit' && editingSet
        ? updateFlashcardSet(editingSet.id, {
            name: setName,
            courseLabel: course.label,
            cards,
          })
        : addFlashcardSet({
            name: setName,
            courseLabel: course.label,
            cards,
          })

    if (!result.ok) {
      setModalError(result.error)
      return
    }

    closeModal()
    setBanner({ type: 'success', text: modalMode === 'edit' ? 'Flashcard set updated.' : 'Flashcard set saved.' })
    setTimeout(() => setBanner(null), 3500)
  }

  function startStudy(set) {
    setStudySetId(set.id)
    setStudyIndex(0)
    setAnswerVisible(false)
  }

  function closeStudy() {
    setStudySetId(null)
    setStudyIndex(0)
    setAnswerVisible(false)
  }

  function goToStudyCard(nextIndex) {
    if (!activeStudySet) return
    const max = activeStudySet.cards.length - 1
    setStudyIndex(Math.min(Math.max(nextIndex, 0), max))
    setAnswerVisible(false)
  }

  function removeSet(id) {
    removeFlashcardSet(id)
    if (studySetId === id) closeStudy()
    setBanner({ type: 'success', text: 'Flashcard set removed.' })
    setTimeout(() => setBanner(null), 3500)
  }

  const activeDraftCard = cardDrafts[editorIndex] || cardDrafts[0]

  return (
    <>
      <div className="card" style={{ marginTop: 16 }}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Flashcard sets</h2>
            <p className={styles.sectionHint}>Create, save, and review class-labeled study cards.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Create Flashcards
          </button>
        </div>

        {banner && (
          <div className={`${styles.banner} ${banner.type === 'error' ? styles.bannerError : styles.bannerOk}`}>
            {banner.text}
          </div>
        )}

        {flashcardSets.length === 0 ? (
          <div className="placeholder-block" style={{ marginTop: 12 }}>
            <p>No flashcard sets yet.</p>
          </div>
        ) : visibleSets.length === 0 ? (
          <div className="placeholder-block" style={{ marginTop: 12 }}>
            <p>No flashcard sets match the current filters.</p>
          </div>
        ) : (
          <div className={styles.setGrid}>
            {visibleSets.map((set) => (
              <article key={set.id} className={styles.setCard}>
                <div className={styles.setTopRow}>
                  <h3 className={styles.setName}>{set.name}</h3>
                  <span className={styles.countBadge}>{set.cards.length}</span>
                </div>
                <div className={styles.setMeta}>
                  <span>{set.courseLabel || 'No class'}</span>
                  <span>{formatAdded(set.createdAt)}</span>
                </div>
                {set.sourceResourceName && (
                  <p className={styles.sourceText} title={set.sourceResourceName}>
                    Source: {set.sourceResourceName}
                  </p>
                )}
                <div className={styles.setActions}>
                  <button type="button" className={`btn btn-primary ${styles.btnSm}`} onClick={() => startStudy(set)}>
                    Study
                  </button>
                  <button type="button" className={`btn btn-outline ${styles.btnSm}`} onClick={() => openEdit(set)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`btn btn-outline ${styles.btnSm} ${styles.btnDanger}`}
                    onClick={() => removeSet(set.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {modalMode && (
        <div className={styles.modalBackdrop} role="presentation" onClick={closeModal}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="flashcard-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.studyHeader}>
              <div>
                <h2 id="flashcard-modal-title" className={styles.modalTitle}>
                  {modalMode === 'edit' ? 'Edit flashcard set' : 'Create flashcard set'}
                </h2>
                <p className={styles.studyProgress}>
                  Card {editorIndex + 1} of {cardDrafts.length}
                </p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label="Close flashcard editor">
                x
              </button>
            </div>
            {modalError && <div className={styles.modalError}>{modalError}</div>}
            <form className={styles.modalForm} onSubmit={submitFlashcardSet}>
              <div className={styles.metaGrid}>
                <div className={styles.field}>
                <label className={styles.label} htmlFor="flashcard-set-name">
                  Name
                </label>
                <input
                  id="flashcard-set-name"
                  className={styles.textInput}
                  type="text"
                  value={setName}
                  onChange={(e) => setSetName(e.target.value)}
                  maxLength={140}
                  required
                />
                </div>
                <div className={styles.field}>
                <label className={styles.label} htmlFor="flashcard-class-select">
                  Class
                </label>
                <select
                  id="flashcard-class-select"
                  className={styles.selectInput}
                  value={courseSelect}
                  onChange={(e) => {
                    const value = e.target.value
                    setCourseSelect(value)
                    if (value !== '__create__') setNewCourseDraft('')
                  }}
                >
                  <option value="">No class</option>
                  {courseOptionsFor(courseLabels, editingSet?.courseLabel).map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                  <option value="__create__">+ Add new class</option>
                </select>
                {courseSelect === '__create__' && (
                  <input
                    className={styles.textInput}
                    type="text"
                    value={newCourseDraft}
                    onChange={(e) => setNewCourseDraft(e.target.value)}
                    maxLength={120}
                    placeholder="New class name"
                  />
                )}
                </div>
              </div>

              <div className={styles.editorCard}>
                <div className={styles.editorField}>
                  <label className={styles.studyLabel} htmlFor="flashcard-front">
                    Front
                  </label>
                  <textarea
                    id="flashcard-front"
                    className={styles.cardTextarea}
                    value={activeDraftCard?.front || ''}
                    onChange={(e) => updateDraftCard('front', e.target.value)}
                    placeholder="Question, term, or prompt"
                    rows="5"
                  />
                </div>
                <div className={styles.editorDivider} />
                <div className={styles.editorField}>
                  <label className={styles.studyLabel} htmlFor="flashcard-answer">
                    Answer
                  </label>
                  <textarea
                    id="flashcard-answer"
                    className={styles.cardTextarea}
                    value={activeDraftCard?.answer || ''}
                    onChange={(e) => updateDraftCard('answer', e.target.value)}
                    placeholder="Answer, definition, or explanation"
                    rows="5"
                  />
                </div>
              </div>

              <div className={styles.editorActions}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => goToEditorCard(editorIndex - 1)}
                  disabled={editorIndex === 0}
                >
                  Previous
                </button>
                <button type="button" className="btn btn-outline" onClick={addDraftCard}>
                  Add card
                </button>
                <button type="button" className={`btn btn-outline ${styles.btnDanger}`} onClick={removeDraftCard}>
                  Remove card
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => goToEditorCard(editorIndex + 1)}
                  disabled={editorIndex >= cardDrafts.length - 1}
                >
                  Next
                </button>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-outline" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeStudySet && activeStudyCard && (
        <div className={styles.modalBackdrop} role="presentation" onClick={closeStudy}>
          <div
            className={`${styles.modal} ${styles.studyModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="study-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.studyHeader}>
              <div>
                <h2 id="study-modal-title" className={styles.modalTitle}>
                  {activeStudySet.name}
                </h2>
                <p className={styles.studyProgress}>
                  Card {studyIndex + 1} of {activeStudySet.cards.length}
                </p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={closeStudy} aria-label="Close study mode">
                x
              </button>
            </div>

            <div className={styles.studyCard}>
              <span className={styles.studyLabel}>Front</span>
              <p>{activeStudyCard.front}</p>
              {answerVisible && (
                <div className={styles.answerBlock}>
                  <span className={styles.studyLabel}>Answer</span>
                  <p>{activeStudyCard.answer}</p>
                </div>
              )}
            </div>

            <div className={styles.studyActions}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => goToStudyCard(studyIndex - 1)}
                disabled={studyIndex === 0}
              >
                Previous
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setAnswerVisible((value) => !value)}>
                {answerVisible ? 'Hide answer' : 'Show answer'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => goToStudyCard(studyIndex + 1)}
                disabled={studyIndex >= activeStudySet.cards.length - 1}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
