/** IndexedDB storage for resource file bytes (PDF / DOCX), keyed per user. */

const DB_NAME = 'aethel-app'
const DB_VERSION = 1
const STORE = 'resourceFiles'

function makeKey(userId, resourceId) {
  return `${userId}::${resourceId}`
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
  })
}

/**
 * @param {string} userId
 * @param {string} resourceId
 * @param {ArrayBuffer} data
 */
export async function saveResourceBlob(userId, resourceId, data) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
    tx.objectStore(STORE).put(data, makeKey(userId, resourceId))
  })
}

/**
 * @param {string} userId
 * @param {string} resourceId
 * @returns {Promise<ArrayBuffer | undefined>}
 */
export async function getResourceBlob(userId, resourceId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'))
    const r = tx.objectStore(STORE).get(makeKey(userId, resourceId))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

/**
 * @param {string} userId
 * @param {string} resourceId
 */
export async function deleteResourceBlob(userId, resourceId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
    tx.objectStore(STORE).delete(makeKey(userId, resourceId))
  })
}

/**
 * Delete every stored blob for resources listed in localStorage meta (call before removing meta).
 * @param {string} userId
 * @param {{ id: string }[]} metaList
 */
export async function deleteResourceBlobsForMetaList(userId, metaList) {
  for (const r of metaList) {
    if (r?.id) {
      try {
        await deleteResourceBlob(userId, r.id)
      } catch {
        /* ignore per-file */
      }
    }
  }
}

export function resourcesMetaKey(userId) {
  return `aethel_resources_meta_${userId}`
}

export function flashcardSetsKey(userId) {
  return `aethel_flashcard_sets_${userId}`
}

export function readResourcesMetaSnapshot(userId) {
  try {
    const raw = localStorage.getItem(resourcesMetaKey(userId))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function readFlashcardSetsSnapshot(userId) {
  try {
    const raw = localStorage.getItem(flashcardSetsKey(userId))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function writeFlashcardSetsSnapshot(userId, list) {
  localStorage.setItem(flashcardSetsKey(userId), JSON.stringify(Array.isArray(list) ? list : []))
}

export function resourceLabelsKey(userId) {
  return `aethel_resource_labels_${userId}`
}

export function readLabelPresets(userId) {
  try {
    const raw = localStorage.getItem(resourceLabelsKey(userId))
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
  } catch {
    return []
  }
}

export function writeLabelPresets(userId, list) {
  localStorage.setItem(resourceLabelsKey(userId), JSON.stringify(list))
}

export function resourceCourseLabelsKey(userId) {
  return `aethel_resource_course_labels_${userId}`
}

export function hiddenResourceLabelsKey(userId) {
  return `aethel_hidden_resource_labels_${userId}`
}

export function hiddenResourceCourseLabelsKey(userId) {
  return `aethel_hidden_resource_course_labels_${userId}`
}

function readStringList(key) {
  try {
    const raw = localStorage.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
  } catch {
    return []
  }
}

function writeStringList(key, list) {
  localStorage.setItem(key, JSON.stringify(Array.isArray(list) ? list : []))
}

export function readCourseLabels(userId) {
  return readStringList(resourceCourseLabelsKey(userId))
}

export function writeCourseLabels(userId, list) {
  writeStringList(resourceCourseLabelsKey(userId), list)
}

export function readHiddenResourceLabels(userId) {
  return readStringList(hiddenResourceLabelsKey(userId))
}

export function writeHiddenResourceLabels(userId, list) {
  writeStringList(hiddenResourceLabelsKey(userId), list)
}

export function readHiddenResourceCourseLabels(userId) {
  return readStringList(hiddenResourceCourseLabelsKey(userId))
}

export function writeHiddenResourceCourseLabels(userId, list) {
  writeStringList(hiddenResourceCourseLabelsKey(userId), list)
}

/** Remove all saved resource metadata and file blobs for a user (e.g. account deletion). */
export async function purgeUserResources(userId) {
  const list = readResourcesMetaSnapshot(userId)
  await deleteResourceBlobsForMetaList(userId, list)
  localStorage.removeItem(resourcesMetaKey(userId))
  localStorage.removeItem(flashcardSetsKey(userId))
  localStorage.removeItem(resourceLabelsKey(userId))
  localStorage.removeItem(resourceCourseLabelsKey(userId))
  localStorage.removeItem(hiddenResourceLabelsKey(userId))
  localStorage.removeItem(hiddenResourceCourseLabelsKey(userId))
}
