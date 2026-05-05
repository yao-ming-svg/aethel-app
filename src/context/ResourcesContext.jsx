import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { useCourses } from './CoursesContext'
import { mergeLabelPresets, mergeCourseLabels } from '../lib/defaultResourceLabels'
import { validateChatFile } from '../lib/documentExtract'
import {
  deleteResourceBlob,
  getResourceBlob,
  readHiddenResourceCourseLabels,
  readHiddenResourceLabels,
  readLabelPresets,
  readFlashcardSetsSnapshot,
  readResourcesMetaSnapshot,
  resourcesMetaKey,
  saveResourceBlob,
  writeFlashcardSetsSnapshot,
  writeHiddenResourceCourseLabels,
  writeHiddenResourceLabels,
  writeLabelPresets,
  readCourseLabels,
  writeCourseLabels,
} from '../lib/resourceBlobStore'
import { normalizeFlashcards } from '../lib/flashcards'

const ResourcesContext = createContext(null)

function inferMime(file) {
  if (file.type) return file.type
  const n = (file.name || '').toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

function sortNewestFirst(list) {
  return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function sortUpdatedFirst(list) {
  return [...list].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
}

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function labelKey(value) {
  return String(value || '').trim().toLowerCase()
}

function labelsEqual(a, b) {
  return labelKey(a) === labelKey(b)
}

function sortedUniqueLabels(labels) {
  const seen = new Set()
  const list = []

  for (const label of labels) {
    const trimmed = typeof label === 'string' ? label.trim().slice(0, 120) : ''
    const key = labelKey(trimmed)
    if (!key || seen.has(key)) continue
    seen.add(key)
    list.push(trimmed)
  }

  return list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function renamedPresetList(presets, oldLabel, nextLabel) {
  const oldKey = labelKey(oldLabel)
  const next = presets.map((label) => (labelKey(label) === oldKey ? nextLabel : label))
  if (!next.some((label) => labelsEqual(label, nextLabel))) next.push(nextLabel)
  return sortedUniqueLabels(next)
}

function filterHiddenLabels(labels, hiddenLabels) {
  return labels.filter((label) => !hiddenLabels.some((hidden) => labelsEqual(hidden, label)))
}

function addHiddenLabel(hiddenLabels, label) {
  return sortedUniqueLabels([...hiddenLabels, label])
}

function removeHiddenLabel(hiddenLabels, label) {
  return hiddenLabels.filter((hidden) => !labelsEqual(hidden, label))
}

export function ResourcesProvider({ children }) {
  const { user } = useAuth()
  const { courses } = useCourses()
  const [resources, setResources] = useState([])
  const [flashcardSets, setFlashcardSets] = useState([])
  const [labelPresets, setLabelPresets] = useState([])
  const [courseLabels, setCourseLabels] = useState([])

  const loadMeta = useCallback(() => {
    if (!user?.id) {
      setResources([])
      setFlashcardSets([])
      setLabelPresets([])
      setCourseLabels([])
      return
    }
    const list = sortNewestFirst(readResourcesMetaSnapshot(user.id))
    const sets = sortUpdatedFirst(readFlashcardSetsSnapshot(user.id))
    setResources(list)
    setFlashcardSets(sets)
    const stored = readLabelPresets(user.id)
    const fromFiles = list.map((r) => r.label).filter(Boolean)
    const hiddenLabels = readHiddenResourceLabels(user.id)
    const merged = filterHiddenLabels(mergeLabelPresets(stored, fromFiles), hiddenLabels)
    writeLabelPresets(user.id, merged)
    setLabelPresets(merged)

    // Load course labels: combine stored labels + actual course names
    const storedCourseLabels = readCourseLabels(user.id)
    const courseNames = courses.map((c) => c.name).filter(Boolean)
    const fromFlashcards = sets.map((set) => set.courseLabel).filter(Boolean)
    const hiddenCourseLabels = readHiddenResourceCourseLabels(user.id)
    const mergedCourseLabels = filterHiddenLabels(
      mergeCourseLabels(storedCourseLabels, courseNames, fromFlashcards),
      hiddenCourseLabels,
    )
    writeCourseLabels(user.id, mergedCourseLabels)
    setCourseLabels(mergedCourseLabels)
  }, [user, courses])

  useEffect(() => {
    const id = requestAnimationFrame(() => loadMeta())
    return () => cancelAnimationFrame(id)
  }, [loadMeta])

  const persistSorted = useCallback(
    (list) => {
      if (!user?.id) return
      const sorted = sortNewestFirst(list)
      localStorage.setItem(resourcesMetaKey(user.id), JSON.stringify(sorted))
      setResources(sorted)
    },
    [user],
  )

  const persistFlashcardSets = useCallback(
    (list) => {
      if (!user?.id) return
      const sorted = sortUpdatedFirst(list)
      writeFlashcardSetsSnapshot(user.id, sorted)
      setFlashcardSets(sorted)
    },
    [user],
  )

  /**
   * @param {{ file: File, label?: string | null, courseLabel?: string | null, id?: string }} opts
   * @returns {Promise<{ ok: true, id: string } | { ok: false, error: string }>}
   */
  const addResource = useCallback(
    async ({ file, label = null, courseLabel = null, id: providedId = null }) => {
      if (!user?.id) return { ok: false, error: 'You must be signed in to save resources.' }

      const check = validateChatFile(file)
      if (!check.ok) return { ok: false, error: check.error }

      const id = providedId || crypto.randomUUID()
      const trimmed = typeof label === 'string' ? label.trim() : ''
      const courseTrimmed = typeof courseLabel === 'string' ? courseLabel.trim() : ''
      const meta = {
        id,
        name: file.name || 'document',
        label: trimmed.length > 0 ? trimmed.slice(0, 120) : null,
        courseLabel: courseTrimmed.length > 0 ? courseTrimmed.slice(0, 120) : null,
        mime: inferMime(file),
        createdAt: localDateString(),
      }

      try {
        const buf = await file.arrayBuffer()
        await saveResourceBlob(user.id, id, buf)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save file.'
        return { ok: false, error: msg }
      }

      try {
        const prev = readResourcesMetaSnapshot(user.id)
        persistSorted([meta, ...prev])
        if (meta.label) {
          writeHiddenResourceLabels(user.id, removeHiddenLabel(readHiddenResourceLabels(user.id), meta.label))
          const next = mergeLabelPresets(readLabelPresets(user.id), meta.label)
          writeLabelPresets(user.id, next)
          setLabelPresets(next)
        }
        if (meta.courseLabel) {
          writeHiddenResourceCourseLabels(
            user.id,
            removeHiddenLabel(readHiddenResourceCourseLabels(user.id), meta.courseLabel),
          )
          const next = mergeCourseLabels(readCourseLabels(user.id), meta.courseLabel)
          writeCourseLabels(user.id, next)
          setCourseLabels(next)
        }
      } catch {
        await deleteResourceBlob(user.id, id)
        return { ok: false, error: 'Could not update resource list.' }
      }

      return { ok: true, id }
    },
    [persistSorted, user],
  )

  const updateResourceLabel = useCallback(
    (id, label) => {
      if (!user?.id) return
      const trimmed = typeof label === 'string' ? label.trim() : ''
      const nextLabel = trimmed.length > 0 ? trimmed.slice(0, 120) : null
      const list = readResourcesMetaSnapshot(user.id)
      persistSorted(list.map((r) => (r.id === id ? { ...r, label: nextLabel } : r)))
      if (nextLabel) {
        const next = mergeLabelPresets(readLabelPresets(user.id), nextLabel)
        writeLabelPresets(user.id, next)
        setLabelPresets(next)
      }
    },
    [persistSorted, user],
  )

  const addFlashcardSet = useCallback(
    ({ name, courseLabel = null, cards = [], sourceResourceId = null, sourceResourceName = null, id = null }) => {
      if (!user?.id) return { ok: false, error: 'You must be signed in to save flashcards.' }

      const normalizedCards = normalizeFlashcards(cards)
      if (normalizedCards.length === 0) {
        return { ok: false, error: 'Add at least one complete flashcard.' }
      }

      const trimmedName = typeof name === 'string' ? name.trim().slice(0, 140) : ''
      if (!trimmedName) return { ok: false, error: 'Enter a flashcard set name.' }

      const courseTrimmed = typeof courseLabel === 'string' ? courseLabel.trim().slice(0, 120) : ''
      const now = new Date().toISOString()
      const set = {
        id: id || crypto.randomUUID(),
        name: trimmedName,
        courseLabel: courseTrimmed || null,
        cards: normalizedCards,
        sourceResourceId: sourceResourceId || null,
        sourceResourceName: sourceResourceName || null,
        createdAt: localDateString(),
        updatedAt: now,
      }

      const prev = readFlashcardSetsSnapshot(user.id)
      persistFlashcardSets([set, ...prev])

      if (set.courseLabel) {
        writeHiddenResourceCourseLabels(
          user.id,
          removeHiddenLabel(readHiddenResourceCourseLabels(user.id), set.courseLabel),
        )
        const next = mergeCourseLabels(readCourseLabels(user.id), set.courseLabel)
        writeCourseLabels(user.id, next)
        setCourseLabels(next)
      }

      return { ok: true, id: set.id }
    },
    [persistFlashcardSets, user],
  )

  const updateFlashcardSet = useCallback(
    (id, updates) => {
      if (!user?.id) return { ok: false, error: 'You must be signed in.' }

      const prev = readFlashcardSetsSnapshot(user.id)
      const existing = prev.find((set) => set.id === id)
      if (!existing) return { ok: false, error: 'Flashcard set not found.' }

      const normalizedCards =
        updates.cards === undefined ? normalizeFlashcards(existing.cards) : normalizeFlashcards(updates.cards)
      if (normalizedCards.length === 0) {
        return { ok: false, error: 'Add at least one complete flashcard.' }
      }

      const nextName =
        updates.name === undefined ? existing.name : String(updates.name ?? '').trim().slice(0, 140)
      if (!nextName) return { ok: false, error: 'Enter a flashcard set name.' }

      const nextCourse =
        updates.courseLabel === undefined
          ? existing.courseLabel
          : String(updates.courseLabel ?? '').trim().slice(0, 120) || null

      const nextSet = {
        ...existing,
        ...updates,
        name: nextName,
        courseLabel: nextCourse,
        cards: normalizedCards,
        updatedAt: new Date().toISOString(),
      }

      persistFlashcardSets(prev.map((set) => (set.id === id ? nextSet : set)))

      if (nextSet.courseLabel) {
        writeHiddenResourceCourseLabels(
          user.id,
          removeHiddenLabel(readHiddenResourceCourseLabels(user.id), nextSet.courseLabel),
        )
        const next = mergeCourseLabels(readCourseLabels(user.id), nextSet.courseLabel)
        writeCourseLabels(user.id, next)
        setCourseLabels(next)
      }

      return { ok: true, id }
    },
    [persistFlashcardSets, user],
  )

  const removeFlashcardSet = useCallback(
    (id) => {
      if (!user?.id) return
      const prev = readFlashcardSetsSnapshot(user.id)
      persistFlashcardSets(prev.filter((set) => set.id !== id))
    },
    [persistFlashcardSets, user],
  )

  /**
   * Add a reusable label for dropdowns (deduped, sorted).
   * @returns {{ ok: true, label: string } | { ok: false, error: string }}
   */
  const addLabelPreset = useCallback(
    (raw) => {
      if (!user?.id) return { ok: false, error: 'You must be signed in.' }
      const t = typeof raw === 'string' ? raw.trim().slice(0, 120) : ''
      if (!t) return { ok: false, error: 'Enter a label name.' }
      writeHiddenResourceLabels(user.id, removeHiddenLabel(readHiddenResourceLabels(user.id), t))
      const next = mergeLabelPresets(readLabelPresets(user.id), t)
      writeLabelPresets(user.id, next)
      setLabelPresets(next)
      return { ok: true, label: t }
    },
    [user],
  )

  const renameLabelPreset = useCallback(
    (oldRaw, nextRaw) => {
      if (!user?.id) return { ok: false, error: 'You must be signed in.' }

      const oldLabel = typeof oldRaw === 'string' ? oldRaw.trim() : ''
      const nextLabel = typeof nextRaw === 'string' ? nextRaw.trim().slice(0, 120) : ''
      if (!oldLabel) return { ok: false, error: 'Choose a label to edit.' }
      if (!nextLabel) return { ok: false, error: 'Enter a label name.' }

      if (!labelsEqual(oldLabel, nextLabel)) {
        writeHiddenResourceLabels(user.id, addHiddenLabel(readHiddenResourceLabels(user.id), oldLabel))
      }
      writeHiddenResourceLabels(user.id, removeHiddenLabel(readHiddenResourceLabels(user.id), nextLabel))

      const nextPresets = renamedPresetList(labelPresets, oldLabel, nextLabel)
      writeLabelPresets(user.id, nextPresets)
      setLabelPresets(nextPresets)

      const list = readResourcesMetaSnapshot(user.id)
      persistSorted(
        list.map((r) => (labelsEqual(r.label, oldLabel) ? { ...r, label: nextLabel } : r)),
      )

      return { ok: true, label: nextLabel }
    },
    [labelPresets, persistSorted, user],
  )

  const removeLabelPreset = useCallback(
    (raw) => {
      if (!user?.id) return { ok: false, error: 'You must be signed in.' }

      const label = typeof raw === 'string' ? raw.trim() : ''
      if (!label) return { ok: false, error: 'Choose a label to remove.' }

      const list = readResourcesMetaSnapshot(user.id)
      if (list.some((r) => labelsEqual(r.label, label))) {
        return { ok: false, error: 'Only unused labels can be removed.' }
      }

      writeHiddenResourceLabels(user.id, addHiddenLabel(readHiddenResourceLabels(user.id), label))
      const next = sortedUniqueLabels(labelPresets.filter((preset) => !labelsEqual(preset, label)))
      writeLabelPresets(user.id, next)
      setLabelPresets(next)

      return { ok: true, label }
    },
    [labelPresets, user],
  )

  const updateResourceCourseLabel = useCallback(
    (id, courseLabel) => {
      if (!user?.id) return
      const trimmed = typeof courseLabel === 'string' ? courseLabel.trim() : ''
      const nextCourseLabel = trimmed.length > 0 ? trimmed.slice(0, 120) : null
      const list = readResourcesMetaSnapshot(user.id)
      persistSorted(list.map((r) => (r.id === id ? { ...r, courseLabel: nextCourseLabel } : r)))
      if (nextCourseLabel) {
        writeHiddenResourceCourseLabels(
          user.id,
          removeHiddenLabel(readHiddenResourceCourseLabels(user.id), nextCourseLabel),
        )
        const next = mergeCourseLabels(readCourseLabels(user.id), nextCourseLabel)
        writeCourseLabels(user.id, next)
        setCourseLabels(next)
      }
    },
    [persistSorted, user],
  )

  /**
   * Add a reusable course label for dropdowns (deduped, sorted).
   * @returns {{ ok: true, label: string } | { ok: false, error: string }}
   */
  const addCourseLabelPreset = useCallback(
    (raw) => {
      if (!user?.id) return { ok: false, error: 'You must be signed in.' }
      const t = typeof raw === 'string' ? raw.trim().slice(0, 120) : ''
      if (!t) return { ok: false, error: 'Enter a course name.' }
      writeHiddenResourceCourseLabels(user.id, removeHiddenLabel(readHiddenResourceCourseLabels(user.id), t))
      const next = mergeCourseLabels(readCourseLabels(user.id), t)
      writeCourseLabels(user.id, next)
      setCourseLabels(next)
      return { ok: true, label: t }
    },
    [user],
  )

  const renameCourseLabelPreset = useCallback(
    (oldRaw, nextRaw) => {
      if (!user?.id) return { ok: false, error: 'You must be signed in.' }

      const oldLabel = typeof oldRaw === 'string' ? oldRaw.trim() : ''
      const nextLabel = typeof nextRaw === 'string' ? nextRaw.trim().slice(0, 120) : ''
      if (!oldLabel) return { ok: false, error: 'Choose a course to edit.' }
      if (!nextLabel) return { ok: false, error: 'Enter a course name.' }

      if (!labelsEqual(oldLabel, nextLabel)) {
        writeHiddenResourceCourseLabels(
          user.id,
          addHiddenLabel(readHiddenResourceCourseLabels(user.id), oldLabel),
        )
      }
      writeHiddenResourceCourseLabels(
        user.id,
        removeHiddenLabel(readHiddenResourceCourseLabels(user.id), nextLabel),
      )

      const nextCourseLabels = renamedPresetList(courseLabels, oldLabel, nextLabel)
      writeCourseLabels(user.id, nextCourseLabels)
      setCourseLabels(nextCourseLabels)

      const list = readResourcesMetaSnapshot(user.id)
      persistSorted(
        list.map((r) => (labelsEqual(r.courseLabel, oldLabel) ? { ...r, courseLabel: nextLabel } : r)),
      )

      const sets = readFlashcardSetsSnapshot(user.id)
      persistFlashcardSets(
        sets.map((set) => (labelsEqual(set.courseLabel, oldLabel) ? { ...set, courseLabel: nextLabel } : set)),
      )

      return { ok: true, label: nextLabel }
    },
    [courseLabels, persistFlashcardSets, persistSorted, user],
  )

  const removeResource = useCallback(
    async (id) => {
      if (!user?.id) return
      try {
        await deleteResourceBlob(user.id, id)
      } catch {
        /* still remove meta */
      }
      const list = readResourcesMetaSnapshot(user.id)
      persistSorted(list.filter((r) => r.id !== id))
    },
    [persistSorted, user],
  )

  const downloadResource = useCallback(
    async (id) => {
      if (!user?.id) return { ok: false, error: 'Not signed in.' }
      const list = readResourcesMetaSnapshot(user.id)
      const meta = list.find((r) => r.id === id)
      if (!meta) return { ok: false, error: 'Resource not found.' }

      const buf = await getResourceBlob(user.id, id)
      if (!buf) return { ok: false, error: 'File data missing.' }

      const blob = new Blob([buf], { type: meta.mime || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = meta.name || 'download'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      return { ok: true }
    },
    [user],
  )

  const getResourceFile = useCallback(
    async (id) => {
      if (!user?.id) return { ok: false, error: 'Not signed in.' }
      const list = readResourcesMetaSnapshot(user.id)
      const meta = list.find((r) => r.id === id)
      if (!meta) return { ok: false, error: 'Resource not found.' }

      const buf = await getResourceBlob(user.id, id)
      if (!buf) return { ok: false, error: 'File data missing.' }

      return {
        ok: true,
        file: new File([buf], meta.name || 'document', {
          type: meta.mime || 'application/octet-stream',
          lastModified: meta.createdAt ? new Date(meta.createdAt).getTime() : Date.now(),
        }),
      }
    },
    [user],
  )

  const value = useMemo(
    () => ({
      resources,
      flashcardSets,
      labelPresets,
      courseLabels,
      addResource,
      addFlashcardSet,
      addLabelPreset,
      addCourseLabelPreset,
      renameLabelPreset,
      renameCourseLabelPreset,
      removeLabelPreset,
      updateFlashcardSet,
      updateResourceLabel,
      updateResourceCourseLabel,
      removeFlashcardSet,
      removeResource,
      downloadResource,
      getResourceFile,
      reloadResources: loadMeta,
    }),
    [
      resources,
      flashcardSets,
      labelPresets,
      courseLabels,
      addResource,
      addFlashcardSet,
      addLabelPreset,
      addCourseLabelPreset,
      renameLabelPreset,
      renameCourseLabelPreset,
      removeLabelPreset,
      updateFlashcardSet,
      updateResourceLabel,
      updateResourceCourseLabel,
      removeFlashcardSet,
      removeResource,
      downloadResource,
      getResourceFile,
      loadMeta,
    ],
  )

  return <ResourcesContext.Provider value={value}>{children}</ResourcesContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook paired with provider
export function useResources() {
  const ctx = useContext(ResourcesContext)
  if (!ctx) throw new Error('useResources must be used within ResourcesProvider')
  return ctx
}
