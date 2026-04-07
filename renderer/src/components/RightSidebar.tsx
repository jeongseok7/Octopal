import { useTranslation } from 'react-i18next'
import { colorForName } from '../utils'
import { Zap, MoreHorizontal, Plus } from 'lucide-react'
import type { ActivityLogEntry } from '../types'
import { AgentAvatar } from './AgentAvatar'

interface RightSidebarProps {
  octos: OctoFile[]
  activeFolder: string | null
  activityLog: ActivityLogEntry[]
  setInput: (fn: (prev: string) => string) => void
  setEditingAgent: (agent: OctoFile) => void
  setShowCreateAgent: (v: boolean) => void
}

export function RightSidebar({
  octos,
  activeFolder,
  activityLog,
  setInput,
  setEditingAgent,
  setShowCreateAgent,
}: RightSidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="right-sidebar">
      <div className="sidebar-header drag">
        <span className="section-title">{t('agents.title')}</span>
        {activeFolder && (
          <button
            className="header-add-btn"
            onClick={() => setShowCreateAgent(true)}
            title={t('agents.addAgent')}
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className="agent-list">
        {octos.filter((r) => !r.hidden).length === 0 && (
          <div className="empty-agents">
            {activeFolder ? t('agents.noAgents') : t('agents.openFolderFirst')}
          </div>
        )}
        {octos.filter((r) => !r.hidden).map((r) => {
          const hasPerms =
            r.permissions &&
            (r.permissions.fileWrite === true ||
              r.permissions.bash === true ||
              r.permissions.network === true)
          return (
            <div
              key={r.path}
              className="agent-item"
              role="button"
              tabIndex={0}
              onClick={() =>
                setInput((i) => i + (i && !i.endsWith(' ') ? ' ' : '') + `@${r.name} `)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setInput((i) => i + (i && !i.endsWith(' ') ? ' ' : '') + `@${r.name} `)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setEditingAgent(r)
              }}
              title={t('agents.clickToMention')}
            >
              <AgentAvatar name={r.name} icon={r.icon} showOnlineDot />
              <div className="agent-info">
                <div className="agent-name">
                  {r.name}
                  {hasPerms && <span className="agent-badge" title={t('agents.canUseTools')}><Zap size={12} /></span>}
                </div>
                <div className="agent-role">{r.role || 'agent'}</div>
              </div>
              <button
                className="agent-edit-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingAgent(r)
                }}
                title={t('agents.editAgent')}
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
