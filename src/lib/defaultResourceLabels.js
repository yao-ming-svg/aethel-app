/** Shown in label dropdowns for every user (merged with custom labels). */
export const DEFAULT_RESOURCE_LABELS = [
  'Articles',
  'Videos',
  'Websites',
  'Textbooks',
  'Practice',
  'Notes',
]

/** Default course labels (merged with user's actual courses). */
export const DEFAULT_COURSE_LABELS = []

function mergeLabels(defaults, storedFromDisk, ...extras) {
  const more = extras
    .flat()
    .filter((x) => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 120))
  const list = Array.isArray(storedFromDisk)
    ? storedFromDisk.filter((x) => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 120))
    : []
  const base = list.length > 0 ? list : defaults

  return [...new Set([...base, ...more])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}

/**
 * @param {string[]} storedFromDisk labels saved for this user (may omit defaults)
 * @param {...unknown} extras extra strings or arrays of strings (e.g. from files)
 * @returns {string[]} deduped, sorted
 */
export function mergeLabelPresets(storedFromDisk, ...extras) {
  return mergeLabels(DEFAULT_RESOURCE_LABELS, storedFromDisk, ...extras)
}

/**
 * @param {string[]} storedFromDisk course labels saved for this user
 * @param {...unknown} extras extra strings or arrays of strings (e.g. from actual courses)
 * @returns {string[]} deduped, sorted
 */
export function mergeCourseLabels(storedFromDisk, ...extras) {
  return mergeLabels(DEFAULT_COURSE_LABELS, storedFromDisk, ...extras)
}
