import { useMemo, useRef, useState, useEffect } from 'react'
import { useResources } from '../context/ResourcesContext'
import { ACCEPT_PDF_DOCX, validateChatFile } from '../lib/documentExtract'
import DocumentViewer from '../components/DocumentViewer'
import '../App.css'
import styles from './Resources.module.css'

function fileKindLabel(mime, name) {
  const n = (name || '').toLowerCase()
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'PDF'
  return 'DOCX'
}

function formatAdded(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
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
    addCourseLabelPreset,
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
  const [addNewCourseDraft, setAddNewCourseDraft] = useState('')
  const [addFile, setAddFile] = useState(null)
  const [addBusy, setAddBusy] = useState(false)
  const [banner, setBanner] = useState(null)

  const [editingId, setEditingId] = useState(null)
  const [editSelect, setEditSelect] = useState('')
  const [editCourseSelect, setEditCourseSelect] = useState('')
  const [editNewDraft, setEditNewDraft] = useState('')
  const [editNewCourseDraft, setEditNewCourseDraft] = useState('')

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
    setAddNewCourseDraft('')
    setAddFile(null)
    setBanner(null)
    setShowAdd(true)
    if (addFileRef.current) addFileRef.current.value = ''
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

    let resolvedCourseLabel = null
    if (addCourseSelect === '__create__') {
      const t = addNewCourseDraft.trim()
      if (t) {
        const added = addCourseLabelPreset(t)
        if (!added.ok) {
          setBanner({ type: 'error', text: added.error || 'Could not add course label.' })
          return
        }
        resolvedCourseLabel = added.label
      }
    } else if (addCourseSelect) {
      resolvedCourseLabel = addCourseSelect
    }

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
    setAddNewCourseDraft('')
    if (addFileRef.current) addFileRef.current.value = ''
    setBanner({ type: 'success', text: 'Resource saved.' })
    setTimeout(() => setBanner(null), 4000)
  }

  function startEdit(r) {
    setEditingId(r.id)
    setEditSelect(r.label ?? '')
    setEditCourseSelect(r.courseLabel ?? '')
    setEditNewDraft('')
    setEditNewCourseDraft('')
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

    let nextCourse = null
    if (editCourseSelect === '__create__') {
      const t = editNewCourseDraft.trim()
      if (!t) {
        setBanner({ type: 'error', text: 'Enter a course name or choose No course.' })
        setTimeout(() => setBanner(null), 5000)
        return
      }
      const added = addCourseLabelPreset(t)
      if (!added.ok) {
        setBanner({ type: 'error', text: added.error || 'Could not add course label.' })
        return
      }
      nextCourse = added.label
    } else if (editCourseSelect) {
      nextCourse = editCourseSelect
    }

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
                      return
                    }
                    const check = validateChatFile(f)
                    if (!check.ok) {
                      setBanner({ type: 'error', text: check.error })
                      setAddFile(null)
                      input.value = ''
                      return
                    }
                    setBanner(null)
                    setAddFile(f)
                  }}
                />
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
                    if (v !== '__create__') setAddNewCourseDraft('')
                  }}
                  disabled={addBusy}
                >
                  <option value="">No course</option>
                  {courseLabels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  <option value="__create__">+ Add new course…</option>
                </select>
                {addCourseSelect === '__create__' && (
                  <div className={styles.newLabelRow}>
                    <input
                      className={styles.textInput}
                      type="text"
                      placeholder="New course name"
                      value={addNewCourseDraft}
                      onChange={(e) => setAddNewCourseDraft(e.target.value)}
                      disabled={addBusy}
                      maxLength={120}
                      aria-label="New course name"
                    />
                    <button
                      type="button"
                      className={`btn btn-outline ${styles.btnSm}`}
                      disabled={addBusy || !addNewCourseDraft.trim()}
                      onClick={() => {
                        const r = addCourseLabelPreset(addNewCourseDraft)
                        if (r.ok) {
                          setAddCourseSelect(r.label)
                          setAddNewCourseDraft('')
                        } else {
                          setBanner({ type: 'error', text: r.error || 'Invalid course.' })
                        }
                      }}
                    >
                      Save course
                    </button>
                  </div>
                )}
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

      <div className="card" style={{ marginTop: 20 }}>
        <form className={styles.searchBar} onSubmit={applySearch} role="search">
          <input
            className={styles.searchInput}
            type="search"
            name="resource-search"
            placeholder="Search by file name, label, or type (PDF / DOCX)…"
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

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className={styles.sectionTitle}>AI-Recommended Resources</h2>
        <div className="placeholder-block" style={{ marginTop: 12 }}>
          <p>AI recommendations will appear here once you add subjects.</p>
        </div>
      </div>

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
                              const v = e.target.value
                              setEditCourseSelect(v)
                              if (v !== '__create__') setEditNewCourseDraft('')
                            }}
                            aria-label="Choose course"
                          >
                            <option value="">No course</option>
                            {labelOptionsFor(courseLabels, r.courseLabel || undefined).map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                            <option value="__create__">+ Add new course…</option>
                          </select>
                          {editCourseSelect === '__create__' && (
                            <div className={styles.newLabelRow}>
                              <input
                                className={styles.textInput}
                                type="text"
                                placeholder="New course name"
                                value={editNewCourseDraft}
                                onChange={(e) => setEditNewCourseDraft(e.target.value)}
                                maxLength={120}
                                aria-label="New course name"
                              />
                              <button
                                type="button"
                                className={`btn btn-outline ${styles.btnSm}`}
                                disabled={!editNewCourseDraft.trim()}
                                onClick={() => {
                                  const res = addCourseLabelPreset(editNewCourseDraft)
                                  if (res.ok) {
                                    setEditCourseSelect(res.label)
                                    setEditNewCourseDraft('')
                                  } else {
                                    setBanner({ type: 'error', text: res.error || 'Invalid course.' })
                                  }
                                }}
                              >
                                Save course
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
