import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SmartObserver, LLMContext, ObserverMessage } from './smart-observer'
import { ConversationObserver } from './observer'

// Mock child_process.spawn to avoid real CLI calls in tests
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}))

// We'll control spawn behavior per-test
import { spawn } from 'child_process'
const mockSpawn = vi.mocked(spawn)

function createMockProcess(stdout: string, exitCode = 0) {
  const stdoutCallbacks: Array<(data: Buffer) => void> = []
  const stderrCallbacks: Array<(data: Buffer) => void> = []
  const closeCallbacks: Array<(code: number) => void> = []

  const proc = {
    stdout: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') stdoutCallbacks.push(cb)
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') stderrCallbacks.push(cb)
      }),
    },
    on: vi.fn((event: string, cb: any) => {
      if (event === 'close') closeCallbacks.push(cb)
    }),
    kill: vi.fn(),
  }

  // Schedule data emission + close
  setTimeout(() => {
    for (const cb of stdoutCallbacks) cb(Buffer.from(stdout))
    for (const cb of closeCallbacks) cb(exitCode)
  }, 10)

  return proc as any
}

function msg(agentName: string, text: string, ts?: number): ObserverMessage {
  return { agentName, text, ts: ts ?? Date.now() }
}

const sampleLLMOutput: LLMContext = {
  conversationSummary: 'Discussing token tracking implementation',
  currentTopic: 'token usage',
  topicHistory: ['project setup', 'token usage'],
  conversationPhase: 'implementation',
  agentContext: {
    developer: {
      workingOn: 'implementing token badges',
      lastContribution: 'added TokenUsageBadge component',
    },
  },
  userIntent: 'wants token tracking feature',
  openThreads: ['cost estimation accuracy'],
  updatedAt: 0,
}

describe('SmartObserver', () => {
  let so: SmartObserver
  let ruleObserver: ConversationObserver
  const folder = '/test/project'

  beforeEach(() => {
    vi.useFakeTimers()
    ruleObserver = new ConversationObserver()
    so = new SmartObserver(ruleObserver)
    mockSpawn.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Rule-based tracking (always works, no LLM) ─────────────

  describe('rule-based tracking', () => {
    it('delegates to ConversationObserver for every message', async () => {
      so.enabled = false // no LLM
      await so.onMessage(folder, msg('user', 'hello'))
      await so.onMessage(folder, msg('developer', 'hi there'))

      const ctx = so.getContext(folder)
      expect(ctx.rule.messageCount).toBe(2)
      expect(ctx.rule.lastRespondent).toBe('developer')
      expect(ctx.llm).toBeNull()
    })

    it('getRuleContext returns just the rule context', async () => {
      so.enabled = false
      await so.onMessage(folder, msg('user', 'write tests'))

      const rule = so.getRuleContext(folder)
      expect(rule.messageCount).toBe(1)
      expect(rule.currentTopic).toBe('testing')
    })

    it('isolates contexts per folder', async () => {
      so.enabled = false
      await so.onMessage('/folder-a', msg('user', 'hello'))
      await so.onMessage('/folder-a', msg('developer', 'hi'))
      await so.onMessage('/folder-b', msg('user', 'bye'))

      expect(so.getContext('/folder-a').rule.messageCount).toBe(2)
      expect(so.getContext('/folder-b').rule.messageCount).toBe(1)
    })
  })

  // ── LLM refresh trigger conditions ─────────────────────────

  describe('shouldRefreshLLM', () => {
    it('returns false when no pending messages', () => {
      expect(so.shouldRefreshLLM(folder)).toBe(false)
    })

    it('returns false when pending < threshold', async () => {
      so.enabled = false
      await so.onMessage(folder, msg('user', 'msg1'))
      await so.onMessage(folder, msg('developer', 'msg2'))
      expect(so.getPendingCount(folder)).toBe(2)
      expect(so.shouldRefreshLLM(folder)).toBe(false)
    })

    it('returns true when pending >= 3 (threshold)', async () => {
      so.enabled = false
      await so.onMessage(folder, msg('user', 'msg1'))
      await so.onMessage(folder, msg('developer', 'msg2'))
      await so.onMessage(folder, msg('user', 'msg3'))
      expect(so.shouldRefreshLLM(folder)).toBe(true)
    })

    it('returns true on inactivity gap (>5min) then resume', async () => {
      so.enabled = false

      // Simulate existing LLM context that's old
      const oldContext: LLMContext = {
        ...sampleLLMOutput,
        updatedAt: Date.now() - 6 * 60 * 1000, // 6 minutes ago
      }
      // Inject via internal map (testing-only hack)
      ;(so as any).llmContexts.set(folder, oldContext)

      // Add just 1 pending message
      await so.onMessage(folder, msg('user', 'hello'))
      expect(so.getPendingCount(folder)).toBe(1)
      expect(so.shouldRefreshLLM(folder)).toBe(true)
    })

    it('returns false when refresh is already in-flight', async () => {
      so.enabled = false
      await so.onMessage(folder, msg('user', 'a'))
      await so.onMessage(folder, msg('user', 'b'))
      await so.onMessage(folder, msg('user', 'c'))

      // Simulate in-flight
      ;(so as any).refreshInFlight.add(folder)
      expect(so.shouldRefreshLLM(folder)).toBe(false)
    })
  })

  // ── onMessage LLM trigger ──────────────────────────────────

  describe('onMessage LLM trigger', () => {
    it('does not trigger LLM when disabled', async () => {
      so.enabled = false
      for (let i = 0; i < 5; i++) {
        const triggered = await so.onMessage(folder, msg('user', `msg${i}`))
        expect(triggered).toBe(false)
      }
      expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('triggers LLM after 3 messages', async () => {
      mockSpawn.mockReturnValue(createMockProcess(JSON.stringify(sampleLLMOutput)))

      const r1 = await so.onMessage(folder, msg('user', 'msg1'))
      const r2 = await so.onMessage(folder, msg('developer', 'msg2'))
      expect(r1).toBe(false)
      expect(r2).toBe(false)

      const r3 = await so.onMessage(folder, msg('user', 'msg3'))
      expect(r3).toBe(true) // triggered!
    })
  })

  // ── LLM context parsing ────────────────────────────────────

  describe('parseLLMOutput', () => {
    it('parses valid JSON output', () => {
      const result = (so as any).parseLLMOutput(JSON.stringify(sampleLLMOutput))
      expect(result).not.toBeNull()
      expect(result!.conversationSummary).toBe('Discussing token tracking implementation')
      expect(result!.currentTopic).toBe('token usage')
      expect(result!.agentContext.developer.workingOn).toBe('implementing token badges')
      expect(result!.updatedAt).toBeGreaterThan(0)
    })

    it('handles JSON wrapped in markdown code block', () => {
      const wrapped = '```json\n' + JSON.stringify(sampleLLMOutput) + '\n```'
      const result = (so as any).parseLLMOutput(wrapped)
      expect(result).not.toBeNull()
      expect(result!.currentTopic).toBe('token usage')
    })

    it('returns null for non-JSON output', () => {
      const result = (so as any).parseLLMOutput('I cannot help with that.')
      expect(result).toBeNull()
    })

    it('handles missing optional fields gracefully', () => {
      const minimal = JSON.stringify({
        conversationSummary: 'minimal',
        currentTopic: 'test',
      })
      const result = (so as any).parseLLMOutput(minimal)
      expect(result).not.toBeNull()
      expect(result!.conversationSummary).toBe('minimal')
      expect(result!.topicHistory).toEqual([])
      expect(result!.openThreads).toEqual([])
      expect(result!.agentContext).toEqual({})
    })

    it('caps topicHistory at 5 items', () => {
      const output = JSON.stringify({
        ...sampleLLMOutput,
        topicHistory: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      })
      const result = (so as any).parseLLMOutput(output)
      expect(result!.topicHistory).toHaveLength(5)
    })
  })

  // ── serialize ──────────────────────────────────────────────

  describe('serialize', () => {
    it('returns rule-only text when no LLM context', async () => {
      so.enabled = false
      await so.onMessage(folder, msg('user', 'write tests'))
      await so.onMessage(folder, msg('tester', 'on it'))

      const text = so.serialize(folder)
      expect(text).toContain('testing')
      expect(text).toContain('tester')
      expect(text).not.toContain('Summary:')
    })

    it('returns rich text when LLM context exists', async () => {
      so.enabled = false
      await so.onMessage(folder, msg('user', 'write tests'))
      await so.onMessage(folder, msg('tester', 'on it'))

      // Inject LLM context
      ;(so as any).llmContexts.set(folder, sampleLLMOutput)

      const text = so.serialize(folder)
      expect(text).toContain('Summary: Discussing token tracking implementation')
      expect(text).toContain('Current topic: token usage')
      expect(text).toContain('Phase: implementation')
      expect(text).toContain('User intent: wants token tracking feature')
      expect(text).toContain('developer')
      expect(text).toContain('implementing token badges')
      expect(text).toContain('Open threads: cost estimation accuracy')
      expect(text).toContain('Total messages: 2')
    })
  })

  // ── forceRefresh ───────────────────────────────────────────

  describe('forceRefresh', () => {
    it('returns null when disabled', async () => {
      so.enabled = false
      const result = await so.forceRefresh(folder)
      expect(result).toBeNull()
    })

    it('returns existing LLM context when disabled but context exists', async () => {
      ;(so as any).llmContexts.set(folder, sampleLLMOutput)
      so.enabled = false
      const result = await so.forceRefresh(folder)
      expect(result).toBe(sampleLLMOutput)
    })

    it('triggers refresh when there are pending messages', async () => {
      vi.useRealTimers() // need real timers for spawn callback

      const freshRuleObserver = new ConversationObserver()
      const freshSo = new SmartObserver(freshRuleObserver)
      freshSo.enabled = false
      await freshSo.onMessage(folder, msg('user', 'hello'))
      freshSo.enabled = true

      mockSpawn.mockReturnValue(createMockProcess(JSON.stringify(sampleLLMOutput)))

      const result = await freshSo.forceRefresh(folder)
      expect(result).not.toBeNull()
      expect(result!.currentTopic).toBe('token usage')
      expect(freshSo.getPendingCount(folder)).toBe(0)
    })

    it('skips refresh when no pending messages', async () => {
      so.enabled = true
      const result = await so.forceRefresh(folder)
      expect(result).toBeNull()
      expect(mockSpawn).not.toHaveBeenCalled()
    })
  })

  // ── reset ──────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all state for a folder', async () => {
      so.enabled = false
      await so.onMessage(folder, msg('user', 'hello'))
      ;(so as any).llmContexts.set(folder, sampleLLMOutput)

      so.reset(folder)

      expect(so.getContext(folder).rule.messageCount).toBe(0)
      expect(so.getContext(folder).llm).toBeNull()
      expect(so.getPendingCount(folder)).toBe(0)
      expect(so.isRefreshing(folder)).toBe(false)
    })
  })

  // ── Edge cases ─────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty messages gracefully', async () => {
      so.enabled = false
      await so.onMessage(folder, msg('user', ''))
      expect(so.getContext(folder).rule.messageCount).toBe(1)
    })

    it('parseAgentContext handles invalid input', () => {
      expect((so as any).parseAgentContext(null)).toEqual({})
      expect((so as any).parseAgentContext('string')).toEqual({})
      expect((so as any).parseAgentContext(42)).toEqual({})
    })

    it('parseAgentContext handles nested invalid values', () => {
      const result = (so as any).parseAgentContext({
        agent1: { workingOn: 'stuff' },
        agent2: 'not an object',
        agent3: null,
      })
      expect(result.agent1.workingOn).toBe('stuff')
      expect(result.agent2).toBeUndefined()
      expect(result.agent3).toBeUndefined()
    })
  })
})
