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
    mentions?: string[]
  }
): RuleResult {
  return router.evaluate({
    message,
    agents: opts?.agents ?? AGENTS,
    observerContext: contextWith(opts?.context ?? {}),
    mentionedAgents: opts?.mentions ?? [],
  })
}

// ── Tests ────────────────────────────────────────────────────

describe('RuleRouter', () => {
  // ── Rule 1: @mention ──

  describe('Rule 1: @mention direct', () => {
    it('routes to mentioned agent with confidence 1.0', () => {
      const r = evaluate('@developer fix this', { mentions: ['developer'] })
      expect(r.confidence).toBe(1.0)
      expect(r.leader).toBe('developer')
      expect(r.rule).toBe('mention')
      expect(r.collaborators).toEqual([])
    })

    it('supports multiple mentions → first = leader, rest = collaborators', () => {
      const r = evaluate('@developer @designer fix UI', { mentions: ['developer', 'designer'] })
      expect(r.confidence).toBe(1.0)
      expect(r.leader).toBe('developer')
      expect(r.collaborators).toEqual(['designer'])
    })

    it('is case-insensitive', () => {
      const r = evaluate('@Developer fix', { mentions: ['Developer'] })
      expect(r.leader).toBe('developer')
    })

    it('ignores mentions that do not match any agent', () => {
      const r = evaluate('@nobody help', { mentions: ['nobody'] })
      // Falls through since nobody doesn't match
      expect(r.rule).not.toBe('mention')
    })
  })

  // ── Rule 2: Single agent ──

  describe('Rule 2: single agent', () => {
    it('routes to the only agent with confidence 1.0', () => {
      const r = evaluate('hello', { agents: [{ name: 'assistant', role: 'General' }] })
      expect(r.confidence).toBe(1.0)
      expect(r.leader).toBe('assistant')
      expect(r.rule).toBe('single-agent')
    })
  })

  // ── Rule 3: Continuation pattern ──

  describe('Rule 3: continuation pattern', () => {
    it('routes "ㅇㅋ" to last respondent with confidence 0.9', () => {
      const r = evaluate('ㅇㅋ', { context: { lastRespondent: 'developer' } })
      expect(r.confidence).toBe(0.9)
      expect(r.leader).toBe('developer')
      expect(r.rule).toBe('continuation')
    })

    it('routes "ok" to last respondent', () => {
      const r = evaluate('ok', { context: { lastRespondent: 'designer' } })
      expect(r.confidence).toBe(0.9)
      expect(r.leader).toBe('designer')
    })

    it('routes short messages (≤3 words) to last respondent', () => {
      const r = evaluate('해줘', { context: { lastRespondent: 'tester' } })
      expect(r.confidence).toBe(0.9)
      expect(r.leader).toBe('tester')
    })

    it('routes "왜?" to last respondent', () => {
      const r = evaluate('왜?', { context: { lastRespondent: 'planner' } })
      expect(r.confidence).toBe(0.9)
      expect(r.leader).toBe('planner')
    })

    it('routes "go ahead" to last respondent', () => {
      const r = evaluate('go ahead', { context: { lastRespondent: 'developer' } })
      expect(r.confidence).toBe(0.9)
      expect(r.leader).toBe('developer')
    })

    it('does NOT fire if no last respondent', () => {
      const r = evaluate('ㅇㅋ', { context: { lastRespondent: null } })
      expect(r.rule).not.toBe('continuation')
    })

    it('does NOT fire for long messages', () => {
      const r = evaluate('이건 꽤 긴 메시지인데 어떤 에이전트가 처리해야 하는지 잘 모르겠어', {
        context: { lastRespondent: 'developer' },
      })
      expect(r.rule).not.toBe('continuation')
    })
  })

  // ── Rule 4: Keyword match ──

  describe('Rule 4: keyword → agent', () => {
    it('routes "테스트 짜줘" to tester', () => {
      const r = evaluate('테스트 짜줘')
      expect(r.confidence).toBe(0.8)
      expect(r.leader).toBe('tester')
      expect(r.rule).toBe('keyword')
    })

    it('routes "CSS 수정해줘" to designer', () => {
      const r = evaluate('CSS 수정해줘')
      expect(r.confidence).toBe(0.8)
      expect(r.leader).toBe('designer')
    })

    it('routes "보안 점검해" to security', () => {
      const r = evaluate('보안 점검해')
      expect(r.confidence).toBe(0.8)
      expect(r.leader).toBe('security')
    })

    it('routes "code review 해줘" to reviewer', () => {
      const r = evaluate('code review 해줘')
      expect(r.confidence).toBe(0.8)
      expect(r.leader).toBe('reviewer')
    })

    it('routes "로드맵 정리해" to planner', () => {
      const r = evaluate('로드맵 정리해')
      expect(r.confidence).toBe(0.8)
      expect(r.leader).toBe('planner')
    })

    it('routes "버그 고쳐줘" to developer', () => {
      const r = evaluate('버그 고쳐줘')
      expect(r.confidence).toBe(0.8)
      expect(r.leader).toBe('developer')
    })

    it('picks the best match when multiple keywords match', () => {
      // "test coverage" has 2 test keywords vs 1 for others
      const r = evaluate('test coverage 올려줘')
      expect(r.leader).toBe('tester')
    })
  })

  // ── Rule 5: File extension ──

  describe('Rule 5: file extension hint', () => {
    it('routes .css file mention to designer', () => {
      const r = evaluate('globals.css 파일 수정해줘')
      expect(r.confidence).toBe(0.8)
      expect(r.leader).toBe('designer')
    })

    it('routes .test.ts file mention to tester', () => {
      const r = evaluate('observer.test.ts 파일 업데이트해줘')
      expect(r.leader).toBe('tester')
    })
  })

  // ── Rule 6: Phase-based ──

  describe('Rule 6: phase-based heuristic', () => {
    it('routes to planner during planning phase (confidence 0.6)', () => {
      const r = evaluate('다음에 뭐 할까?', { context: { conversationPhase: 'planning' } })
      expect(r.confidence).toBe(0.6)
      expect(r.leader).toBe('planner')
      expect(r.rule).toBe('phase')
    })

    it('routes to developer during implementation phase', () => {
      const r = evaluate('다음에 뭐 할까?', { context: { conversationPhase: 'implementation' } })
      expect(r.confidence).toBe(0.6)
      expect(r.leader).toBe('developer')
    })

    it('routes to reviewer during review phase', () => {
      const r = evaluate('다음에 뭐 할까?', { context: { conversationPhase: 'review' } })
      expect(r.confidence).toBe(0.6)
      expect(r.leader).toBe('reviewer')
    })

    it('does NOT fire during idle phase', () => {
      const r = evaluate('다음에 뭐 할까?', { context: { conversationPhase: 'idle' } })
      expect(r.rule).not.toBe('phase')
    })
  })

  // ── Fallback ──

  describe('Fallback', () => {
    it('returns confidence 0.0 when no rule matches', () => {
      const r = evaluate('오늘 날씨 어때?')
      expect(r.confidence).toBe(0.0)
      expect(r.leader).toBeNull()
      expect(r.rule).toBe('fallback')
    })
  })

  // ── Priority / ordering ──

  describe('Rule priority', () => {
    it('@mention overrides keyword match', () => {
      // Message has "test" keyword but @mention points to developer
      const r = evaluate('@developer 테스트 짜줘', { mentions: ['developer'] })
      expect(r.rule).toBe('mention')
      expect(r.leader).toBe('developer')
    })

    it('continuation overrides keyword match', () => {
      // "ok" is continuation, even though it could be ambiguous
      const r = evaluate('ok', { context: { lastRespondent: 'designer' } })
      expect(r.rule).toBe('continuation')
      expect(r.leader).toBe('designer')
    })

    it('keyword match overrides phase', () => {
      const r = evaluate('보안 점검해', { context: { conversationPhase: 'implementation' } })
      // keyword match (security) should win over phase (developer)
      expect(r.leader).toBe('security')
      expect(r.rule).toBe('keyword')
    })
  })

  // ── CONFIDENCE_THRESHOLD ──

  describe('CONFIDENCE_THRESHOLD', () => {
    it('is 0.8', () => {
      expect(CONFIDENCE_THRESHOLD).toBe(0.8)
    })

    it('mention (1.0) ≥ threshold', () => {
      const r = evaluate('@developer hi', { mentions: ['developer'] })
      expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
    })

    it('continuation (0.9) ≥ threshold', () => {
      const r = evaluate('ㅇㅋ', { context: { lastRespondent: 'developer' } })
      expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
    })

    it('keyword (0.8) ≥ threshold', () => {
      const r = evaluate('테스트 추가해')
      expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
    })

    it('phase (0.6) < threshold', () => {
      const r = evaluate('뭐 할까?', { context: { conversationPhase: 'planning' } })
      expect(r.confidence).toBeLessThan(CONFIDENCE_THRESHOLD)
    })

    it('fallback (0.0) < threshold', () => {
      const r = evaluate('오늘 날씨 어때?')
      expect(r.confidence).toBeLessThan(CONFIDENCE_THRESHOLD)
    })
  })

  // ── Edge cases ──

  describe('Edge cases', () => {
    it('handles empty message gracefully', () => {
      const r = evaluate('', { context: { lastRespondent: 'developer' } })
      // Empty = 1 word (empty string) ≤ 3 → continuation
      expect(r.rule).toBe('continuation')
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
