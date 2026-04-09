/**
 * Text Shortcut Expander — expands user-defined shortcuts before message dispatch.
 *
 * Shortcuts are stored in settings.shortcuts.textExpansions.
 * Each shortcut has a `trigger` (e.g. "/fix") and an `expansion` (e.g. "@developer fix this bug").
 *
 * Expansion rules:
 * 1. Trigger must be at the START of the message (or the entire message).
 * 2. If trigger is followed by additional text, that text is appended after the expansion.
 *    e.g. trigger="/fix", expansion="@developer fix this bug"
 *         input="/fix login error" → "@developer fix this bug — login error"
 * 3. Trigger matching is case-insensitive.
 * 4. Only the FIRST matching trigger is expanded (no chaining).
 */

export interface TextShortcut {
  /** The trigger string, e.g. "/fix", "/d", "//deploy" */
  trigger: string
  /** What it expands to, e.g. "@developer fix this bug" */
  expansion: string
  /** Optional human-readable description */
  description?: string
}

export interface ShortcutMatch {
  /** The matched shortcut */
  shortcut: TextShortcut
  /** The fully expanded text */
  expandedText: string
  /** Any extra text after the trigger */
  remainder: string
}

/**
 * Expand shortcuts in the given message text.
 * Returns null if no shortcut matched.
 */
export function expandShortcut(
  text: string,
  shortcuts: TextShortcut[]
): ShortcutMatch | null {
  if (!text || shortcuts.length === 0) return null

  const trimmed = text.trim()
  if (!trimmed) return null

  // Sort by trigger length descending so longer triggers match first
  // e.g. "/deploy" matches before "/d"
  const sorted = [...shortcuts].sort(
    (a, b) => b.trigger.length - a.trigger.length
  )

  for (const shortcut of sorted) {
    const trigger = shortcut.trigger.toLowerCase()
    const lower = trimmed.toLowerCase()

    // Check if message starts with trigger
    if (!lower.startsWith(trigger)) continue

    // After trigger, must be end-of-string or whitespace
    const afterTrigger = trimmed.slice(shortcut.trigger.length)
    if (afterTrigger.length > 0 && !/^\s/.test(afterTrigger)) continue

    const remainder = afterTrigger.trim()
    let expandedText: string

    if (remainder) {
      expandedText = `${shortcut.expansion} — ${remainder}`
    } else {
      expandedText = shortcut.expansion
    }

    return { shortcut, expandedText, remainder }
  }

  return null
}

/**
 * Get all shortcuts whose trigger starts with the given prefix.
 * Used for autocomplete/hints in the input field.
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

/**
 * Validate a shortcut trigger.
 * Returns an error string or null if valid.
 */
export function validateTrigger(
  trigger: string,
  existing: TextShortcut[]
): string | null {
  if (!trigger || !trigger.trim()) return 'Trigger cannot be empty'
  const t = trigger.trim()
  if (t.length < 2) return 'Trigger must be at least 2 characters'
  if (!t.startsWith('/')) return 'Trigger must start with /'
  if (/\s/.test(t)) return 'Trigger cannot contain spaces'
  if (existing.some((s) => s.trigger.toLowerCase() === t.toLowerCase())) {
    return 'Trigger already exists'
  }
  return null
}

/**
 * Built-in shortcut suggestions based on available agents.
 * These are suggested but not auto-created — user must opt-in.
 */
export function suggestShortcuts(
  agents: Array<{ name: string; role: string }>
): TextShortcut[] {
  const suggestions: TextShortcut[] = []

  for (const agent of agents) {
    const initial = agent.name.charAt(0).toLowerCase()
    // Short mention shortcut: /d → @developer
    suggestions.push({
      trigger: `/${initial}`,
      expansion: `@${agent.name}`,
      description: `Mention @${agent.name}`,
    })
  }

  // Common task shortcuts
  const taskMap: Record<string, { trigger: string; expansion: string; desc: string }> = {
    developer: { trigger: '/fix', expansion: '@developer fix this', desc: 'Ask developer to fix a bug' },
    tester: { trigger: '/test', expansion: '@tester write tests for this', desc: 'Ask tester to write tests' },
    reviewer: { trigger: '/review', expansion: '@reviewer please review', desc: 'Request code review' },
    designer: { trigger: '/style', expansion: '@designer improve the styling', desc: 'Ask designer to style' },
    planner: { trigger: '/plan', expansion: '@planner plan this feature', desc: 'Ask planner to plan' },
    security: { trigger: '/audit', expansion: '@security audit this for vulnerabilities', desc: 'Request security audit' },
  }

  for (const agent of agents) {
    const task = taskMap[agent.name]
    if (task) {
      suggestions.push({
        trigger: task.trigger,
        expansion: task.expansion,
        description: task.desc,
      })
    }
  }

  return suggestions
}
