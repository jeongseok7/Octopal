import { useState } from 'react'
import { EmojiPicker } from '../EmojiPicker'
import { AlertTriangle } from 'lucide-react'

interface CreateAgentModalProps {
  folderPath: string
  onClose: () => void
  onCreated: () => void
}

export function CreateAgentModal({ folderPath, onClose, onCreated }: CreateAgentModalProps) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState('')
  const [fileWrite, setFileWrite] = useState(false)
  const [bash, setBash] = useState(false)
  const [network, setNetwork] = useState(false)
  const [allowPaths, setAllowPaths] = useState('')
  const [denyPaths, setDenyPaths] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState<number | null>(null)

  const create = async () => {
    setError(null)
    setLimitReached(null)
    const permissions: OctoPermissions = {
      fileWrite,
      bash,
      network,
      allowPaths: allowPaths
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      denyPaths: denyPaths
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    const res = await window.api.createOcto({
      folderPath,
      name,
      role,
      icon: icon || undefined,
      color: color || undefined,
      permissions,
    })
    if (res.ok) {
      onCreated()
    } else if (res.error.startsWith('AGENT_LIMIT:')) {
      const max = parseInt(res.error.split(':')[1], 10)
      setLimitReached(max)
    } else {
      setError(res.error)
    }
  }

  // Agent limit popup
  if (limitReached !== null) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <AlertTriangle size={36} style={{ color: 'var(--warning, #f0a030)' }} />
            <div className="modal-title" style={{ marginBottom: 0 }}>에이전트 제한</div>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              폴더당 최대 <strong>{limitReached}명</strong>의 에이전트만 생성할 수 있습니다.<br />
              기존 에이전트를 삭제한 후 다시 시도해주세요.
            </p>
          </div>
          <div className="modal-actions">
            <button className="btn-primary" onClick={onClose}>확인</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">New agent</div>

        <EmojiPicker
          value={icon}
          onChange={setIcon}
          name={name || '?'}
          color={color || undefined}
          onColorChange={setColor}
        />

        <label className="modal-label">Name</label>
        <input
          className="modal-input"
          placeholder="reviewer"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label className="modal-label">Role</label>
        <textarea
          className="modal-textarea"
          placeholder="Code reviewer, security focused"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />

        <label className="modal-label">Permissions</label>
        <div className="modal-hint" style={{ marginTop: 0 }}>
          Without any of these, the agent can only reply with text. Turn one on to let it act.
        </div>
        <div className="perm-row">
          <label className="perm-toggle">
            <input
              type="checkbox"
              checked={fileWrite}
              onChange={(e) => setFileWrite(e.target.checked)}
            />
            <span>Write / edit files</span>
          </label>
          <label className="perm-toggle">
            <input
              type="checkbox"
              checked={bash}
              onChange={(e) => setBash(e.target.checked)}
            />
            <span>Run shell commands</span>
          </label>
          <label className="perm-toggle">
            <input
              type="checkbox"
              checked={network}
              onChange={(e) => setNetwork(e.target.checked)}
            />
            <span>Access the network</span>
          </label>
        </div>

        <label className="modal-label">Allow paths (comma-separated globs)</label>
        <input
          className="modal-input"
          placeholder="src/**, tests/**"
          value={allowPaths}
          onChange={(e) => setAllowPaths(e.target.value)}
        />

        <label className="modal-label">Deny paths</label>
        <input
          className="modal-input"
          placeholder=".env, secrets/**"
          value={denyPaths}
          onChange={(e) => setDenyPaths(e.target.value)}
        />

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={create}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
