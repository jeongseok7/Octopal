import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface CreateWorkspaceModalProps {
  canCancel: boolean
  onClose: () => void
  onCreated: (name: string) => void
}

export function CreateWorkspaceModal({ canCancel, onClose, onCreated }: CreateWorkspaceModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  return (
    <div className="modal-backdrop" onClick={canCancel ? onClose : undefined}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!canCancel && (
          <div className="welcome-mascot">
            <img src="logo.png" alt="Octopal" className="welcome-mascot-img" />
          </div>
        )}
        <div className="modal-title" style={!canCancel ? { textAlign: 'center' } : undefined}>
          {canCancel ? t('modals.createWorkspace.title') : t('modals.createWorkspace.welcomeTitle')}
        </div>
        {!canCancel && (
          <div className="modal-hint" style={{ textAlign: 'center' }}>
            {t('modals.createWorkspace.hint')}
          </div>
        )}
        <label className="modal-label">{t('modals.createWorkspace.nameLabel')}</label>
        <input
          className="modal-input"
          placeholder={t('modals.createWorkspace.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onCreated(name)
          }}
          autoFocus
        />
        <div className="modal-actions">
          {canCancel && (
            <button className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
          )}
          <button
            className="btn-primary"
            disabled={!name.trim()}
            onClick={() => onCreated(name)}
          >
            {t('common.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
