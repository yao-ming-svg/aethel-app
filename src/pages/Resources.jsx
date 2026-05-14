import { useMemo, useRef, useState, useEffect } from 'react'
import { useResources } from '../context/ResourcesContext'
import { ACCEPT_PDF_DOCX, validateChatFile } from '../lib/documentExtract'
import { formatResourceLabelSuggestion, suggestResourceLabelsFromFileName } from '../lib/resourceLabelSuggestions'
import DocumentViewer from '../components/DocumentViewer'
import FlashcardSets from '../components/FlashcardSets'
import '../App.css'
import styles from './Resources.module.css'

function fileKindLabel(mime, name) {
  const n = (name || '').toLowerCase()
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'PDF'
  return 'DOCX'
}

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

/** Options for label dropdown: saved presets plus any extra (e.g. current file label). */
function labelOptionsFor(presets, extraLabel) {
  const set = new Set(presets)
  if (extraLabel) set.add(extraLabel)
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function resourceMatchesKeyword(r, keywordLower) {
  if (!keywordLower) return true
  const name = (r.name || '').toLowerCase()
  const label = (r.label || '').toLowerCase()
  const type = fileKindLabel(r.mime, r.name).toLowerCase()
  return name.includes(keywordLower) || label.includes(keywordLower) || type.includes(keywordLower)
}

export default function Resources() {
  const {
    resources,
    labelPresets,
    courseLabels,
    addResource,
    addLabelPreset,
    renameLabelPreset,
    renameCourseLabelPreset,
    removeLabelPreset,
    updateResourceLabel,
    updateResourceCourseLabel,
    removeResource,
    downloadResource,
  } = useResources()

  const [filterId, setFilterId] = useState('all')
  const [filterCourseId, setFilterCourseId] = useState('all')
  const [searchDraft, setSearchDraft] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [addSelect, setAddSelect] = useState('')
  const [addCourseSelect, setAddCourseSelect] = useState('')
  const [addNewDraft, setAddNewDraft] = useState('')
  const [addFile, setAddFile] = useState(null)
  const [addSuggestion, setAddSuggestion] = useState('')
  const [addAutoFill, setAddAutoFill] = useState({ label: false, course: false })
  const [addBusy, setAddBusy] = useState(false)
  const [banner, setBanner] = useState(null)
  const [labelManagerOpen, setLabelManagerOpen] = useState(false)
  const [labelDrafts, setLabelDrafts] = useState({})
  const [courseDrafts, setCourseDrafts] = useState({})
  const [labelManagerError, setLabelManagerError] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editSelect, setEditSelect] = useState('')
  const [editCourseSelect, setEditCourseSelect] = useState('')
  const [editNewDraft, setEditNewDraft] = useState('')

  const [viewingResourceId, setViewingResourceId] = useState(null)

  const addFileRef = useRef(null)

  // Handle keyboard shortcuts for document viewer
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && viewingResourceId) {
        setViewingResourceId(null)
      }
    }

    if (viewingResourceId) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [viewingResourceId])

  const labelFiltered = useMemo(() => {
    if (filterId === 'all') return resources
    if (filterId === 'none') return resources.filter((r) => !r.label)
    return resources.filter((r) => r.label === filterId)
  }, [resources, filterId])

  const usedResourceLabels = useMemo(() => {
    const set = new Set()
    for (const resource of resources) {
      const label = typeof resource.label === 'string' ? resource.label.trim().toLowerCase() : ''
      if (label) set.add(label)
    }
    return set
  }, [resources])

  const courseFiltered = useMemo(() => {
    if (filterCourseId === 'all') return labelFiltered
    if (filterCourseId === 'none') return labelFiltered.filter((r) => !r.courseLabel)
    return labelFiltered.filter((r) => r.courseLabel === filterCourseId)
  }, [labelFiltered, filterCourseId])

  const searchLower = searchKeyword.trim().toLowerCase()

  const visibleResources = useMemo(() => {
    if (!searchLower) return courseFiltered
    return courseFiltered.filter((r) => resourceMatchesKeyword(r, searchLower))
  }, [courseFiltered, searchLower])

  function applySearch(e) {
    e?.preventDefault()
    setSearchKeyword(searchDraft.trim())
  }

  function clearSearch() {
    setSearchDraft('')
    setSearchKeyword('')
  }

  function openAdd() {
    setAddSelect('')
    setAddCourseSelect('')
    setAddNewDraft('')
    setAddFile(null)
    setAddSuggestion('')
    setAddAutoFill({ label: false, course: false })
    setBanner(null)
    setShowAdd(true)
    if (addFileRef.current) addFileRef.current.value = ''
  }

  function openLabelManager() {
    setLabelDrafts(Object.fromEntries(labelPresets.map((label) => [label, label])))
    setCourseDrafts(Object.fromEntries(courseLabels.map((label) => [label, label])))
    setLabelManagerOpen(true)
    setLabelManagerError('')
  }

  function saveManagedLabel(label) {
    const result = renameLabelPreset(label, labelDrafts[label])
    if (!result.ok) {
      setLabelManagerError(result.error || 'Could not update label.')
      return
    }

    if (filterId === label) setFilterId(result.label)
    setLabelManagerError('')
    setLabelDrafts((prev) => {
      const next = { ...prev }
      delete next[label]
      next[result.label] = result.label
      return next
    })
    setBanner({ type: 'success', text: 'Label updated.' })
    setTimeout(() => setBanner(null), 3000)
  }

  function removeManagedLabel(label) {
    const result = removeLabelPreset(label)
    if (!result.ok) {
      setLabelManagerError(result.error || 'Could not remove label.')
      return
    }

    if (filterId === label) setFilterId('all')
    setLabelManagerError('')
    setLabelDrafts((prev) => {
      const next = { ...prev }
      delete next[label]
      return next
    })
    setBanner({ type: 'success', text: 'Label removed.' })
    setTimeout(() => setBanner(null), 3000)
  }

  function saveManagedCourse(label) {
    const result = renameCourseLabelPreset(label, courseDrafts[label])
    if (!result.ok) {
      setLabelManagerError(result.error || 'Could not update course.')
      return
    }

    if (filterCourseId === label) setFilterCourseId(result.label)
    setLabelManagerError('')
    setCourseDrafts((prev) => {
      const next = { ...prev }
      delete next[label]
      next[result.label] = result.label
      return next
    })
    setBanner({ type: 'success', text: 'Course updated.' })
    setTimeout(() => setBanner(null), 3000)
  }

  function applyFileNameSuggestions(file) {
    const { label: suggestedLabel, courseLabel: suggestedCourse } = suggestResourceLabelsFromFileName(
      file.name,
      labelPresets,
      courseLabels,
    )
    const canApplyLabel = addSelect !== '__create__' && (!addSelect || addAutoFill.label)
    const canApplyCourse = !addCourseSelect || addAutoFill.course
    let appliedLabel = ''
    let appliedCourse = ''

    if (canApplyLabel) {
      setAddSelect(suggestedLabel || '')
      setAddNewDraft('')
      appliedLabel = suggestedLabel
    }

    if (canApplyCourse) {
      setAddCourseSelect(suggestedCourse || '')
      appliedCourse = suggestedCourse
    }

    setAddAutoFill({
      label: Boolean(appliedLabel),
      course: Boolean(appliedCourse),
    })

    if (appliedLabel || appliedCourse || (!suggestedLabel && !suggestedCourse)) {
      setAddSuggestion(formatResourceLabelSuggestion({ label: appliedLabel, courseLabel: appliedCourse }))
      return
    }

    setAddSuggestion('Found a matching label or course from the file name, but kept your current selection.')
  }

  async function submitAdd(e) {
    e.preventDefault()
    if (!addFile) {
      setBanner({ type: 'error', text: 'Choose a PDF or Word (.docx) file.' })
      return
    }

    let resolvedLabel = null
    if (addSelect === '__create__') {
      const t = addNewDraft.trim()
      if (t) {
        const added = addLabelPreset(t)
        if (!added.ok) {
          setBanner({ type: 'error', text: added.error || 'Could not add label.' })
          return
        }
        resolvedLabel = added.label
      }
    } else if (addSelect) {
      resolvedLabel = addSelect
    }

    const resolvedCourseLabel = addCourseSelect || null

    setAddBusy(true)
    setBanner(null)
    const result = await addResource({
      file: addFile,
      label: resolvedLabel,
      courseLabel: resolvedCourseLabel,
    })
    setAddBusy(false)
    if (!result.ok) {
      setBanner({ type: 'error', text: result.error })
      return
    }
    setShowAdd(false)
    setAddFile(null)
    setAddSelect('')
    setAddCourseSelect('')
    setAddNewDraft('')
    setAddSuggestion('')
    setAddAutoFill({ label: false, course: false })
    if (addFileRef.current) addFileRef.current.value = ''
    setBanner({ type: 'success', text: 'Resource saved.' })
    setTimeout(() => setBanner(null), 4000)
  }

  function startEdit(r) {
    setEditingId(r.id)
    setEditSelect(r.label ?? '')
    setEditCourseSelect(r.courseLabel ?? '')
    setEditNewDraft('')
  }

  function saveEdit() {
    if (!editingId) return

    let next = null
    if (editSelect === '__create__') {
      const t = editNewDraft.trim()
      if (!t) {
        setBanner({ type: 'error', text: 'Enter a label name or choose No label.' })
        setTimeout(() => setBanner(null), 5000)
        return
      }
      const added = addLabelPreset(t)
      if (!added.ok) {
        setBanner({ type: 'error', text: added.error || 'Could not add label.' })
        return
      }
      next = added.label
    } else if (editSelect) {
      next = editSelect
    }

    const nextCourse = editCourseSelect || null

    updateResourceLabel(editingId, next)
    updateResourceCourseLabel(editingId, nextCourse)
    setEditingId(null)
    setBanner(null)
  }

  async function onDownload(id) {
    setBanner(null)
    const r = await downloadResource(id)
    if (!r.ok) setBanner({ type: 'error', text: r.error || 'Download failed.' })
  }

  return (
    <div className="page">
      <div className={styles.header}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Resources</h1>
          <p>Discover and save study materials for your subjects.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          + Add Resource
        </button>
      </div>

      {banner && (
        <div
          className={`${styles.banner} ${banner.type === 'error' ? styles.bannerError : styles.bannerOk}`}
          role="status"
        >
          {banner.text}
        </div>
      )}

      {showAdd && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => !addBusy && setShowAdd(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-labelledby="add-resource-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-resource-title" className={styles.modalTitle}>
              Add resource
            </h2>
            <p className={styles.modalDesc}>PDF or Word (.docx) only, up to 15 MB.</p>
            <form onSubmit={submitAdd} className={styles.modalForm}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="resource-file">
                  File
                </label>
                <input
                  id="resource-file"
                  ref={addFileRef}
                  className={styles.fileInput}
                  type="file"
                  accept={ACCEPT_PDF_DOCX}
                  title="PDF or Word (.docx) only"
                  disabled={addBusy}
                  onChange={(e) => {
                    const input = e.target
                    const f = input.files?.[0] ?? null
                    if (!f) {
                      setAddFile(null)
                      setAddSuggestion('')
                      return
                    }
                    const check = validateChatFile(f)
                    if (!check.ok) {
                      setBanner({ type: 'error', text: check.error })
                      setAddFile(null)
                      setAddSuggestion('')
                      input.value = ''
                      return
                    }
                    setBanner(null)
                    setAddFile(f)
                    applyFileNameSuggestions(f)
                  }}
                />
                {addSuggestion && <p className={styles.suggestionHint}>{addSuggestion}</p>}
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="resource-label-select">
                  Label <span className={styles.optional}>(optional)</span>
                </label>
                <select
                  id="resource-label-select"
                  className={styles.selectInput}
                  value={addSelect}
                  onChange={(e) => {
                    const v = e.target.value
                    setAddSelect(v)
                    setAddAutoFill((prev) => ({ ...prev, label: false }))
                    if (v !== '__create__') setAddNewDraft('')
                  }}
                  disabled={addBusy}
                >
                  <option value="">No label</option>
                  {labelPresets.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  <option value="__create__">+ Add new label…</option>
                </select>
                {addSelect === '__create__' && (
                  <div className={styles.newLabelRow}>
                    <input
                      className={styles.textInput}
                      type="text"
                      placeholder="New label name"
                      value={addNewDraft}
                      onChange={(e) => setAddNewDraft(e.target.value)}
                      disabled={addBusy}
                      maxLength={120}
                      aria-label="New label name"
                    />
                    <button
                      type="button"
                      className={`btn btn-outline ${styles.btnSm}`}
                      disabled={addBusy || !addNewDraft.trim()}
                      onClick={() => {
                        const r = addLabelPreset(addNewDraft)
                        if (r.ok) {
                          setAddSelect(r.label)
                          setAddAutoFill((prev) => ({ ...prev, label: false }))
                          setAddNewDraft('')
                        } else {
                          setBanner({ type: 'error', text: r.error || 'Invalid label.' })
                        }
                      }}
                    >
                      Save label
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="resource-course-select">
                  Course <span className={styles.optional}>(optional)</span>
                </label>
                <select
                  id="resource-course-select"
                  className={styles.selectInput}
                  value={addCourseSelect}
                  onChange={(e) => {
                    const v = e.target.value
                    setAddCourseSelect(v)
                    setAddAutoFill((prev) => ({ ...prev, course: false }))
                  }}
                  disabled={addBusy}
                >
                  <option value="">No course</option>
                  {courseLabels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-outline" disabled={addBusy} onClick={() => setShowAdd(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={addBusy}>
                  {addBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {labelManagerOpen && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setLabelManagerOpen(false)}>
          <div
            className={`${styles.modal} ${styles.labelManagerModal}`}
            role="dialog"
            aria-labelledby="label-manager-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="label-manager-title" className={styles.modalTitle}>
              Edit labels
            </h2>
            {labelManagerError && (
              <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
                {labelManagerError}
              </div>
            )}

            <div className={styles.managerSections}>
              <section className={styles.managerSection}>
                <h3 className={styles.managerTitle}>Resource labels</h3>
                <div className={styles.managerList}>
                  {labelPresets.map((label) => {
                    const draft = labelDrafts[label] ?? label
                    const isUsed = usedResourceLabels.has(label.trim().toLowerCase())
                    return (
                      <div className={styles.managerRow} key={label}>
                        <input
                          className={styles.textInput}
                          type="text"
                          value={draft}
                          onChange={(e) => setLabelDrafts((prev) => ({ ...prev, [label]: e.target.value }))}
                          maxLength={120}
                          aria-label={`Edit ${label} label`}
                        />
                        <button
                          type="button"
                          className={`btn btn-outline ${styles.btnSm}`}
                          disabled={!draft.trim() || draft.trim() === label}
                          onClick={() => saveManagedLabel(label)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className={`btn btn-outline ${styles.btnSm} ${styles.btnDanger}`}
                          disabled={isUsed}
                          title={isUsed ? 'Remove this label from resources before deleting it.' : 'Remove unused label'}
                          onClick={() => removeManagedLabel(label)}
                        >
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className={styles.managerSection}>
                <h3 className={styles.managerTitle}>Courses</h3>
                {courseLabels.length === 0 ? (
                  <p className={styles.managerEmpty}>No course labels yet.</p>
                ) : (
                  <div className={styles.managerList}>
                    {courseLabels.map((label) => {
                      const draft = courseDrafts[label] ?? label
                      return (
                        <div className={styles.managerRow} key={label}>
                          <input
                            className={styles.textInput}
                            type="text"
                            value={draft}
                            onChange={(e) => setCourseDrafts((prev) => ({ ...prev, [label]: e.target.value }))}
                            maxLength={120}
                            aria-label={`Edit ${label} course`}
                          />
                          <button
                            type="button"
                            className={`btn btn-outline ${styles.btnSm}`}
                            disabled={!draft.trim() || draft.trim() === label}
                            onClick={() => saveManagedCourse(label)}
                          >
                            Save
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

            <div className={styles.modalActions}>
              <button type="button" className="btn btn-primary" onClick={() => setLabelManagerOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <form className={styles.searchBar} onSubmit={applySearch} role="search">
          <input
            className={styles.searchInput}
            type="search"
            name="resource-search"
            placeholder="Search by file name, label, type, or flashcard set..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            aria-label="Search saved resources"
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
          {(searchKeyword.trim() || searchDraft.trim()) && (
            <button type="button" className="btn btn-outline" onClick={clearSearch}>
              Clear
            </button>
          )}
        </form>
      </div>

      <div className={styles.filterRow} style={{ marginTop: 16 }}>
        <button
          type="button"
          className={`${styles.filterBtn} ${filterId === 'all' ? styles.filterActive : ''}`}
          onClick={() => setFilterId('all')}
        >
          All
        </button>
        <button
          type="button"
          className={`${styles.filterBtn} ${filterId === 'none' ? styles.filterActive : ''}`}
          onClick={() => setFilterId('none')}
        >
          No label
        </button>
        {labelPresets.map((label) => (
          <button
            key={label}
            type="button"
            className={`${styles.filterBtn} ${filterId === label ? styles.filterActive : ''}`}
            onClick={() => setFilterId(label)}
          >
            {label}
          </button>
        ))}
        <button type="button" className={`btn btn-outline ${styles.btnSm}`} onClick={openLabelManager}>
          Edit labels
        </button>
      </div>

      <div className={styles.filterRow} style={{ marginTop: 12 }}>
        <span style={{ fontWeight: 600, marginRight: 8, display: 'inline-block' }}>Courses:</span>
        <button
          type="button"
          className={`${styles.filterBtn} ${filterCourseId === 'all' ? styles.filterActive : ''}`}
          onClick={() => setFilterCourseId('all')}
        >
          All
        </button>
        <button
          type="button"
          className={`${styles.filterBtn} ${filterCourseId === 'none' ? styles.filterActive : ''}`}
          onClick={() => setFilterCourseId('none')}
        >
          No course
        </button>
        {courseLabels.map((label) => (
          <button
            key={label}
            type="button"
            className={`${styles.filterBtn} ${filterCourseId === label ? styles.filterActive : ''}`}
            onClick={() => setFilterCourseId(label)}
          >
            {label}
          </button>
        ))}
      </div>

      <FlashcardSets filterCourseId={filterCourseId} searchKeyword={searchKeyword} />

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className={styles.sectionTitle}>Saved resources</h2>
        <p className={styles.savedHint}>
          Newest uploads appear first. Use label chips to narrow by category, then Search to filter by keyword (file
          name, label, or type).
        </p>
        {resources.length === 0 ? (
          <div className="placeholder-block" style={{ marginTop: 12 }}>
            <p>No saved resources yet. Use &quot;+ Add Resource&quot; or attach a file in AI Assistant.</p>
          </div>
        ) : labelFiltered.length === 0 ? (
          <div className="placeholder-block" style={{ marginTop: 12 }}>
            <p>No resources match this label filter.</p>
          </div>
        ) : courseFiltered.length === 0 ? (
          <div className="placeholder-block" style={{ marginTop: 12 }}>
            <p>No resources match this course filter.</p>
          </div>
        ) : visibleResources.length === 0 ? (
          <div className="placeholder-block" style={{ marginTop: 12 }}>
            <p>
              No resources match &quot;{searchKeyword.trim()}&quot;. Try a different keyword or{' '}
              <button type="button" className={styles.inlineLink} onClick={clearSearch}>
                clear search
              </button>
              .
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Label</th>
                  <th>Course</th>
                  <th>Type</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleResources.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.cellName} title={r.name}>
                      {r.name}
                    </td>
                    <td className={styles.cellLabel}>
                      {editingId === r.id ? (
                        <div className={styles.editCol}>
                          <select
                            className={styles.selectInput}
                            value={editSelect}
                            onChange={(e) => {
                              const v = e.target.value
                              setEditSelect(v)
                              if (v !== '__create__') setEditNewDraft('')
                            }}
                            aria-label="Choose label"
                          >
                            <option value="">No label</option>
                            {labelOptionsFor(labelPresets, r.label || undefined).map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                            <option value="__create__">+ Add new label…</option>
                          </select>
                          {editSelect === '__create__' && (
                            <div className={styles.newLabelRow}>
                              <input
                                className={styles.textInput}
                                type="text"
                                placeholder="New label name"
                                value={editNewDraft}
                                onChange={(e) => setEditNewDraft(e.target.value)}
                                maxLength={120}
                                aria-label="New label name"
                              />
                              <button
                                type="button"
                                className={`btn btn-outline ${styles.btnSm}`}
                                disabled={!editNewDraft.trim()}
                                onClick={() => {
                                  const res = addLabelPreset(editNewDraft)
                                  if (res.ok) {
                                    setEditSelect(res.label)
                                    setEditNewDraft('')
                                  } else {
                                    setBanner({ type: 'error', text: res.error || 'Invalid label.' })
                                  }
                                }}
                              >
                                Save label
                              </button>
                            </div>
                          )}
                          <div className={styles.editActions}>
                            <button type="button" className={`btn btn-primary ${styles.btnSm}`} onClick={saveEdit}>
                              Save
                            </button>
                            <button
                              type="button"
                              className={`btn btn-outline ${styles.btnSm}`}
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.labelRow}>
                          <span className={r.label ? styles.labelText : styles.labelNone}>
                            {r.label || 'No label'}
                          </span>
                          <button type="button" className={`btn btn-outline ${styles.btnSm}`} onClick={() => startEdit(r)}>
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                    <td className={styles.cellLabel}>
                      {editingId === r.id ? (
                        <div className={styles.editCol}>
                          <select
                            className={styles.selectInput}
                            value={editCourseSelect}
                            onChange={(e) => {
                              setEditCourseSelect(e.target.value)
                            }}
                            aria-label="Choose course"
                          >
                            <option value="">No course</option>
                            {labelOptionsFor(courseLabels, r.courseLabel || undefined).map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <div className={styles.editActions}>
                            <button type="button" className={`btn btn-primary ${styles.btnSm}`} onClick={saveEdit}>
                              Save
                            </button>
                            <button
                              type="button"
                              className={`btn btn-outline ${styles.btnSm}`}
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.labelRow}>
                          <span className={r.courseLabel ? styles.labelText : styles.labelNone}>
                            {r.courseLabel || 'No course'}
                          </span>
                          <button type="button" className={`btn btn-outline ${styles.btnSm}`} onClick={() => startEdit(r)}>
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                    <td>{fileKindLabel(r.mime, r.name)}</td>
                    <td className={styles.cellDate}>{formatAdded(r.createdAt)}</td>
                    <td className={styles.cellActions}>
                      <button
                        type="button"
                        className={`btn btn-outline ${styles.btnSm}`}
                        onClick={() => setViewingResourceId(r.id)}
                        title="View document"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className={`btn btn-outline ${styles.btnSm}`}
                        onClick={() => onDownload(r.id)}
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        className={`btn btn-outline ${styles.btnSm} ${styles.btnDanger}`}
                        onClick={() => removeResource(r.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingResourceId && (
        <DocumentViewer
          resource={resources.find((r) => r.id === viewingResourceId)}
          onClose={() => setViewingResourceId(null)}
        />
      )}
    </div>
  )
}
