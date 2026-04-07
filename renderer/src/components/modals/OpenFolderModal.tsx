import { useTranslation } from 'react-i18next'

interface OpenFolderModalProps {
  onPickFolder: () => void
}

export function OpenFolderModal({ onPickFolder }: OpenFolderModalProps) {
  const { t } = useTranslation()

  return (
    <div className="modal-backdrop modal-backdrop--blocking">
      <div className="modal open-folder-modal">
        <div className="welcome-desc" style={{ marginTop: 4 }}>
          {t('modals.openFolder.desc')}
        </div>
        <button className="btn-primary welcome-cta" onClick={onPickFolder}>
          {t('modals.openFolder.openFolder')}
        </button>
      </div>
    </div>
  )
}
