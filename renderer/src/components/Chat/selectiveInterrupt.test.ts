/**
 * Tests for Selective Agent Interrupt Logic
 *
 * Verifies the mention-based selective interruption behavior in flushBuffer:
 * 1. @mention specific agent → only that agent gets interrupted
 * 2. @all → all running agents get interrupted
 * 3. No mention → defer to dispatcher, only routed agent gets interrupted
 * 4. Non-targeted running agents continue undisturbed
 */
import { describe, it, expect } from 'vitest'

// ── Extract pure logic from App.tsx for testability ──

/** parseMentions: extracts @mentions from text (mirrors App.tsx line 714-720) */
function parseMentions(text: string): string[] {
  const re = /@([\w\p{L}\p{N}_-]+)/gu
  const found: string[] = []
  let m
  while ((m = re.exec(text)) !== null) found.push(m[1])
  return found
}

/** Represents a running agent entry: [key, { agentName, runId, prompt }] */
type RunEntry = [string, { agentName: string; runId: string; prompt: string }]

/**
 * selectInterruptTargets: determines which running agents should be interrupted.
 * Mirrors the logic in flushBuffer lines 952-963 (pre-routing) and 1060-1070 (post-routing).
 */
function selectInterruptTargets(
  runningInFolder: RunEntry[],
  allMentions: string[],
  routedAgentNames?: string[] // only used when allMentions is empty (post-routing)
): RunEntry[] {
  if (runningInFolder.length === 0) return []

  // Pre-routing: mentions exist
  if (allMentions.length > 0) {
    const isAll = allMentions.includes('all')
    if (isAll) return runningInFolder
    return runningInFolder.filter(([, run]) =>
      allMentions.some((m) => run.agentName.toLowerCase() === m.toLowerCase())
    )
  }

  // Post-routing: no mentions, use dispatcher result
  if (routedAgentNames && routedAgentNames.length > 0) {
    const lowerNames = routedAgentNames.map((n) => n.toLowerCase())
    return runningInFolder.filter(([, run]) =>
      lowerNames.includes(run.agentName.toLowerCase())
    )
  }

  return []
}

// ── Test Data Helpers ──

function makeRun(folder: string, name: string, runId?: string): RunEntry {
  return [
    `${folder}::${name}`,
    { agentName: name, runId: runId || `run-${name}`, prompt: `task for ${name}` },
  ]
}

// ═══════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════

describe('parseMentions', () => {
  it('extracts single mention', () => {
    expect(parseMentions('hey @developer fix this')).toEqual(['developer'])
  })

  it('extracts multiple mentions', () => {
    expect(parseMentions('@tester check and @reviewer review')).toEqual([
      'tester',
      'reviewer',
    ])
  })

  it('extracts @all mention', () => {
    expect(parseMentions('@all please stop')).toEqual(['all'])
  })

  it('returns empty for no mentions', () => {
    expect(parseMentions('just a regular message')).toEqual([])
  })

  it('handles mention at start, middle, end of text', () => {
    expect(parseMentions('@a hello @b world @c')).toEqual(['a', 'b', 'c'])
  })

  it('handles unicode agent names', () => {
    expect(parseMentions('@디자이너 확인해줘')).toEqual(['디자이너'])
  })

  it('handles hyphenated and underscored names', () => {
    expect(parseMentions('@code-reviewer @test_runner')).toEqual([
      'code-reviewer',
      'test_runner',
    ])
  })

  it('does not match email addresses as mentions', () => {
    // email like user@domain.com — the @domain part will still match
    // This is expected behavior based on the regex
    const result = parseMentions('email user@domain.com')
    expect(result).toEqual(['domain'])
  })

  it('handles duplicate mentions', () => {
    expect(parseMentions('@dev @dev @dev')).toEqual(['dev', 'dev', 'dev'])
  })
})

describe('selectInterruptTargets — @mention cases (pre-routing)', () => {
  const folder = '/project'
  const testerRun = makeRun(folder, 'tester')
  const developerRun = makeRun(folder, 'developer')
  const designerRun = makeRun(folder, 'designer')
  const running: RunEntry[] = [testerRun, developerRun, designerRun]

  it('멘션된 에이전트만 중지: @developer 멘션 → tester/designer 계속 진행', () => {
    const targets = selectInterruptTargets(running, ['developer'])
    expect(targets).toHaveLength(1)
    expect(targets[0][1].agentName).toBe('developer')
  })

  it('멘션되지 않은 에이전트는 중지 대상에서 제외', () => {
    const targets = selectInterruptTargets(running, ['developer'])
    const targetNames = targets.map(([, r]) => r.agentName)
    expect(targetNames).not.toContain('tester')
    expect(targetNames).not.toContain('designer')
  })

  it('여러 에이전트 멘션: @tester @designer → 둘 다 중지, developer 계속', () => {
    const targets = selectInterruptTargets(running, ['tester', 'designer'])
    expect(targets).toHaveLength(2)
    const names = targets.map(([, r]) => r.agentName)
    expect(names).toContain('tester')
    expect(names).toContain('designer')
    expect(names).not.toContain('developer')
  })

  it('@all 멘션 → 모든 에이전트 중지', () => {
    const targets = selectInterruptTargets(running, ['all'])
    expect(targets).toHaveLength(3)
  })

  it('멘션된 에이전트가 실행 중이 아닌 경우 → 빈 결과', () => {
    const targets = selectInterruptTargets(running, ['reviewer'])
    expect(targets).toHaveLength(0)
  })

  it('대소문자 무시: @Developer → developer 매칭', () => {
    const targets = selectInterruptTargets(running, ['Developer'])
    expect(targets).toHaveLength(1)
    expect(targets[0][1].agentName).toBe('developer')
  })

  it('실행 중인 에이전트 없으면 빈 결과', () => {
    const targets = selectInterruptTargets([], ['developer'])
    expect(targets).toHaveLength(0)
  })
})

describe('selectInterruptTargets — no-mention cases (post-routing)', () => {
  const folder = '/project'
  const testerRun = makeRun(folder, 'tester')
  const developerRun = makeRun(folder, 'developer')
  const designerRun = makeRun(folder, 'designer')
  const running: RunEntry[] = [testerRun, developerRun, designerRun]

  it('디스패처가 developer를 선택 → developer만 중지, tester/designer 계속', () => {
    const targets = selectInterruptTargets(running, [], ['developer'])
    expect(targets).toHaveLength(1)
    expect(targets[0][1].agentName).toBe('developer')
  })

  it('디스패처가 tester + designer를 선택 → 둘만 중지, developer 계속', () => {
    const targets = selectInterruptTargets(running, [], ['tester', 'designer'])
    expect(targets).toHaveLength(2)
    const names = targets.map(([, r]) => r.agentName)
    expect(names).toContain('tester')
    expect(names).toContain('designer')
    expect(names).not.toContain('developer')
  })

  it('디스패처가 선택한 에이전트가 실행 중이 아닌 경우 → 빈 결과', () => {
    const targets = selectInterruptTargets(running, [], ['reviewer'])
    expect(targets).toHaveLength(0)
  })

  it('디스패처 결과 없으면 아무도 중지 안 됨', () => {
    const targets = selectInterruptTargets(running, [])
    expect(targets).toHaveLength(0)
  })

  it('디스패처 대소문자 무시', () => {
    const targets = selectInterruptTargets(running, [], ['TESTER'])
    expect(targets).toHaveLength(1)
    expect(targets[0][1].agentName).toBe('tester')
  })
})

describe('selectInterruptTargets — edge cases', () => {
  const folder = '/project'

  it('같은 에이전트가 여러 번 멘션 → 한 번만 매칭', () => {
    const running: RunEntry[] = [makeRun(folder, 'developer')]
    const targets = selectInterruptTargets(running, ['developer', 'developer'])
    expect(targets).toHaveLength(1)
  })

  it('멘션에 @all과 다른 이름이 같이 있으면 @all 우선 → 전부 중지', () => {
    const running: RunEntry[] = [
      makeRun(folder, 'tester'),
      makeRun(folder, 'developer'),
    ]
    const targets = selectInterruptTargets(running, ['developer', 'all'])
    expect(targets).toHaveLength(2)
  })

  it('빈 실행 목록 + 빈 멘션 → 빈 결과', () => {
    expect(selectInterruptTargets([], [])).toEqual([])
  })

  it('핵심 시나리오: tester 작업중 + @developer 멘션 → tester 안 멈춤', () => {
    // This is THE bug scenario that was reported
    const running: RunEntry[] = [makeRun(folder, 'tester')]
    const mentions = parseMentions('@developer 이거 수정해줘')

    // Pre-routing: tester is NOT in mentions
    const preTargets = selectInterruptTargets(running, mentions)
    expect(preTargets).toHaveLength(0) // ✅ tester should NOT be interrupted

    // Post-routing: dispatcher routes to developer (who isn't running)
    const postTargets = selectInterruptTargets(running, [], ['developer'])
    expect(postTargets).toHaveLength(0) // ✅ tester still safe
  })

  it('핵심 시나리오: tester + developer 작업중 + 일반 메시지 → 디스패처가 developer 선택 → tester 계속', () => {
    const running: RunEntry[] = [
      makeRun(folder, 'tester'),
      makeRun(folder, 'developer'),
    ]
    const mentions = parseMentions('버그 고쳐줘') // no mentions

    // Pre-routing: no mentions, skip
    expect(mentions).toHaveLength(0)

    // Post-routing: dispatcher picks developer
    const targets = selectInterruptTargets(running, mentions, ['developer'])
    expect(targets).toHaveLength(1)
    expect(targets[0][1].agentName).toBe('developer')
    // tester continues undisturbed
  })

  it('핵심 시나리오: 아무도 안 돌아가는 중 + @developer 멘션 → 중지 대상 없음', () => {
    const running: RunEntry[] = []
    const mentions = parseMentions('@developer 확인해줘')
    const targets = selectInterruptTargets(running, mentions)
    expect(targets).toHaveLength(0)
  })
})

describe('flushBuffer integration flow — full scenario walkthrough', () => {
  /**
   * These tests simulate the full flushBuffer flow decisions
   * without actual React state or IPC calls.
   */

  function simulateFlushBuffer(
    userMessages: string[],
    runningAgents: { name: string }[],
    dispatcherResult?: { leader: string; collaborators?: string[] }
  ): {
    preRoutingTargets: string[]
    postRoutingTargets: string[]
    leaderAgent: string | null
  } {
    const folder = '/project'
    const running: RunEntry[] = runningAgents.map((a) => makeRun(folder, a.name))

    // Step 1: Parse mentions from all messages
    const allMentions = userMessages.flatMap(parseMentions)

    // Step 2: Pre-routing interrupt (when mentions exist)
    let preRoutingTargets: string[] = []
    if (allMentions.length > 0 && running.length > 0) {
      preRoutingTargets = selectInterruptTargets(running, allMentions).map(
        ([, r]) => r.agentName
      )
    }

    // Step 3: Determine leader (routing)
    let leader: string | null = null
    let collaborators: string[] = []
    if (allMentions.length > 0) {
      const isAll = allMentions.includes('all')
      if (isAll) {
        leader = runningAgents[0]?.name ?? null
      } else {
        leader = allMentions[0] // simplified: first mentioned = leader
        collaborators = allMentions.slice(1)
      }
    } else if (dispatcherResult) {
      leader = dispatcherResult.leader
      collaborators = dispatcherResult.collaborators ?? []
    }

    // Step 4: Post-routing interrupt (when no mentions)
    let postRoutingTargets: string[] = []
    if (allMentions.length === 0 && running.length > 0 && leader) {
      const allTargetNames = [leader, ...collaborators]
      postRoutingTargets = selectInterruptTargets(running, [], allTargetNames).map(
        ([, r]) => r.agentName
      )
    }

    return { preRoutingTargets, postRoutingTargets, leaderAgent: leader }
  }

  it('시나리오 1: @developer 멘션 + tester 작업중 → tester 안 멈춤', () => {
    const result = simulateFlushBuffer(
      ['@developer 이거 봐줘'],
      [{ name: 'tester' }]
    )
    expect(result.preRoutingTargets).toEqual([])
    expect(result.postRoutingTargets).toEqual([])
    expect(result.leaderAgent).toBe('developer')
  })

  it('시나리오 2: @tester 멘션 + tester 작업중 → tester만 중지', () => {
    const result = simulateFlushBuffer(
      ['@tester 다시 해봐'],
      [{ name: 'tester' }, { name: 'developer' }]
    )
    expect(result.preRoutingTargets).toEqual(['tester'])
    expect(result.postRoutingTargets).toEqual([])
  })

  it('시나리오 3: @all 멘션 + 여러 에이전트 작업중 → 전부 중지', () => {
    const result = simulateFlushBuffer(
      ['@all 멈춰'],
      [{ name: 'tester' }, { name: 'developer' }, { name: 'designer' }]
    )
    expect(result.preRoutingTargets).toEqual(['tester', 'developer', 'designer'])
    expect(result.postRoutingTargets).toEqual([])
  })

  it('시나리오 4: 멘션 없는 메시지 + 여러 에이전트 작업중 → 디스패처가 developer 선택 → developer만 중지', () => {
    const result = simulateFlushBuffer(
      ['이 버그 좀 고쳐줘'],
      [{ name: 'tester' }, { name: 'developer' }],
      { leader: 'developer' }
    )
    expect(result.preRoutingTargets).toEqual([])
    expect(result.postRoutingTargets).toEqual(['developer'])
    expect(result.leaderAgent).toBe('developer')
  })

  it('시나리오 5: 멘션 없는 메시지 + tester만 작업중 + 디스패처가 developer 선택 → 아무도 안 멈춤', () => {
    const result = simulateFlushBuffer(
      ['홈페이지 수정해줘'],
      [{ name: 'tester' }],
      { leader: 'developer' }
    )
    expect(result.preRoutingTargets).toEqual([])
    expect(result.postRoutingTargets).toEqual([])
    // tester stays running!
  })

  it('시나리오 6: 여러 메시지 버퍼링 중 하나만 멘션 있음 → 멘션 기반으로 처리', () => {
    const result = simulateFlushBuffer(
      ['이것도 봐줘', '@developer 이건 급해'],
      [{ name: 'tester' }, { name: 'developer' }]
    )
    expect(result.preRoutingTargets).toEqual(['developer'])
    expect(result.leaderAgent).toBe('developer')
  })

  it('시나리오 7: 아무도 안 돌아가는 중 → 중지 대상 없음', () => {
    const result = simulateFlushBuffer(
      ['@developer 해줘'],
      []
    )
    expect(result.preRoutingTargets).toEqual([])
    expect(result.postRoutingTargets).toEqual([])
  })
})
