/**
 * Token Optimizer — App-level token savings for agent execution.
 *
 * Two main strategies:
 * 1. History compression: Truncate long messages, summarize older history
 * 2. System prompt compaction: Shorter static sections (same semantics, fewer tokens)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  role: string
  text: string
  ts?: number
  roomTs?: number
}

export interface CompressedHistory {
  /** Brief summary of older messages (null if history is short enough) */
  summary: string | null
  /** Recent messages kept verbatim (but truncated if too long) */
  recent: HistoryEntry[]
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Rough token count estimate. English ≈ 4 chars/token, Korean ≈ 2 chars/token.
 * We use ~3 as a blended average for mixed-language text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}

// ---------------------------------------------------------------------------
// History compression
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RECENT = 4       // Keep last N messages verbatim
const DEFAULT_MAX_PER_MSG = 500    // Max chars per individual message
const DEFAULT_SUMMARY_CHARS = 600  // Max chars for the older-message summary

/**
 * Compress a conversation history array so it fits a smaller token budget.
 *
 * - Keeps the most recent `maxRecentMessages` verbatim (truncated to maxPerMessage).
 * - Summarises everything older into a single compact line.
 */
export function compressHistory(
  history: HistoryEntry[],
  options: {
    maxRecentMessages?: number
    maxPerMessage?: number
    maxSummaryChars?: number
  } = {},
): CompressedHistory {
  const maxRecent = options.maxRecentMessages ?? DEFAULT_MAX_RECENT
  const maxPerMsg = options.maxPerMessage ?? DEFAULT_MAX_PER_MSG
  const maxSummary = options.maxSummaryChars ?? DEFAULT_SUMMARY_CHARS

  const truncate = (h: HistoryEntry): HistoryEntry => ({
    ...h,
    text: h.text.length > maxPerMsg ? h.text.slice(0, maxPerMsg) + '…' : h.text,
  })

  if (history.length <= maxRecent) {
    return { summary: null, recent: history.map(truncate) }
  }

  const recent = history.slice(-maxRecent).map(truncate)
  const old = history.slice(0, -maxRecent)

  // Build a compact digest of older messages: "User: blah → Agent: blah → …"
  const parts = old.map((h) => {
    const who = h.role === 'user' ? 'User' : 'Agent'
    // Take the first line only, strip markdown noise
    const brief = h.text
      .replace(/```[\s\S]*?```/g, '[code]')     // collapse code blocks
      .replace(/\|[\s\S]*?\|/g, '[table]')       // collapse tables
      .replace(/\n+/g, ' ')                      // flatten newlines
      .slice(0, 80)
      .trim()
    return `${who}: ${brief}`
  })

  let summary = parts.join(' → ')
  if (summary.length > maxSummary) {
    summary = summary.slice(0, maxSummary) + '…'
  }

  return { summary, recent }
}

/**
 * Format a CompressedHistory into system-prompt text.
 */
export function formatCompressedHistory(ch: CompressedHistory): string {
  const lines: string[] = ['\nRecent conversation:']

  if (ch.summary) {
    lines.push(`[Earlier context: ${ch.summary}]`)
  }

  for (const msg of ch.recent) {
    const who = msg.role === 'user' ? 'User' : 'Assistant'
    lines.push(`${who}: ${msg.text}`)
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// System prompt compaction
// ---------------------------------------------------------------------------

/**
 * Compact version of the "Octo world" context block.
 * Same semantics, ~40% fewer tokens than the original verbose version.
 */
export const COMPACT_WORLD_CONTEXT = `You are an agent in Octopal, a group-chat messenger for AI agents.

How your world works:
- You are a ".octo" file: a JSON file on disk that stores your name, role, memory, and conversation history. Deleting the file deletes you; copying it clones you.
- Your current project is the folder that contains your .octo file. Other .octo files in the same folder are your peers.
- Use @name to talk to peers. The human user talks to the whole room and can @mention any agent directly. A dispatcher routes unmentioned messages based on roles and context.
- You persist across sessions. Stay in character based on your role below.`

/**
 * Compact version of the "About Octopal" context block.
 * Same semantics, ~50% fewer tokens.
 */
export const COMPACT_APP_CONTEXT = `About Octopal:
- Create agents by adding .octo files to the project folder. Each file = one agent with its own name, role, and memory.
- @name mentions trigger agent responses. Wiki (.md files in the wiki directory) shares knowledge across all agents and sessions.
- Permissions (file write, shell, network) are per-agent, controlled in settings. Activity log shows all tool calls in real time.
- Workspaces group project folders. The wiki is shared across all folders in the same workspace.
- Agents can suggest hiring specialized teammates when the task calls for it.`

/**
 * Build a compact wiki section for the system prompt.
 */
export function compactWikiSection(wikiDir: string, pageList: string): string {
  return `\nWorkspace wiki — shared notes for the team:
- Path: ${wikiDir}
- Pages: ${pageList}
- Read: use Read tool with absolute path. Write/Edit: same, .md files only (flat, no subfolders).
- Check the wiki at the start of non-trivial tasks for team context. Update when you learn something durable.`
}

/**
 * Build a compact peer-agents section.
 */
export function compactPeerSection(peers: Array<{ name: string; role?: string }>): string {
  const lines = ['\nYou are in a group chat with these other agents:']
  peers.forEach((p) => lines.push(`- @${p.name}: ${p.role || 'assistant'}`))
  lines.push(
    '\nIf another agent\'s expertise would help answer this, you can mention them with @name in your response. They will automatically see your message and may respond. Only mention peers when it genuinely adds value — do not mention them just to be polite.',
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Router prompt optimisation
// ---------------------------------------------------------------------------

/**
 * Compress the recent-history block that goes into the dispatcher/router prompt.
 * Instead of sending full message text (truncated to 300 chars), produce a much
 * shorter summary when the SmartObserver context is available.
 */
export function compressRouterHistory(
  recentHistory: Array<{ agentName: string; text: string }>,
  hasObserverContext: boolean,
): string {
  if (recentHistory.length === 0) return ''

  if (hasObserverContext) {
    // When we already have SmartObserver context, we only need a minimal
    // history fingerprint — last 3 messages, 100 chars each.
    const minimal = recentHistory.slice(-3).map((h) => {
      const who = h.agentName === 'user' ? 'User' : h.agentName
      return `${who}: ${h.text.slice(0, 100).replace(/\n/g, ' ')}`
    })
    return '\n\nRecent messages:\n' + minimal.join('\n')
  }

  // No observer context — keep the original 6-message / 300-char behaviour.
  return (
    '\n\nRecent conversation:\n' +
    recentHistory
      .map((h) => `${h.agentName === 'user' ? 'User' : h.agentName}: ${h.text.slice(0, 300)}`)
      .join('\n')
  )
}
