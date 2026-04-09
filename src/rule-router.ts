/**
 * RuleRouter — Layer 0 of the 3-Layer Hybrid Routing Architecture
 *
 * Evaluates deterministic rules to route messages WITHOUT LLM calls.
 * When confidence ≥ CONFIDENCE_THRESHOLD (0.8), the message is routed
 * immediately (cost: $0, latency: ~5ms). Otherwise, falls through to
 * Layer 2 (Sonnet Router).
 *
 * Rule priority (highest → lowest):
 *   1. @mention direct       → 1.0
 *   2. Single visible agent  → 1.0
 *   3. Continuation pattern  → 0.9
 *   4. Keyword→agent match   → 0.8
 *   5. Phase-based heuristic → 0.6
 *   6. Fallback              → 0.0
 */

import { ObserverContext } from './observer'

// ── Types ────────────────────────────────────────────────────

export interface AgentInfo {
  name: string
  role: string
}

export interface RuleResult {
  /** 0.0 – 1.0; ≥ CONFIDENCE_THRESHOLD means "route without LLM" */
  confidence: number
  leader: string | null
  collaborators: string[]
  /** Human-readable reason for logging / debugging */
  reason: string
  /** Which rule fired */
  rule: 'mention' | 'single-agent' | 'continuation' | 'keyword' | 'phase' | 'fallback'
}

// ── Constants ────────────────────────────────────────────────

export const CONFIDENCE_THRESHOLD = 0.8

/**
 * Short continuation patterns — messages where the user is clearly
 * continuing a conversation with the last respondent.
 *
 * Two checks:
 *   1. Message is very short (≤ 5 words after trimming)
 *   2. OR message matches a known continuation phrase
 */
const CONTINUATION_PHRASES = [
  // Korean
  'ㅇㅋ', '오키', '좋아', '좋아요', '그래', '해줘', '해봐', '해주세요',
  '고마워', '감사', '네', '응', 'ㅇㅇ', 'ㄱㄱ', 'ㄱ', '다시', '왜', '왜?',
  '그거', '어떻게', '커밋', '커밋해', '커밋해줘', '계속', '계속해',
  '진행해', '진행해줘', '고고', '시작',
  // English
  'ok', 'okay', 'yes', 'yep', 'yeah', 'sure', 'do it', 'go ahead',
  'go', 'why', 'why?', 'how', 'thanks', 'thx', 'lgtm', 'nice',
  'continue', 'keep going', 'next', 'commit', 'ship it',
]

/**
 * Keyword → agent role mapping for strong-match routing.
 * Each entry: keywords that strongly suggest a specific agent role.
 */
const KEYWORD_ROLE_MAP: Array<{ keywords: string[]; role: string; agentHint?: string }> = [
  { keywords: ['test', 'spec', 'coverage', 'jest', 'vitest', '테스트'], role: 'test', agentHint: 'tester' },
  {
    keywords: ['css', 'style', 'tailwind', 'font', 'color', 'ui', 'ux', '디자인', '스타일', 'layout', 'animation'],
    role: 'design',
    agentHint: 'designer',
  },
  {
    keywords: ['security', 'auth', 'vulnerability', 'cve', '보안', 'permission', 'xss', 'csrf'],
    role: 'security',
    agentHint: 'security',
  },
  {
    keywords: ['review', 'pr', 'pull request', '리뷰', 'code review', 'feedback'],
    role: 'review',
    agentHint: 'reviewer',
  },
  {
    keywords: ['plan', 'roadmap', 'spec', '기획', '스펙', 'milestone', '로드맵', 'task', 'priority'],
    role: 'planning',
    agentHint: 'planner',
  },
  {
    keywords: ['implement', 'code', 'build', 'fix', 'bug', 'refactor', 'feature', '구현', '개발', '코드', '버그'],
    role: 'development',
    agentHint: 'developer',
  },
]

/**
 * File extension → agent role hint.
 */
const FILE_EXT_MAP: Record<string, string> = {
  '.css': 'designer',
  '.scss': 'designer',
  '.less': 'designer',
  '.svg': 'designer',
  '.test.ts': 'tester',
  '.test.tsx': 'tester',
  '.spec.ts': 'tester',
  '.spec.tsx': 'tester',
}

/**
 * Phase → preferred agent role.
 */
const PHASE_ROLE_MAP: Record<string, string> = {
  planning: 'planner',
  implementation: 'developer',
  review: 'reviewer',
}

// ── RuleRouter class ─────────────────────────────────────────

export class RuleRouter {
  /**
   * Evaluate all rules and return the highest-confidence result.
   */
  evaluate(params: {
    message: string
    agents: AgentInfo[]
    observerContext: ObserverContext
    mentionedAgents: string[]
  }): RuleResult {
    const { message, agents, observerContext, mentionedAgents } = params

    // Rule 1: @mention direct — highest priority
    if (mentionedAgents.length > 0) {
      const leader = this.resolveAgent(mentionedAgents[0], agents)
      if (leader) {
        const collabs = mentionedAgents
          .slice(1)
          .map((m) => this.resolveAgent(m, agents))
          .filter((n): n is string => !!n && n !== leader)
        return {
          confidence: 1.0,
          leader,
          collaborators: collabs,
          reason: `@mention: ${leader}`,
          rule: 'mention',
        }
      }
    }

    // Rule 2: Single visible agent
    if (agents.length === 1) {
      return {
        confidence: 1.0,
        leader: agents[0].name,
        collaborators: [],
        reason: 'only one agent available',
        rule: 'single-agent',
      }
    }

    // Rule 3: Continuation pattern — short / affirmative messages → last respondent
    const continuationResult = this.checkContinuation(message, observerContext, agents)
    if (continuationResult) return continuationResult

    // Rule 4: Keyword → agent strong match
    const keywordResult = this.checkKeywords(message, agents)
    if (keywordResult) return keywordResult

    // Rule 5: File extension hint
    const fileExtResult = this.checkFileExtensions(message, agents)
    if (fileExtResult) return fileExtResult

    // Rule 6: Phase-based heuristic
    const phaseResult = this.checkPhase(observerContext, agents)
    if (phaseResult) return phaseResult

    // Fallback — can't decide
    return {
      confidence: 0.0,
      leader: null,
      collaborators: [],
      reason: 'no rule matched with sufficient confidence',
      rule: 'fallback',
    }
  }

  // ── Private rule implementations ───────────────────────────

  /**
   * Rule 3: Continuation pattern
   * Short messages or known continuation phrases → route to last respondent.
   */
  private checkContinuation(
    message: string,
    ctx: ObserverContext,
    agents: AgentInfo[]
  ): RuleResult | null {
    if (!ctx.lastRespondent) return null

    const trimmed = message.trim()
    const lower = trimmed.toLowerCase()
    const wordCount = trimmed.split(/\s+/).length

    const isContinuation =
      wordCount <= 5 &&
      (CONTINUATION_PHRASES.some((p) => lower === p || lower === p + '해' || lower === p + '해줘') ||
        // Very short message without @mention and no clear topic switch
        wordCount <= 3)

    if (!isContinuation) return null

    const leader = this.resolveAgent(ctx.lastRespondent, agents)
    if (!leader) return null

    return {
      confidence: 0.9,
      leader,
      collaborators: [],
      reason: `continuation pattern: "${trimmed}" → ${leader}`,
      rule: 'continuation',
    }
  }

  /**
   * Rule 4: Keyword → agent strong match.
   * Matches message keywords against known role patterns.
   */
  private checkKeywords(message: string, agents: AgentInfo[]): RuleResult | null {
    const lower = message.toLowerCase()
    let bestMatch: { agentName: string; score: number; role: string } | null = null

    for (const entry of KEYWORD_ROLE_MAP) {
      const matchedKeywords = entry.keywords.filter((kw) => lower.includes(kw))
      if (matchedKeywords.length === 0) continue

      // Find agent by hint name or by role containing the role string
      const agentName =
        this.resolveAgentByHint(entry.agentHint, agents) ||
        this.resolveAgentByRole(entry.role, agents)

      if (!agentName) continue

      const score = matchedKeywords.length
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { agentName, score, role: entry.role }
      }
    }

    if (!bestMatch) return null

    return {
      confidence: 0.8,
      leader: bestMatch.agentName,
      collaborators: [],
      reason: `keyword match: ${bestMatch.role} → ${bestMatch.agentName}`,
      rule: 'keyword',
    }
  }

  /**
   * Rule 5: File extension hint.
   * If the message mentions a file path, match its extension to an agent.
   */
  private checkFileExtensions(message: string, agents: AgentInfo[]): RuleResult | null {
    for (const [ext, hint] of Object.entries(FILE_EXT_MAP)) {
      if (message.includes(ext)) {
        const agentName = this.resolveAgentByHint(hint, agents)
        if (agentName) {
          return {
            confidence: 0.8,
            leader: agentName,
            collaborators: [],
            reason: `file extension ${ext} → ${agentName}`,
            rule: 'keyword',
          }
        }
      }
    }
    return null
  }

  /**
   * Rule 6: Phase-based heuristic.
   * If the conversation is in a known phase, suggest the role-appropriate agent.
   */
  private checkPhase(ctx: ObserverContext, agents: AgentInfo[]): RuleResult | null {
    if (ctx.conversationPhase === 'idle' || ctx.conversationPhase === 'discussion') {
      return null
    }

    const hintRole = PHASE_ROLE_MAP[ctx.conversationPhase]
    if (!hintRole) return null

    const agentName = this.resolveAgentByHint(hintRole, agents)
    if (!agentName) return null

    return {
      confidence: 0.6,
      leader: agentName,
      collaborators: [],
      reason: `phase "${ctx.conversationPhase}" → ${agentName}`,
      rule: 'phase',
    }
  }

  // ── Agent resolution helpers ───────────────────────────────

  /** Resolve an agent name (case-insensitive) from the list, or handle @all */
  private resolveAgent(name: string, agents: AgentInfo[]): string | null {
    if (name.toLowerCase() === 'all' && agents.length > 0) {
      return agents[0].name
    }
    const found = agents.find((a) => a.name.toLowerCase() === name.toLowerCase())
    return found ? found.name : null
  }

  /** Find agent by hint name (e.g. "tester", "designer") */
  private resolveAgentByHint(hint: string | undefined, agents: AgentInfo[]): string | null {
    if (!hint) return null
    return this.resolveAgent(hint, agents)
  }

  /** Find agent whose role contains the given role string */
  private resolveAgentByRole(role: string, agents: AgentInfo[]): string | null {
    const found = agents.find((a) => a.role.toLowerCase().includes(role.toLowerCase()))
    return found ? found.name : null
  }
}

/** Singleton instance */
export const ruleRouter = new RuleRouter()
