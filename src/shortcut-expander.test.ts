import { describe, it, expect } from 'vitest'
import {
  expandShortcut,
  matchShortcutPrefix,
  validateTrigger,
  suggestShortcuts,
  TextShortcut,
} from './shortcut-expander'

const SHORTCUTS: TextShortcut[] = [
  { trigger: '/d', expansion: '@developer' },
  { trigger: '/t', expansion: '@tester' },
  { trigger: '/fix', expansion: '@developer fix this bug' },
  { trigger: '/review', expansion: '@reviewer please review' },
  { trigger: '/deploy', expansion: '@developer deploy to staging' },
]

describe('expandShortcut', () => {
  it('returns null for empty input', () => {
    expect(expandShortcut('', SHORTCUTS)).toBeNull()
    expect(expandShortcut('  ', SHORTCUTS)).toBeNull()
  })

  it('returns null for empty shortcuts list', () => {
    expect(expandShortcut('/fix', [])).toBeNull()
  })

  it('returns null when no trigger matches', () => {
    expect(expandShortcut('hello world', SHORTCUTS)).toBeNull()
    expect(expandShortcut('/unknown command', SHORTCUTS)).toBeNull()
  })

  it('expands exact trigger match', () => {
    const result = expandShortcut('/d', SHORTCUTS)
    expect(result).not.toBeNull()
    expect(result!.expandedText).toBe('@developer')
    expect(result!.remainder).toBe('')
  })

  it('expands trigger with remainder text', () => {
    const result = expandShortcut('/fix login error', SHORTCUTS)
    expect(result).not.toBeNull()
    expect(result!.expandedText).toBe('@developer fix this bug — login error')
    expect(result!.remainder).toBe('login error')
  })

  it('is case-insensitive for trigger matching', () => {
    const result = expandShortcut('/FIX something', SHORTCUTS)
    expect(result).not.toBeNull()
    expect(result!.expandedText).toBe('@developer fix this bug — something')
  })

  it('longer trigger takes priority over shorter', () => {
    // "/deploy" should match before "/d"
    const result = expandShortcut('/deploy now', SHORTCUTS)
    expect(result).not.toBeNull()
    expect(result!.shortcut.trigger).toBe('/deploy')
    expect(result!.expandedText).toBe('@developer deploy to staging — now')
  })

  it('does not match partial trigger (no word boundary)', () => {
    // "/doit" should NOT match "/d"
    const result = expandShortcut('/doit', SHORTCUTS)
    expect(result).toBeNull()
  })

  it('trims whitespace from input', () => {
    const result = expandShortcut('  /d  ', SHORTCUTS)
    expect(result).not.toBeNull()
    expect(result!.expandedText).toBe('@developer')
  })

  it('handles trigger followed by multiple spaces', () => {
    const result = expandShortcut('/fix   lots of spaces', SHORTCUTS)
    expect(result).not.toBeNull()
    expect(result!.expandedText).toBe('@developer fix this bug — lots of spaces')
  })

  it('handles trigger with Korean remainder', () => {
    const result = expandShortcut('/fix 로그인 에러', SHORTCUTS)
    expect(result).not.toBeNull()
    expect(result!.expandedText).toBe('@developer fix this bug — 로그인 에러')
  })
})

describe('matchShortcutPrefix', () => {
  it('returns empty for empty prefix', () => {
    expect(matchShortcutPrefix('', SHORTCUTS)).toEqual([])
  })

  it('matches single character prefix', () => {
    const results = matchShortcutPrefix('/', SHORTCUTS)
    expect(results).toHaveLength(5) // all shortcuts start with /
  })

  it('filters by prefix', () => {
    const results = matchShortcutPrefix('/d', SHORTCUTS)
    expect(results).toHaveLength(2) // /d and /deploy
  })

  it('is case-insensitive', () => {
    const results = matchShortcutPrefix('/D', SHORTCUTS)
    expect(results).toHaveLength(2)
  })

  it('returns empty when no match', () => {
    expect(matchShortcutPrefix('/z', SHORTCUTS)).toEqual([])
  })
})

describe('validateTrigger', () => {
  it('rejects empty trigger', () => {
    expect(validateTrigger('', [])).toBe('Trigger cannot be empty')
    expect(validateTrigger('  ', [])).toBe('Trigger cannot be empty')
  })

  it('rejects trigger shorter than 2 chars', () => {
    expect(validateTrigger('/', [])).toBe('Trigger must be at least 2 characters')
  })

  it('rejects trigger without / prefix', () => {
    expect(validateTrigger('fix', [])).toBe('Trigger must start with /')
  })

  it('rejects trigger with spaces', () => {
    expect(validateTrigger('/fix bug', [])).toBe('Trigger cannot contain spaces')
  })

  it('rejects duplicate trigger', () => {
    expect(validateTrigger('/fix', SHORTCUTS)).toBe('Trigger already exists')
  })

  it('rejects case-insensitive duplicate', () => {
    expect(validateTrigger('/FIX', SHORTCUTS)).toBe('Trigger already exists')
  })

  it('accepts valid trigger', () => {
    expect(validateTrigger('/new', SHORTCUTS)).toBeNull()
    expect(validateTrigger('/커밋', [])).toBeNull()
  })
})

describe('suggestShortcuts', () => {
  const agents = [
    { name: 'developer', role: 'Full-stack developer' },
    { name: 'tester', role: 'QA engineer' },
    { name: 'reviewer', role: 'Code reviewer' },
  ]

  it('generates mention shortcuts for each agent', () => {
    const suggestions = suggestShortcuts(agents)
    const mentionShortcuts = suggestions.filter((s) =>
      s.expansion.startsWith('@') && !s.expansion.includes(' ')
    )
    expect(mentionShortcuts).toHaveLength(3)
    expect(mentionShortcuts.map((s) => s.expansion)).toContain('@developer')
    expect(mentionShortcuts.map((s) => s.expansion)).toContain('@tester')
  })

  it('generates task shortcuts for known agents', () => {
    const suggestions = suggestShortcuts(agents)
    const fixShortcut = suggestions.find((s) => s.trigger === '/fix')
    expect(fixShortcut).toBeDefined()
    expect(fixShortcut!.expansion).toContain('@developer')
  })

  it('returns empty for empty agents', () => {
    expect(suggestShortcuts([])).toEqual([])
  })

  it('handles agents with same initial', () => {
    const agents = [
      { name: 'developer', role: 'dev' },
      { name: 'designer', role: 'design' },
    ]
    const suggestions = suggestShortcuts(agents)
    // Both get /d as trigger — potential conflict!
    const dTriggers = suggestions.filter((s) => s.trigger === '/d')
    expect(dTriggers.length).toBe(2)
  })

  it('generates task shortcuts only for known roles', () => {
    const agents = [{ name: 'custombot', role: 'custom' }]
    const suggestions = suggestShortcuts(agents)
    // Only mention shortcut, no task shortcut
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].trigger).toBe('/c')
  })
})

// ============================================================
// Additional edge-case tests — added by @tester
// ============================================================

describe('expandShortcut — edge cases', () => {
  const SHORTCUTS: TextShortcut[] = [
    { trigger: '/d', expansion: '@developer' },
    { trigger: '/fix', expansion: '@developer fix this bug' },
    { trigger: '/deploy', expansion: '@developer deploy to staging' },
  ]

  it('does not expand trigger in the middle of the message', () => {
    expect(expandShortcut('hello /fix this', SHORTCUTS)).toBeNull()
  })

  it('handles trigger-only input with trailing newline', () => {
    const result = expandShortcut('/d\n', SHORTCUTS)
    // \n after trigger — not whitespace-word-boundary? Let's check behavior
    expect(result).not.toBeNull()
    expect(result!.expandedText).toBe('@developer')
  })

  it('handles tab character after trigger', () => {
    const result = expandShortcut('/d\tsome text', SHORTCUTS)
    expect(result).not.toBeNull()
    expect(result!.remainder).toBe('some text')
  })

  it('handles extremely long remainder', () => {
    const longText = 'a'.repeat(10000)
    const result = expandShortcut(`/fix ${longText}`, SHORTCUTS)
    expect(result).not.toBeNull()
    expect(result!.expandedText.length).toBeGreaterThan(10000)
  })

  it('handles remainder with special characters', () => {
    const result = expandShortcut('/fix <script>alert("xss")</script>', SHORTCUTS)
    expect(result).not.toBeNull()
    // Expansion should preserve the raw text — sanitization is UI layer's job
    expect(result!.remainder).toBe('<script>alert("xss")</script>')
  })

  it('handles remainder with emoji', () => {
    const result = expandShortcut('/fix 버그 🐛 수정해줘', SHORTCUTS)
    expect(result).not.toBeNull()
    expect(result!.remainder).toBe('버그 🐛 수정해줘')
  })

  it('handles expansion containing em dash already', () => {
    const shortcuts: TextShortcut[] = [
      { trigger: '/note', expansion: 'Note — important' },
    ]
    const result = expandShortcut('/note extra', shortcuts)
    expect(result).not.toBeNull()
    // Double em dash situation
    expect(result!.expandedText).toBe('Note — important — extra')
  })

  it('does not match trigger that is a prefix of another word', () => {
    // "/d" should not match "/d.something" (no space after)
    expect(expandShortcut('/d.test', SHORTCUTS)).toBeNull()
  })

  it('handles null-ish shortcuts gracefully', () => {
    expect(expandShortcut('/fix', [])).toBeNull()
    expect(expandShortcut('', SHORTCUTS)).toBeNull()
  })

  it('preserves original trigger casing in result', () => {
    const result = expandShortcut('/FIX error', SHORTCUTS)
    expect(result).not.toBeNull()
    // shortcut object should be the original
    expect(result!.shortcut.trigger).toBe('/fix')
  })

  it('sorts correctly with many shortcuts', () => {
    const many: TextShortcut[] = [
      { trigger: '/a', expansion: 'A' },
      { trigger: '/ab', expansion: 'AB' },
      { trigger: '/abc', expansion: 'ABC' },
      { trigger: '/abcd', expansion: 'ABCD' },
    ]
    const result = expandShortcut('/abcd test', many)
    expect(result).not.toBeNull()
    expect(result!.shortcut.trigger).toBe('/abcd')
    expect(result!.expandedText).toBe('ABCD — test')
  })

  it('does not match when trigger appears after whitespace only', () => {
    // After trim, trigger should be at start
    const result = expandShortcut('   /d', SHORTCUTS)
    expect(result).not.toBeNull() // trimmed → "/d" at start
    expect(result!.expandedText).toBe('@developer')
  })
})

describe('validateTrigger — edge cases', () => {
  const existing: TextShortcut[] = [
    { trigger: '/fix', expansion: '@developer fix' },
  ]

  it('rejects trigger with only slashes', () => {
    // "///" — starts with /, length >= 2, no spaces → valid by current rules
    expect(validateTrigger('///', [])).toBeNull()
  })

  it('accepts trigger with numbers', () => {
    expect(validateTrigger('/123', [])).toBeNull()
  })

  it('accepts trigger with unicode', () => {
    expect(validateTrigger('/수정', [])).toBeNull()
    expect(validateTrigger('/バグ', [])).toBeNull()
  })

  it('rejects trigger with tab character', () => {
    expect(validateTrigger('/fix\tbug', [])).toBe('Trigger cannot contain spaces')
  })

  it('rejects trigger with newline', () => {
    expect(validateTrigger('/fix\nbug', [])).toBe('Trigger cannot contain spaces')
  })

  it('handles trigger that is just /', () => {
    expect(validateTrigger('/', [])).toBe('Trigger must be at least 2 characters')
  })

  it('trims whitespace before validating', () => {
    expect(validateTrigger('  /fix  ', existing)).toBe('Trigger already exists')
  })
})

describe('matchShortcutPrefix — edge cases', () => {
  const shortcuts: TextShortcut[] = [
    { trigger: '/fix', expansion: 'fix' },
    { trigger: '/FIX-ALL', expansion: 'fix all' },
    { trigger: '/deploy', expansion: 'deploy' },
  ]

  it('matches case-insensitively across mixed cases', () => {
    const results = matchShortcutPrefix('/fix', shortcuts)
    expect(results).toHaveLength(2) // /fix and /FIX-ALL
  })

  it('does not match non-/ prefix against / triggers', () => {
    const results = matchShortcutPrefix('fix', shortcuts)
    expect(results).toHaveLength(0)
  })

  it('handles special regex characters in prefix', () => {
    // Should not crash even if prefix has regex-special chars
    const results = matchShortcutPrefix('/fix(', shortcuts)
    expect(results).toHaveLength(0)
  })
})

describe('suggestShortcuts — collision detection', () => {
  it('generates duplicate triggers for agents sharing first letter', () => {
    const agents = [
      { name: 'developer', role: 'dev' },
      { name: 'designer', role: 'design' },
      { name: 'devops', role: 'ops' },
    ]
    const suggestions = suggestShortcuts(agents)
    const triggers = suggestions.map((s) => s.trigger)
    // All three get /d — user needs to be aware of this
    const dCount = triggers.filter((t) => t === '/d').length
    expect(dCount).toBe(3)
  })

  it('task shortcuts do not collide with mention shortcuts', () => {
    const agents = [{ name: 'developer', role: 'dev' }]
    const suggestions = suggestShortcuts(agents)
    const triggers = suggestions.map((s) => s.trigger)
    // /d (mention) and /fix (task) — different triggers
    expect(triggers).toContain('/d')
    expect(triggers).toContain('/fix')
    expect(new Set(triggers).size).toBe(triggers.length) // no dupes
  })
})
