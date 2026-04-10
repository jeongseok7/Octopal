/**
 * RuleRouter — Layer 0 of the 3-Layer Hybrid Routing Architecture
 *
 * Minimal: only handles the **single-agent** case deterministically.
 * Everything else (including continuation patterns) falls through to
 * the LLM Router (Sonnet) for context-aware routing.
 *
 * @mention routing is handled in the renderer (App.tsx) before
 * the dispatcher is even called, so it's not duplicated here.
 *
 * Rule priority:
 *   1. Single visible agent  → 1.0
 *   2. Fallback              → 0.0  (→ LLM Router)
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
  rule: 'single-agent' | 'fallback'
}

// ── Constants ────────────────────────────────────────────────

export const CONFIDENCE_THRESHOLD = 0.8

// ── RuleRouter class ─────────────────────────────────────────

export class RuleRouter {
  /**
   * Evaluate: only the single-agent shortcut.
   * Everything else → LLM Router (Sonnet).
   */
  evaluate(params: {
    message: string
    agents: AgentInfo[]
    observerContext: ObserverContext
  }): RuleResult {
    const { agents } = params

    // Rule 1: Single visible agent — no dispatcher needed
    if (agents.length === 1) {
      return {
        confidence: 1.0,
        leader: agents[0].name,
        collaborators: [],
        reason: 'only one agent available',
        rule: 'single-agent',
      }
    }

    // Everything else → LLM Router (Sonnet) for context-aware routing
    return {
      confidence: 0.0,
      leader: null,
      collaborators: [],
      reason: 'multiple agents — delegating to LLM router',
      rule: 'fallback',
    }
  }
}

/** Singleton instance */
export const ruleRouter = new RuleRouter()
