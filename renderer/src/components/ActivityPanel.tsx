import { FileEdit, FilePlus2, Terminal, Globe } from 'lucide-react'
import type { ActivityLogEntry } from '../types'
import { AgentAvatar } from './AgentAvatar'

interface ActivityPanelProps {
  activityLog: ActivityLogEntry[]
  octos: OctoFile[]
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 5_000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() || p
}

function toolIcon(tool: string) {
  if (tool === 'Write') return <FilePlus2 size={14} />
  if (tool === 'Edit') return <FileEdit size={14} />
  if (tool === 'Bash') return <Terminal size={14} />
  if (tool === 'WebFetch') return <Globe size={14} />
  return null
}

function toolLabel(tool: string): string {
  if (tool === 'Write') return 'Created'
  if (tool === 'Edit') return 'Edited'
  if (tool === 'Bash') return 'Ran'
  if (tool === 'WebFetch') return 'Fetched'
  return tool
}

export function ActivityPanel({ activityLog, octos }: ActivityPanelProps) {
  const entries = [...activityLog].reverse()

  return (
    <div className="activity-panel">
      <div className="activity-panel-header drag">
        <span className="section-title">Recent Activity</span>
        <span className="activity-panel-count">{entries.length}</span>
      </div>
      <div className="activity-panel-list">
        {entries.length === 0 ? (
          <div className="activity-panel-empty">No activity yet</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="activity-panel-entry" title={entry.target}>
              <AgentAvatar
                name={entry.agentName}
                icon={octos.find((r) => r.name === entry.agentName)?.icon}
                size="sm"
              />
              <div className="activity-panel-body">
                <div className="activity-panel-top">
                  <span className="activity-panel-agent">{entry.agentName}</span>
                  <span className="activity-panel-time">{relativeTime(entry.ts)}</span>
                </div>
                <div className="activity-panel-detail">
                  <span className={`activity-panel-tool-icon tool-${entry.tool.toLowerCase()}`}>{toolIcon(entry.tool)}</span>
                  <span className={`activity-panel-tool-label tool-${entry.tool.toLowerCase()}`}>{toolLabel(entry.tool)}</span>
                  <span className="activity-panel-target">{entry.target}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
