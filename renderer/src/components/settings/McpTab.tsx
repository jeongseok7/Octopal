import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plug, Plus } from 'lucide-react'
import { McpServerCard } from './McpServerCard'
import { McpServerEditModal } from '../modals/McpServerEditModal'

interface McpTabProps {
  servers: McpServersConfig
  onChange: (servers: McpServersConfig) => void
}

export function McpTab({ servers, onChange }: McpTabProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<{ name: string; cfg: McpServerConfig } | null>(null)
  const [creating, setCreating] = useState(false)

  const names = Object.keys(servers)

  const handleSave = (newName: string, cfg: McpServerConfig, originalName?: string) => {
    const next: McpServersConfig = { ...servers }
    if (originalName && originalName !== newName) {
      delete next[originalName]
    }
    next[newName] = cfg
    onChange(next)
    setEditing(null)
    setCreating(false)
  }

  const handleDelete = (name: string) => {
    if (!confirm(t('mcp.global.confirmDelete', { name }))) return
    const next: McpServersConfig = { ...servers }
    delete next[name]
    onChange(next)
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">
        <Plug size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
        {t('mcp.global.title')}
      </h3>
      <p className="settings-section-desc">{t('mcp.global.desc')}</p>

      {names.length === 0 ? (
        <p className="settings-section-desc" style={{ fontStyle: 'italic', opacity: 0.6 }}>
          {t('mcp.global.noServers')}
        </p>
      ) : (
        <div className="provider-card-grid">
          {names.map((name) => (
            <McpServerCard
              key={name}
              name={name}
              config={servers[name]}
              onEdit={() => setEditing({ name, cfg: servers[name] })}
              onDelete={() => handleDelete(name)}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className="provider-card-btn primary"
          onClick={() => setCreating(true)}
        >
          <Plus size={14} />
          {t('mcp.global.addServer')}
        </button>
      </div>

      {creating && (
        <McpServerEditModal
          reservedNames={names}
          onClose={() => setCreating(false)}
          onSave={(n, c) => handleSave(n, c)}
        />
      )}
      {editing && (
        <McpServerEditModal
          initialName={editing.name}
          initialConfig={editing.cfg}
          reservedNames={names.filter((n) => n !== editing.name)}
          onClose={() => setEditing(null)}
          onSave={(n, c) => handleSave(n, c, editing.name)}
        />
      )}
    </div>
  )
}
