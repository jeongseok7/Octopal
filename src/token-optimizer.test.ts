import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  compressHistory,
  formatCompressedHistory,
  compactWikiSection,
  compactPeerSection,
  compressRouterHistory,
  COMPACT_WORLD_CONTEXT,
  COMPACT_APP_CONTEXT,
} from './token-optimizer'
import type { HistoryEntry, CompressedHistory } from './token-optimizer'

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('estimates roughly 1 token per 3 chars', () => {
    expect(estimateTokens('hello world')).toBe(4) // 11 chars / 3 ≈ 4
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abc')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// compressHistory
// ---------------------------------------------------------------------------

describe('compressHistory', () => {
  const mkHistory = (count: number, textLen = 50): HistoryEntry[] =>
    Array.from({ length: count }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `Message ${i}: ${'x'.repeat(textLen)}`,
      ts: 1000 + i,
    }))

  it('returns all messages when count ≤ maxRecentMessages', () => {
    const history = mkHistory(3)
    const result = compressHistory(history, { maxRecentMessages: 4 })
    expect(result.summary).toBeNull()
    expect(result.recent).toHaveLength(3)
  })

  it('splits into summary + recent when count > maxRecentMessages', () => {
    const history = mkHistory(10)
    const result = compressHistory(history, { maxRecentMessages: 4 })
    expect(result.summary).toBeTruthy()
    expect(result.recent).toHaveLength(4)
    // Recent should be the last 4
    expect(result.recent[0].text).toContain('Message 6')
    expect(result.recent[3].text).toContain('Message 9')
  })

  it('truncates long messages in recent', () => {
    const history = [
      { role: 'user', text: 'A'.repeat(1000) },
      { role: 'assistant', text: 'B'.repeat(1000) },
    ]
    const result = compressHistory(history, { maxRecentMessages: 4, maxPerMessage: 100 })
    expect(result.recent[0].text.length).toBeLessThanOrEqual(101) // 100 + '…'
    expect(result.recent[0].text).toContain('…')
  })

  it('truncates summary when it exceeds maxSummaryChars', () => {
    const history = mkHistory(20, 200) // lots of text
    const result = compressHistory(history, {
      maxRecentMessages: 4,
      maxSummaryChars: 100,
    })
    expect(result.summary!.length).toBeLessThanOrEqual(101) // 100 + '…'
  })

  it('collapses code blocks and tables in summary', () => {
    const history: HistoryEntry[] = [
      { role: 'user', text: 'Check this:\n```js\nconsole.log("hello")\n```\nPlease review' },
      { role: 'assistant', text: 'Done' },
      { role: 'user', text: 'ok' },
      { role: 'assistant', text: 'sure' },
      { role: 'user', text: 'recent1' },
      { role: 'assistant', text: 'recent2' },
      { role: 'user', text: 'recent3' },
      { role: 'assistant', text: 'recent4' },
    ]
    const result = compressHistory(history, { maxRecentMessages: 4 })
    expect(result.summary).toContain('[code]')
    expect(result.summary).not.toContain('console.log')
  })

  it('handles empty history', () => {
    const result = compressHistory([])
    expect(result.summary).toBeNull()
    expect(result.recent).toHaveLength(0)
  })

  it('uses default options when none provided', () => {
    const history = mkHistory(8)
    const result = compressHistory(history)
    // Default maxRecentMessages is 4
    expect(result.recent).toHaveLength(4)
    expect(result.summary).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// formatCompressedHistory
// ---------------------------------------------------------------------------

describe('formatCompressedHistory', () => {
  it('formats without summary', () => {
    const ch: CompressedHistory = {
      summary: null,
      recent: [
        { role: 'user', text: 'Hello' },
        { role: 'assistant', text: 'Hi there' },
      ],
    }
    const text = formatCompressedHistory(ch)
    expect(text).toContain('Recent conversation:')
    expect(text).toContain('User: Hello')
    expect(text).toContain('Assistant: Hi there')
    expect(text).not.toContain('Earlier context')
  })

  it('formats with summary', () => {
    const ch: CompressedHistory = {
      summary: 'User: asked about X → Agent: explained Y',
      recent: [{ role: 'user', text: 'ok do it' }],
    }
    const text = formatCompressedHistory(ch)
    expect(text).toContain('[Earlier context: User: asked about X')
    expect(text).toContain('User: ok do it')
  })
})

// ---------------------------------------------------------------------------
// Compact system prompt pieces
// ---------------------------------------------------------------------------

describe('compact system prompt', () => {
  it('COMPACT_WORLD_CONTEXT is significantly shorter than the original', () => {
    // Original is ~700 chars. Compact should be well under.
    expect(COMPACT_WORLD_CONTEXT.length).toBeLessThan(650)
    expect(COMPACT_WORLD_CONTEXT).toContain('Octopal')
    expect(COMPACT_WORLD_CONTEXT).toContain('.octo')
  })

  it('COMPACT_APP_CONTEXT is significantly shorter than the original', () => {
    expect(COMPACT_APP_CONTEXT.length).toBeLessThan(600)
    expect(COMPACT_APP_CONTEXT).toContain('wiki')
    expect(COMPACT_APP_CONTEXT).toContain('Permissions')
  })

  it('compactWikiSection produces valid output', () => {
    const section = compactWikiSection('/some/wiki', 'page1.md, page2.md')
    expect(section).toContain('/some/wiki')
    expect(section).toContain('page1.md, page2.md')
    expect(section).toContain('Read')
  })

  it('compactPeerSection lists all peers', () => {
    const section = compactPeerSection([
      { name: 'dev', role: 'developer' },
      { name: 'test', role: 'tester' },
    ])
    expect(section).toContain('@dev: developer')
    expect(section).toContain('@test: tester')
    expect(section).toContain('expertise')
  })
})

// ---------------------------------------------------------------------------
// compressRouterHistory
// ---------------------------------------------------------------------------

describe('compressRouterHistory', () => {
  const msgs = [
    { agentName: 'user', text: 'Fix the login bug' },
    { agentName: 'developer', text: 'Looking into it now, the issue is in auth.ts' },
    { agentName: 'user', text: 'Great, also check the session timeout' },
    { agentName: 'developer', text: 'Found the bug in session.ts line 42' },
    { agentName: 'user', text: 'Perfect' },
  ]

  it('returns empty string for empty history', () => {
    expect(compressRouterHistory([], true)).toBe('')
    expect(compressRouterHistory([], false)).toBe('')
  })

  it('uses minimal format when observer context is available', () => {
    const result = compressRouterHistory(msgs, true)
    expect(result).toContain('Recent messages:')
    // Should only have last 3
    const lines = result.trim().split('\n').filter((l) => l.startsWith('User:') || l.startsWith('developer:'))
    expect(lines.length).toBeLessThanOrEqual(3)
  })

  it('uses full format when no observer context', () => {
    const result = compressRouterHistory(msgs, false)
    expect(result).toContain('Recent conversation:')
    // Should include more messages with longer text
    expect(result.length).toBeGreaterThan(compressRouterHistory(msgs, true).length)
  })

  it('truncates individual messages to 100 chars with observer', () => {
    const longMsgs = [{ agentName: 'user', text: 'A'.repeat(500) }]
    const result = compressRouterHistory(longMsgs, true)
    // Each line should be short
    const lines = result.split('\n').filter((l) => l.startsWith('User:'))
    expect(lines[0].length).toBeLessThan(120)
  })
})

// ---------------------------------------------------------------------------
// Token savings comparison
// ---------------------------------------------------------------------------

describe('token savings', () => {
  it('compressed history uses fewer tokens than raw history', () => {
    // Simulate a realistic 10-message history with varying lengths
    const history: HistoryEntry[] = [
      { role: 'user', text: 'Can you implement the new routing system?' },
      { role: 'assistant', text: '## Plan\n\n' + 'Step details...\n'.repeat(20) + '\n```ts\ncode here\n```' },
      { role: 'user', text: 'Looks good, go ahead' },
      { role: 'assistant', text: '✅ Done!\n\n| File | Change |\n|---|---|\n' + '| file.ts | updated |\n'.repeat(10) },
      { role: 'user', text: 'Now add tests' },
      { role: 'assistant', text: 'Writing tests...\n```ts\n' + 'test code\n'.repeat(30) + '\n```' },
      { role: 'user', text: 'ㅇㅋ' },
      { role: 'assistant', text: 'All 25 tests passing! Here is the summary...' + ' details '.repeat(50) },
      { role: 'user', text: 'Commit it' },
      { role: 'assistant', text: 'Committed: abc1234' },
    ]

    // Raw approach: just join all messages
    const rawText = history.map((h) => `${h.role}: ${h.text}`).join('\n')
    const rawTokens = estimateTokens(rawText)

    // Compressed approach
    const compressed = compressHistory(history)
    const compressedText = formatCompressedHistory(compressed)
    const compressedTokens = estimateTokens(compressedText)

    // Should save at least 30%
    const savings = 1 - compressedTokens / rawTokens
    expect(savings).toBeGreaterThan(0.3)
  })
})
