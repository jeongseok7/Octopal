import { describe, it, expect } from 'vitest'
import { RuleRouter, CONFIDENCE_THRESHOLD, AgentInfo, RuleResult } from './rule-router'
import { ObserverContext } from './observer'

// ── Helpers ──────────────────────────────────────────────────

const AGENTS: AgentInfo[] = [
  { name: 'developer', role: 'Full-stack developer' },
  { name: 'designer', role: 'UI/UX designer' },
  { name: 'tester', role: 'QA engineer and test specialist' },
  { name: 'planner', role: 'Product planner and project manager' },
  { name: 'reviewer', role: 'Code reviewer' },
  { name: 'security', role: 'Security specialist' },
  { name: 'assistant', role: 'General assistant' },
]

function emptyContext(): ObserverContext {
  return {
    currentTopic: null,
    recentTopics: [],
    agentActivity: {},
    pendingMentions: [],
    conversationPhase: 'idle',
    messageCount: 0,
    lastRespondent: null,
    lastActivityTs: 0,
  }
}

function contextWith(overrides: Partial<ObserverContext>): ObserverContext {
  return { ...emptyContext(), ...overrides }
}

const router = new RuleRouter()

function evaluate(
  message: string,
  opts?: {
    agents?: AgentInfo[]
    context?: Partial<ObserverContext>
  }
): RuleResult {
  return router.evaluate({
    message,
    agents: opts?.agents ?? AGENTS,
    observerContext: contextWith(opts?.context ?? {}),
  })
}

// ── Tests ────────────────────────────────────────────────────

describe('RuleRouter', () => {
  // ── Rule 1: Single agent ──

  describe('Rule 1: single agent', () => {
    it('routes to the only agent with confidence 1.0', () => {
      const r = evaluate('hello', { agents: [{ name: 'assistant', role: 'General' }] })
      expect(r.confidence).toBe(1.0)
      expect(r.leader).toBe('assistant')
      expect(r.rule).toBe('single-agent')
    })
  })

  // ── Fallback → LLM Router ──

  describe('Fallback → LLM Router', () => {
    it('keyword-like messages fall through to LLM', () => {
      const r = evaluate('테스트 짜줘')
      expect(r.confidence).toBe(0.0)
      expect(r.leader).toBeNull()
      expect(r.rule).toBe('fallback')
    })

    it('CSS mentions fall through to LLM', () => {
      const r = evaluate('CSS 수정해줘')
      expect(r.rule).toBe('fallback')
    })

    it('file extension mentions fall through to LLM', () => {
      const r = evaluate('globals.css 파일 수정해줘')
      expect(r.rule).toBe('fallback')
    })

    it('continuation-like messages fall through to LLM', () => {
      const r = evaluate('ㅇㅋ', { context: { lastRespondent: 'developer' } })
      expect(r.rule).toBe('fallback')
    })

    it('returns confidence 0.0 when multiple agents exist', () => {
      const r = evaluate('오늘 날씨 어때?')
      expect(r.confidence).toBe(0.0)
      expect(r.leader).toBeNull()
      expect(r.rule).toBe('fallback')
    })
  })

  // ── CONFIDENCE_THRESHOLD ──

  describe('CONFIDENCE_THRESHOLD', () => {
    it('is 0.8', () => {
      expect(CONFIDENCE_THRESHOLD).toBe(0.8)
    })

    it('single-agent (1.0) ≥ threshold', () => {
      const r = evaluate('hi', { agents: [{ name: 'developer', role: 'Dev' }] })
      expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
    })

    it('fallback (0.0) < threshold', () => {
      const r = evaluate('오늘 날씨 어때?')
      expect(r.confidence).toBeLessThan(CONFIDENCE_THRESHOLD)
    })
  })

  // ── Edge cases ──

  describe('Edge cases', () => {
    it('handles empty message gracefully', () => {
      const r = evaluate('')
      expect(r).toBeDefined()
    })

    it('handles empty agent list', () => {
      const r = evaluate('hello', { agents: [] })
      expect(r.rule).toBe('fallback')
      expect(r.confidence).toBe(0.0)
    })

    it('does not crash with undefined observer fields', () => {
      const r = evaluate('hello', {
        context: {
          lastRespondent: null,
          conversationPhase: 'idle',
        },
      })
      expect(r).toBeDefined()
    })
  })
})
