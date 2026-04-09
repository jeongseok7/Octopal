/**
 * Observer — Rule-based conversation context tracker
 *
 * Watches all messages in each folder and maintains a lightweight context summary.
 * No LLM calls — pure rule-based tracking for speed and zero cost.
 *
 * The Router (dispatcher) uses this context to make better routing decisions,
 * especially for long conversations where the 6-message window isn't enough.
 */

export interface AgentActivity {
  lastActiveTs: number
  messageCount: number
  /** First ~200 chars of the agent's last response */
  lastWorkingOn: string
  /** Topics/keywords the agent has been involved with */
  recentKeywords: string[]
}

export interface ObserverContext {
  /** Detected current topic (keyword-based) */
  currentTopic: string | null
  /** Recent topic keywords (last 5 unique) */
  recentTopics: string[]
  /** Per-agent activity tracking */
  agentActivity: Record<string, AgentActivity>
  /** Agents mentioned but haven't responded yet */
  pendingMentions: string[]
  /** Estimated conversation phase */
  conversationPhase: 'idle' | 'planning' | 'implementation' | 'review' | 'discussion'
  /** Total messages tracked in this session */
  messageCount: number
  /** The last agent that responded */
  lastRespondent: string | null
  /** Timestamp of last activity */
  lastActivityTs: number
}

// ── Topic detection keywords ────────────────────────────────

const TOPIC_PATTERNS: Array<{ keywords: string[]; topic: string }> = [
  { keywords: ['test', 'spec', 'coverage', 'jest', 'vitest', 'assert'], topic: 'testing' },
  { keywords: ['security', 'auth', 'permission', 'token', 'vulnerability', 'cve'], topic: 'security' },
  { keywords: ['css', 'style', 'layout', 'font', 'color', 'ui', 'ux', 'design', 'tailwind'], topic: 'design' },
  { keywords: ['deploy', 'release', 'version', 'build', 'ci', 'cd', 'pipeline'], topic: 'deployment' },
  { keywords: ['bug', 'fix', 'error', 'crash', 'issue', 'broken'], topic: 'bugfix' },
  { keywords: ['refactor', 'clean', 'optimize', 'performance'], topic: 'refactoring' },
  { keywords: ['plan', 'roadmap', 'spec', 'design doc', 'architecture', 'proposal'], topic: 'planning' },
  { keywords: ['review', 'pr', 'pull request', 'code review', 'feedback'], topic: 'review' },
  { keywords: ['api', 'endpoint', 'rest', 'graphql', 'fetch', 'request'], topic: 'api' },
  { keywords: ['database', 'db', 'query', 'migration', 'schema', 'sql'], topic: 'database' },
  { keywords: ['mcp', 'server', 'tool', 'plugin'], topic: 'mcp' },
  { keywords: ['dispatch', 'route', 'router', 'observer'], topic: 'routing' },
  { keywords: ['i18n', 'translate', 'locale', 'language'], topic: 'i18n' },
]

// ── Phase detection ─────────────────────────────────────────

const PHASE_SIGNALS: Record<string, string[]> = {
  planning: ['plan', 'should we', 'proposal', 'approach', 'strategy', 'how about', 'spec', 'design'],
  implementation: ['implement', 'code', 'write', 'create', 'add', 'build', 'fix', 'update', 'commit', 'push'],
  review: ['review', 'check', 'looks good', 'lgtm', 'feedback', 'suggestion', 'pr'],
}

// ── Observer class ──────────────────────────────────────────

export class ConversationObserver {
  /** Per-folder context storage */
  private contexts = new Map<string, ObserverContext>()

  /** Max recent topics to keep */
  private static MAX_TOPICS = 8
  /** Max keywords per agent */
  private static MAX_KEYWORDS = 10

  /** Get or create context for a folder */
  getContext(folderPath: string): ObserverContext {
    if (!this.contexts.has(folderPath)) {
      this.contexts.set(folderPath, this.createEmptyContext())
    }
    return this.contexts.get(folderPath)!
  }

  /** Update context with a new message */
  update(folderPath: string, message: {
    agentName: string
    text: string
    ts: number
    mentions?: string[]
  }): void {
    const ctx = this.getContext(folderPath)
    ctx.messageCount++
    ctx.lastActivityTs = message.ts

    const textLower = message.text.toLowerCase()

    // ── Update topic detection ──
    const detectedTopics = this.detectTopics(textLower)
    if (detectedTopics.length > 0) {
      ctx.currentTopic = detectedTopics[0]
      for (const topic of detectedTopics) {
        // Move to front if exists, or add
        ctx.recentTopics = ctx.recentTopics.filter((t) => t !== topic)
        ctx.recentTopics.unshift(topic)
      }
      ctx.recentTopics = ctx.recentTopics.slice(0, ConversationObserver.MAX_TOPICS)
    }

    // ── Update phase detection ──
    ctx.conversationPhase = this.detectPhase(textLower, ctx.conversationPhase)

    if (message.agentName === 'user') {
      // Track pending mentions from user message
      if (message.mentions && message.mentions.length > 0) {
        ctx.pendingMentions = [...message.mentions]
      }
    } else {
      // Agent response — update activity
      const agent = message.agentName
      ctx.lastRespondent = agent

      // Remove from pending
      ctx.pendingMentions = ctx.pendingMentions.filter(
        (m) => m.toLowerCase() !== agent.toLowerCase()
      )

      // Update agent activity
      const activity: AgentActivity = ctx.agentActivity[agent] || {
        lastActiveTs: 0,
        messageCount: 0,
        lastWorkingOn: '',
        recentKeywords: [],
      }
      activity.lastActiveTs = message.ts
      activity.messageCount++
      activity.lastWorkingOn = message.text.slice(0, 200)

      // Merge detected topics into agent keywords
      for (const topic of detectedTopics) {
        if (!activity.recentKeywords.includes(topic)) {
          activity.recentKeywords.push(topic)
          if (activity.recentKeywords.length > ConversationObserver.MAX_KEYWORDS) {
            activity.recentKeywords.shift()
          }
        }
      }

      ctx.agentActivity[agent] = activity

      // Track mentions in agent response
      if (message.mentions && message.mentions.length > 0) {
        for (const m of message.mentions) {
          if (!ctx.pendingMentions.includes(m)) {
            ctx.pendingMentions.push(m)
          }
        }
      }
    }
  }

  /** Reset context for a folder */
  reset(folderPath: string): void {
    this.contexts.delete(folderPath)
  }

  /** Serialize context to a compact string for the dispatcher prompt */
  serialize(folderPath: string): string {
    const ctx = this.getContext(folderPath)
    if (ctx.messageCount === 0) return ''

    const parts: string[] = []

    // Current topic
    if (ctx.currentTopic) {
      parts.push(`Current topic: ${ctx.currentTopic}`)
    }
    if (ctx.recentTopics.length > 1) {
      parts.push(`Recent topics: ${ctx.recentTopics.join(', ')}`)
    }

    // Phase
    if (ctx.conversationPhase !== 'idle') {
      parts.push(`Phase: ${ctx.conversationPhase}`)
    }

    // Agent activity summary
    const agentSummaries: string[] = []
    const now = Date.now()
    for (const [name, act] of Object.entries(ctx.agentActivity)) {
      const ago = this.formatTimeAgo(now - act.lastActiveTs)
      const keywords = act.recentKeywords.length > 0
        ? ` (topics: ${act.recentKeywords.join(', ')})`
        : ''
      agentSummaries.push(`  - ${name}: last active ${ago}, ${act.messageCount} msgs${keywords}`)
    }
    if (agentSummaries.length > 0) {
      parts.push(`Agent activity:\n${agentSummaries.join('\n')}`)
    }

    // Last respondent
    if (ctx.lastRespondent) {
      parts.push(`Last respondent: ${ctx.lastRespondent}`)
    }

    // Pending mentions
    if (ctx.pendingMentions.length > 0) {
      parts.push(`Pending mentions: ${ctx.pendingMentions.join(', ')}`)
    }

    parts.push(`Total messages in session: ${ctx.messageCount}`)

    return parts.join('\n')
  }

  // ── Private helpers ──

  private createEmptyContext(): ObserverContext {
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

  private detectTopics(textLower: string): string[] {
    const found: string[] = []
    for (const { keywords, topic } of TOPIC_PATTERNS) {
      if (keywords.some((kw) => textLower.includes(kw))) {
        found.push(topic)
      }
    }
    return found
  }

  private detectPhase(
    textLower: string,
    currentPhase: ObserverContext['conversationPhase']
  ): ObserverContext['conversationPhase'] {
    let bestPhase = currentPhase
    let bestScore = 0

    for (const [phase, signals] of Object.entries(PHASE_SIGNALS)) {
      const score = signals.filter((s) => textLower.includes(s)).length
      if (score > bestScore) {
        bestScore = score
        bestPhase = phase as ObserverContext['conversationPhase']
      }
    }

    // If no strong signal, keep current phase (don't flip-flop)
    return bestScore > 0 ? bestPhase : currentPhase
  }

  private formatTimeAgo(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }
}

/** Singleton observer instance */
export const observer = new ConversationObserver()
