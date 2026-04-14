export const AGENT_COLORS = [
  '#D44058',  // Crimson     (signature — brand accent)
  '#E8A8B4',  // Rose Gold   (soft warm secondary)
  '#4AADAB',  // Ocean Teal  (cool complement)
  '#C49080',  // Amber Clay  (warm earth tone)
  '#6B8FC2',  // Slate Blue  (cool accent)
  '#D4836B',  // Coral       (warm sibling)
  '#8EA07D',  // Sage Green  (earthy cool)
]

export function colorForName(name: string | undefined | null) {
  const s = name || '?'
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length]
}

export function basename(p: string) {
  return p.split('/').filter(Boolean).pop() || p
}

/**
 * Merge disk-loaded history with in-memory pending messages.
 * Pending messages (agent working indicators) only exist in memory,
 * so they would be lost when history is reloaded from disk on folder switch.
 * This function preserves them by appending any pending messages
 * whose IDs are not already present in the loaded history.
 */
export function mergeWithPending<T extends { id: string; pending?: boolean }>(
  loaded: T[],
  existing: T[],
): T[] {
  const pendingMessages = existing.filter((m) => m.pending)
  const loadedIds = new Set(loaded.map((m) => m.id))
  const missingPending = pendingMessages.filter((m) => !loadedIds.has(m.id))
  return [...loaded, ...missingPending]
}
