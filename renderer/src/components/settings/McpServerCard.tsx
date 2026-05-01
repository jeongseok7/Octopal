import { useTranslation } from 'react-i18next'
import { Edit2, Trash2 } from 'lucide-react'

interface McpServerCardProps {
  name: string
  config: McpServerConfig
  onEdit: () => void
  onDelete: () => void
}

function transportOf(cfg: McpServerConfig): 'stdio' | 'http' | 'sse' {
  if ('type' in cfg && cfg.type) return cfg.type
  return 'stdio'
}

function transportSummary(cfg: McpServerConfig): string {
  const t = transportOf(cfg)
  if (t === 'stdio') {
    const stdio = cfg as McpStdioServer
    const args = stdio.args?.length ? ' ' + stdio.args.join(' ') : ''
    return `${stdio.command}${args}`
  }
  return (cfg as McpHttpServer | McpSseServer).url
}

export function McpServerCard({ name, config, onEdit, onDelete }: McpServerCardProps) {
  const { t } = useTranslation()
  const transport = transportOf(config)
  const summary = transportSummary(config)

  return (
    <div className="provider-card">
      <header className="provider-card-header">
        <span className="provider-card-name">{name}</span>
        <span
          className={`provider-card-status ${transport === 'http' ? 'active' : 'inactive'}`}
          aria-label={t(`mcp.global.transport.${transport}`)}
        >
          <span className="provider-card-status-dot" />
          {t(`mcp.global.transport.${transport}`)}
        </span>
      </header>

      <div className="provider-card-body">
        <label className="provider-card-label">
          {transport === 'stdio' ? t('mcp.edit.command') : t('mcp.edit.url')}
        </label>
        <div className="provider-card-input-row">
          <input
            type="text"
            className="provider-card-input"
            value={summary}
            readOnly
            spellCheck={false}
          />
        </div>

        <div className="provider-card-actions">
          <button
            type="button"
            className="provider-card-btn"
            onClick={onEdit}
            aria-label={t('mcp.global.editServer')}
          >
            <Edit2 size={14} />
            {t('mcp.global.editServer')}
          </button>
          <button
            type="button"
            className="provider-card-btn danger"
            onClick={onDelete}
            aria-label={t('mcp.global.deleteServer')}
          >
            <Trash2 size={14} />
            {t('mcp.global.deleteServer')}
          </button>
        </div>
      </div>
    </div>
  )
}
