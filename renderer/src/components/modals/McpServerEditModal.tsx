import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'

type Transport = 'stdio' | 'http'

interface KvRow {
  key: string
  value: string
}

interface McpServerEditModalProps {
  /** Existing name when editing; empty when creating. */
  initialName?: string
  /** Existing config when editing; null when creating. */
  initialConfig?: McpServerConfig | null
  /** Other server names — used to flag duplicates when creating. */
  reservedNames: string[]
  onClose: () => void
  onSave: (name: string, config: McpServerConfig) => void
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/

function rowsFromRecord(rec?: Record<string, string>): KvRow[] {
  if (!rec) return []
  return Object.entries(rec).map(([key, value]) => ({ key, value }))
}

function recordFromRows(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    const k = r.key.trim()
    if (!k) continue
    out[k] = r.value
  }
  return out
}

export function McpServerEditModal({
  initialName,
  initialConfig,
  reservedNames,
  onClose,
  onSave,
}: McpServerEditModalProps) {
  const { t } = useTranslation()
  const isEdit = Boolean(initialName)

  const initialTransport: Transport = useMemo(() => {
    if (!initialConfig) return 'stdio'
    const ttype = 'type' in initialConfig && initialConfig.type ? initialConfig.type : 'stdio'
    return ttype === 'http' ? 'http' : 'stdio'
  }, [initialConfig])

  const [name, setName] = useState(initialName ?? '')
  const [transport, setTransport] = useState<Transport>(initialTransport)

  // stdio fields
  const initialStdio = (initialConfig && (!('type' in initialConfig) || initialConfig.type === 'stdio'))
    ? (initialConfig as McpStdioServer)
    : null
  const [command, setCommand] = useState(initialStdio?.command ?? '')
  const [argsText, setArgsText] = useState((initialStdio?.args ?? []).join('\n'))
  const [envRows, setEnvRows] = useState<KvRow[]>(rowsFromRecord(initialStdio?.env))

  // http fields
  const initialHttp = initialConfig && 'type' in initialConfig && initialConfig.type === 'http'
    ? (initialConfig as McpHttpServer)
    : null
  const [url, setUrl] = useState(initialHttp?.url ?? '')
  const [headerRows, setHeaderRows] = useState<KvRow[]>(rowsFromRecord(initialHttp?.headers))

  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('mcp.edit.errors.nameRequired'))
      return
    }
    if (!NAME_PATTERN.test(trimmed)) {
      setError(t('mcp.edit.errors.nameInvalid'))
      return
    }
    if (!isEdit && reservedNames.includes(trimmed)) {
      setError(t('mcp.edit.errors.nameInvalid'))
      return
    }

    let cfg: McpServerConfig
    if (transport === 'stdio') {
      const cmd = command.trim()
      if (!cmd) {
        setError(t('mcp.edit.errors.commandRequired'))
        return
      }
      const args = argsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      const env = recordFromRows(envRows)
      const stdio: McpStdioServer = { command: cmd }
      if (args.length) stdio.args = args
      if (Object.keys(env).length) stdio.env = env
      cfg = stdio
    } else {
      const u = url.trim()
      if (!u) {
        setError(t('mcp.edit.errors.urlRequired'))
        return
      }
      const headers = recordFromRows(headerRows)
      const http: McpHttpServer = { type: 'http', url: u }
      if (Object.keys(headers).length) http.headers = headers
      cfg = http
    }

    onSave(trimmed, cfg)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {isEdit ? t('mcp.edit.editTitle') : t('mcp.edit.newTitle')}
        </div>

        <label className="modal-label" style={{ marginTop: 0 }}>{t('mcp.edit.name')}</label>
        <input
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('mcp.edit.namePlaceholder')}
          disabled={isEdit}
          autoFocus={!isEdit}
        />
        <div className="modal-hint">{t('mcp.edit.nameHint')}</div>

        <label className="modal-label">{t('mcp.edit.transport')}</label>
        <div className="settings-segment" role="radiogroup">
          {(['stdio', 'http'] as const).map((value) => {
            const active = transport === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`settings-segment-option${active ? ' settings-segment-option--active' : ''}`}
                onClick={() => setTransport(value)}
              >
                {t(`mcp.global.transport.${value}`)}
              </button>
            )
          })}
        </div>

        {transport === 'stdio' ? (
          <>
            <label className="modal-label">{t('mcp.edit.command')}</label>
            <input
              className="modal-input"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t('mcp.edit.commandPlaceholder')}
              spellCheck={false}
            />

            <label className="modal-label">{t('mcp.edit.args')}</label>
            <textarea
              className="modal-textarea modal-textarea--mono"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              rows={4}
              spellCheck={false}
            />

            <label className="modal-label">{t('mcp.edit.env')}</label>
            <KvEditor
              rows={envRows}
              onChange={setEnvRows}
              keyPlaceholder={t('mcp.edit.envKeyPlaceholder')}
              valuePlaceholder={t('mcp.edit.envValuePlaceholder')}
              addLabel={t('mcp.edit.addEnv')}
            />
          </>
        ) : (
          <>
            <label className="modal-label">{t('mcp.edit.url')}</label>
            <input
              className="modal-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('mcp.edit.urlPlaceholder')}
              spellCheck={false}
            />

            <label className="modal-label">{t('mcp.edit.headers')}</label>
            <KvEditor
              rows={headerRows}
              onChange={setHeaderRows}
              keyPlaceholder={t('mcp.edit.headerKeyPlaceholder')}
              valuePlaceholder={t('mcp.edit.headerValuePlaceholder')}
              addLabel={t('mcp.edit.addHeader')}
            />
          </>
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <div style={{ flex: 1 }} />
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

interface KvEditorProps {
  rows: KvRow[]
  onChange: (rows: KvRow[]) => void
  keyPlaceholder: string
  valuePlaceholder: string
  addLabel: string
}

function KvEditor({ rows, onChange, keyPlaceholder, valuePlaceholder, addLabel }: KvEditorProps) {
  const update = (i: number, patch: Partial<KvRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  const remove = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i))
  }
  const add = () => {
    onChange([...rows, { key: '', value: '' }])
  }

  return (
    <div className="kv-editor">
      {rows.map((row, i) => (
        <div key={i} className="kv-editor-row">
          <input
            className="modal-input"
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
            placeholder={keyPlaceholder}
            spellCheck={false}
            style={{ flex: 1 }}
          />
          <input
            className="modal-input"
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder={valuePlaceholder}
            spellCheck={false}
            style={{ flex: 2 }}
          />
          <button
            type="button"
            className="provider-card-icon-btn"
            onClick={() => remove(i)}
            aria-label="remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="provider-card-btn" onClick={add}>
        <Plus size={14} />
        {addLabel}
      </button>
    </div>
  )
}
