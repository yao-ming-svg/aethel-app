/** Shown in label dropdowns for every user (merged with custom labels). */
export const DEFAULT_RESOURCE_LABELS = [
  'Articles',
  'Videos',
  'Websites',
  'Textbooks',
  'Practice',
  'Notes',
]

/**
 * @param {string[]} storedFromDisk labels saved for this user (may omit defaults)
 * @param {...unknown} extras extra strings or arrays of strings (e.g. from files)
 * @returns {string[]} deduped, sorted
 */
export function mergeLabelPresets(storedFromDisk, ...extras) {
  const more = extras
    .flat()
    .filter((x) => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 120))
  const list = Array.isArray(storedFromDisk) ? storedFromDisk : []
  return [...new Set([...DEFAULT_RESOURCE_LABELS, ...list, ...more])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}
