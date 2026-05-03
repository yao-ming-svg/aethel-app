import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { useCourses } from './CoursesContext'
import { mergeLabelPresets, mergeCourseLabels } from '../lib/defaultResourceLabels'
import { validateChatFile } from '../lib/documentExtract'
import {
  deleteResourceBlob,
  getResourceBlob,
  readLabelPresets,
  readResourcesMetaSnapshot,
  resourcesMetaKey,
  saveResourceBlob,
  writeLabelPresets,
  readCourseLabels,
  writeCourseLabels,
} from '../lib/resourceBlobStore'

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

export function ResourcesProvider({ children }) {
  const { user } = useAuth()
  const { courses } = useCourses()
  const [resources, setResources] = useState([])
  const [labelPresets, setLabelPresets] = useState([])
  const [courseLabels, setCourseLabels] = useState([])

  const loadMeta = useCallback(() => {
    if (!user?.id) {
      setResources([])
      setLabelPresets([])
      setCourseLabels([])
      return
    }
    const list = sortNewestFirst(readResourcesMetaSnapshot(user.id))
    setResources(list)
    const stored = readLabelPresets(user.id)
    const fromFiles = list.map((r) => r.label).filter(Boolean)
    const merged = mergeLabelPresets(stored, fromFiles)
    writeLabelPresets(user.id, merged)
    setLabelPresets(merged)

    // Load course labels: combine stored labels + actual course names
    const storedCourseLabels = readCourseLabels(user.id)
    const courseNames = courses.map((c) => c.name).filter(Boolean)
    const mergedCourseLabels = mergeCourseLabels(storedCourseLabels, courseNames)
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
        createdAt: new Date().toISOString(),
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
          const next = mergeLabelPresets(readLabelPresets(user.id), meta.label)
          writeLabelPresets(user.id, next)
          setLabelPresets(next)
        }
        if (meta.courseLabel) {
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

  /**
   * Add a reusable label for dropdowns (deduped, sorted).
   * @returns {{ ok: true, label: string } | { ok: false, error: string }}
   */
  const addLabelPreset = useCallback(
    (raw) => {
      if (!user?.id) return { ok: false, error: 'You must be signed in.' }
      const t = typeof raw === 'string' ? raw.trim().slice(0, 120) : ''
      if (!t) return { ok: false, error: 'Enter a label name.' }
      const next = mergeLabelPresets(readLabelPresets(user.id), t)
      writeLabelPresets(user.id, next)
      setLabelPresets(next)
      return { ok: true, label: t }
    },
    [user],
  )

  const updateResourceCourseLabel = useCallback(
    (id, courseLabel) => {
      if (!user?.id) return
      const trimmed = typeof courseLabel === 'string' ? courseLabel.trim() : ''
      const nextCourseLabel = trimmed.length > 0 ? trimmed.slice(0, 120) : null
      const list = readResourcesMetaSnapshot(user.id)
      persistSorted(list.map((r) => (r.id === id ? { ...r, courseLabel: nextCourseLabel } : r)))
      if (nextCourseLabel) {
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
      const next = mergeCourseLabels(readCourseLabels(user.id), t)
      writeCourseLabels(user.id, next)
      setCourseLabels(next)
      return { ok: true, label: t }
    },
    [user],
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
      labelPresets,
      courseLabels,
      addResource,
      addLabelPreset,
      addCourseLabelPreset,
      updateResourceLabel,
      updateResourceCourseLabel,
      removeResource,
      downloadResource,
      getResourceFile,
      reloadResources: loadMeta,
    }),
    [
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
