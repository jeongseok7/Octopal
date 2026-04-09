import { describe, it, expect, beforeEach } from 'vitest'
import { ConversationObserver } from './observer'

describe('ConversationObserver', () => {
  let obs: ConversationObserver
  const folder = '/test/project'

  beforeEach(() => {
    obs = new ConversationObserver()
  })

  describe('getContext', () => {
    it('returns empty context for new folder', () => {
      const ctx = obs.getContext(folder)
      expect(ctx.messageCount).toBe(0)
      expect(ctx.currentTopic).toBeNull()
      expect(ctx.recentTopics).toEqual([])
      expect(ctx.conversationPhase).toBe('idle')
      expect(ctx.lastRespondent).toBeNull()
    })
  })

  describe('update', () => {
    it('increments message count', () => {
      obs.update(folder, { agentName: 'user', text: 'hello', ts: 1000 })
      obs.update(folder, { agentName: 'assistant', text: 'hi', ts: 2000 })
      expect(obs.getContext(folder).messageCount).toBe(2)
    })

    it('tracks last respondent for agent messages', () => {
      obs.update(folder, { agentName: 'user', text: 'fix the bug', ts: 1000 })
      obs.update(folder, { agentName: 'developer', text: 'done', ts: 2000 })
      expect(obs.getContext(folder).lastRespondent).toBe('developer')
    })

    it('does not set lastRespondent for user messages', () => {
      obs.update(folder, { agentName: 'user', text: 'hello', ts: 1000 })
      expect(obs.getContext(folder).lastRespondent).toBeNull()
    })

    it('detects topics from keywords', () => {
      obs.update(folder, { agentName: 'user', text: 'write tests for the security module', ts: 1000 })
      const ctx = obs.getContext(folder)
      expect(ctx.recentTopics).toContain('testing')
      expect(ctx.recentTopics).toContain('security')
    })

    it('detects conversation phase', () => {
      obs.update(folder, { agentName: 'user', text: 'implement the new feature and build it', ts: 1000 })
      expect(obs.getContext(folder).conversationPhase).toBe('implementation')
    })

    it('detects planning phase', () => {
      obs.update(folder, { agentName: 'user', text: 'let me plan the approach and strategy', ts: 1000 })
      expect(obs.getContext(folder).conversationPhase).toBe('planning')
    })

    it('detects review phase', () => {
      obs.update(folder, { agentName: 'user', text: 'review this PR and give feedback', ts: 1000 })
      expect(obs.getContext(folder).conversationPhase).toBe('review')
    })

    it('tracks agent activity', () => {
      obs.update(folder, { agentName: 'developer', text: 'I fixed the CSS bug in the layout', ts: 5000 })
      const ctx = obs.getContext(folder)
      const activity = ctx.agentActivity['developer']
      expect(activity).toBeDefined()
      expect(activity.messageCount).toBe(1)
      expect(activity.lastActiveTs).toBe(5000)
      expect(activity.lastWorkingOn).toContain('fixed the CSS bug')
      expect(activity.recentKeywords).toContain('design')
      expect(activity.recentKeywords).toContain('bugfix')
    })

    it('tracks pending mentions from user', () => {
      obs.update(folder, {
        agentName: 'user',
        text: '@developer fix this',
        ts: 1000,
        mentions: ['developer'],
      })
      expect(obs.getContext(folder).pendingMentions).toEqual(['developer'])
    })

    it('clears pending mention when agent responds', () => {
      obs.update(folder, {
        agentName: 'user',
        text: '@developer fix this',
        ts: 1000,
        mentions: ['developer'],
      })
      obs.update(folder, { agentName: 'developer', text: 'on it', ts: 2000 })
      expect(obs.getContext(folder).pendingMentions).toEqual([])
    })

    it('limits recent topics', () => {
      // Each update with unique topic keywords
      const topics = [
        'write some tests',
        'check security',
        'fix the css style',
        'deploy the release',
        'fix the bug',
        'refactor code',
        'review the pr',
        'build the api endpoint',
        'update the database schema',
        'check the mcp server',
      ]
      topics.forEach((text, i) => {
        obs.update(folder, { agentName: 'user', text, ts: i * 1000 })
      })
      expect(obs.getContext(folder).recentTopics.length).toBeLessThanOrEqual(8)
    })
  })

  describe('serialize', () => {
    it('returns empty string for empty context', () => {
      expect(obs.serialize(folder)).toBe('')
    })

    it('includes topic and phase info', () => {
      obs.update(folder, { agentName: 'user', text: 'implement the security feature', ts: 1000 })
      obs.update(folder, { agentName: 'developer', text: 'working on it now', ts: 2000 })
      const result = obs.serialize(folder)
      expect(result).toContain('Current topic: security')
      expect(result).toContain('Phase: implementation')
      expect(result).toContain('Last respondent: developer')
      expect(result).toContain('Total messages in session: 2')
    })

    it('includes agent activity summary', () => {
      obs.update(folder, { agentName: 'developer', text: 'fixed the test', ts: Date.now() })
      const result = obs.serialize(folder)
      expect(result).toContain('developer:')
      expect(result).toContain('1 msgs')
    })
  })

  describe('reset', () => {
    it('clears context for folder', () => {
      obs.update(folder, { agentName: 'user', text: 'hello', ts: 1000 })
      obs.reset(folder)
      expect(obs.getContext(folder).messageCount).toBe(0)
    })
  })

  describe('folder isolation', () => {
    it('maintains separate contexts per folder', () => {
      obs.update('/folder-a', { agentName: 'user', text: 'test security', ts: 1000 })
      obs.update('/folder-b', { agentName: 'user', text: 'fix the design', ts: 1000 })

      expect(obs.getContext('/folder-a').recentTopics).toContain('security')
      expect(obs.getContext('/folder-a').recentTopics).not.toContain('design')

      expect(obs.getContext('/folder-b').recentTopics).toContain('design')
      expect(obs.getContext('/folder-b').recentTopics).not.toContain('security')
    })
  })
})
