/**
 * Text Shortcut Expander (renderer-side copy)
 * Lightweight expansion logic — runs in the renderer before message dispatch.
 */

export function expandShortcut(
  text: string,
  shortcuts: TextShortcut[]
): { expandedText: string; remainder: string } | null {
  if (!text || shortcuts.length === 0) return null

  const trimmed = text.trim()
  if (!trimmed) return null

  // Sort by trigger length descending so longer triggers match first
  const sorted = [...shortcuts].sort(
    (a, b) => b.trigger.length - a.trigger.length
  )

  for (const shortcut of sorted) {
    const trigger = shortcut.trigger.toLowerCase()
    const lower = trimmed.toLowerCase()

    if (!lower.startsWith(trigger)) continue

    const afterTrigger = trimmed.slice(shortcut.trigger.length)
    if (afterTrigger.length > 0 && !/^\s/.test(afterTrigger)) continue

    const remainder = afterTrigger.trim()
    const expandedText = remainder
      ? `${shortcut.expansion} — ${remainder}`
      : shortcut.expansion

    return { expandedText, remainder }
  }

  return null
}

/**
 * Get all shortcuts whose trigger starts with the given prefix.
 */
export function matchShortcutPrefix(
  prefix: string,
  shortcuts: TextShortcut[]
): TextShortcut[] {
  if (!prefix) return []
  const lower = prefix.toLowerCase()
  return shortcuts.filter((s) =>
    s.trigger.toLowerCase().startsWith(lower)
  )
}
