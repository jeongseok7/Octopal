import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Settings,
  Users,
  Palette,
  Keyboard,
  Info,
  ExternalLink,
  RotateCw,
  Globe,
} from 'lucide-react'

type SettingsTab = 'general' | 'agents' | 'appearance' | 'shortcuts' | 'about'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
]

export function SettingsPanel() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<SettingsTab>('general')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [versionInfo, setVersionInfo] = useState<{
    version: string
    electron: string
    node: string
  } | null>(null)

  const TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
    { id: 'general', label: t('settings.tabs.general'), icon: Settings },
    { id: 'agents', label: t('settings.tabs.agents'), icon: Users },
    { id: 'appearance', label: t('settings.tabs.appearance'), icon: Palette },
    { id: 'shortcuts', label: t('settings.tabs.shortcuts'), icon: Keyboard },
    { id: 'about', label: t('settings.tabs.about'), icon: Info },
  ]

  const SHORTCUTS = [
    { label: t('settings.shortcuts.sendMessage'), keys: ['Enter'] },
    { label: t('settings.shortcuts.newLine'), keys: ['Shift', 'Enter'] },
    { label: t('settings.shortcuts.mentionAgent'), keys: ['@'] },
    { label: t('settings.shortcuts.stopAllAgents'), keys: ['Esc'] },
  ]

  useEffect(() => {
    window.api.loadSettings().then(setSettings)
    window.api.getVersion().then(setVersionInfo)
  }, [])

  const update = <K extends keyof AppSettings>(
    section: K,
    patch: Partial<AppSettings[K]>
  ) => {
    if (!settings) return
    const updated = {
      ...settings,
      [section]: { ...settings[section], ...patch },
    }
    setSettings(updated)
    setDirty(true)
  }

  const updateNested = (
    section: 'agents',
    key: 'defaultPermissions',
    patch: Partial<AppSettings['agents']['defaultPermissions']>
  ) => {
    if (!settings) return
    const updated = {
      ...settings,
      agents: {
        ...settings.agents,
        defaultPermissions: { ...settings.agents.defaultPermissions, ...patch },
      },
    }
    setSettings(updated)
    setDirty(true)
  }

  const changeLanguage = async (lang: string) => {
    if (!settings) return
    i18n.changeLanguage(lang)
    const updated = {
      ...settings,
      general: { ...settings.general, language: lang },
    }
    setSettings(updated)
    await window.api.saveSettings(updated)
  }

  const save = async () => {
    if (!settings || !dirty) return
    setSaving(true)
    await window.api.saveSettings(settings)

    // Apply font size to document
    document.documentElement.style.setProperty(
      '--chat-font-size',
      `${settings.appearance.chatFontSize}px`
    )

    setSaving(false)
    setDirty(false)
  }

  if (!settings) {
    return (
      <div className="settings-panel">
        <div className="settings-loading">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="settings-panel">
      <div className="settings-sidebar">
        <h2 className="settings-title">{t('settings.title')}</h2>
        <nav className="settings-nav">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              className={`settings-nav-item ${tab === tb.id ? 'active' : ''}`}
              onClick={() => setTab(tb.id)}
            >
              <tb.icon size={16} />
              <span>{tb.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="settings-content">
        {tab === 'general' && (
          <div className="settings-section">
            <h3 className="settings-section-title">{t('settings.general.title')}</h3>

            <div className="settings-field">
              <span className="settings-toggle-info">
                <span className="settings-label">
                  <Globe size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                  {t('settings.language.title')}
                </span>
                <span className="settings-desc">{t('settings.language.desc')}</span>
              </span>
              <select
                className="settings-select"
                value={settings.general.language || 'en'}
                onChange={(e) => changeLanguage(e.target.value)}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="settings-toggle">
              <span className="settings-toggle-info">
                <span className="settings-label">{t('settings.general.restoreWorkspace')}</span>
                <span className="settings-desc">
                  {t('settings.general.restoreWorkspaceDesc')}
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.general.restoreLastWorkspace}
                onChange={(e) =>
                  update('general', { restoreLastWorkspace: e.target.checked })
                }
              />
              <span className="toggle-slider" />
            </label>

            <label className="settings-toggle">
              <span className="settings-toggle-info">
                <span className="settings-label">{t('settings.general.launchAtLogin')}</span>
                <span className="settings-desc">
                  {t('settings.general.launchAtLoginDesc')}
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.general.launchAtLogin}
                onChange={(e) =>
                  update('general', { launchAtLogin: e.target.checked })
                }
              />
              <span className="toggle-slider" />
            </label>
          </div>
        )}

        {tab === 'agents' && (
          <div className="settings-section">
            <h3 className="settings-section-title">{t('settings.agents.title')}</h3>
            <p className="settings-section-desc">
              {t('settings.agents.desc')}
            </p>

            <label className="settings-toggle">
              <span className="settings-toggle-info">
                <span className="settings-label">{t('settings.agents.fileWrite')}</span>
                <span className="settings-desc">
                  {t('settings.agents.fileWriteDesc')}
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.agents.defaultPermissions.fileWrite}
                onChange={(e) =>
                  updateNested('agents', 'defaultPermissions', {
                    fileWrite: e.target.checked,
                  })
                }
              />
              <span className="toggle-slider" />
            </label>

            <label className="settings-toggle">
              <span className="settings-toggle-info">
                <span className="settings-label">{t('settings.agents.shell')}</span>
                <span className="settings-desc">
                  {t('settings.agents.shellDesc')}
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.agents.defaultPermissions.bash}
                onChange={(e) =>
                  updateNested('agents', 'defaultPermissions', {
                    bash: e.target.checked,
                  })
                }
              />
              <span className="toggle-slider" />
            </label>

            <label className="settings-toggle">
              <span className="settings-toggle-info">
                <span className="settings-label">{t('settings.agents.network')}</span>
                <span className="settings-desc">
                  {t('settings.agents.networkDesc')}
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.agents.defaultPermissions.network}
                onChange={(e) =>
                  updateNested('agents', 'defaultPermissions', {
                    network: e.target.checked,
                  })
                }
              />
              <span className="toggle-slider" />
            </label>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="settings-section">
            <h3 className="settings-section-title">{t('settings.appearance.title')}</h3>

            <div className="settings-field">
              <span className="settings-label">{t('settings.appearance.theme')}</span>
              <div className="settings-theme-badge">{t('settings.appearance.themeDark')}</div>
              <span className="settings-desc">
                {t('settings.appearance.themeComingSoon')}
              </span>
            </div>

            <div className="settings-field">
              <span className="settings-label">{t('settings.appearance.chatFontSize')}</span>
              <div className="settings-slider-row">
                <span className="settings-slider-label">A</span>
                <input
                  type="range"
                  min={13}
                  max={18}
                  step={1}
                  value={settings.appearance.chatFontSize}
                  onChange={(e) =>
                    update('appearance', {
                      chatFontSize: Number(e.target.value),
                    })
                  }
                />
                <span className="settings-slider-label settings-slider-label--lg">A</span>
                <span className="settings-slider-value">
                  {settings.appearance.chatFontSize}px
                </span>
              </div>
            </div>
          </div>
        )}

        {tab === 'shortcuts' && (
          <div className="settings-section">
            <h3 className="settings-section-title">{t('settings.shortcuts.title')}</h3>
            <p className="settings-section-desc">
              {t('settings.shortcuts.comingSoon')}
            </p>

            <div className="settings-shortcut-list">
              {SHORTCUTS.map((s) => (
                <div key={s.label} className="settings-shortcut-row">
                  <span className="settings-shortcut-action">{s.label}</span>
                  <span className="settings-shortcut-keys">
                    {s.keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'about' && (
          <div className="settings-section">
            <h3 className="settings-section-title">{t('settings.about.title')}</h3>

            <div className="settings-about-logo">
              <span className="settings-about-emoji">🐙</span>
              <span className="settings-about-name">Octopal</span>
            </div>

            <div className="settings-about-info">
              <div className="settings-about-row">
                <span>{t('settings.about.version')}</span>
                <span>{versionInfo?.version || '...'}</span>
              </div>
              <div className="settings-about-row">
                <span>{t('settings.about.electron')}</span>
                <span>{versionInfo?.electron || '...'}</span>
              </div>
              <div className="settings-about-row">
                <span>{t('settings.about.node')}</span>
                <span>{versionInfo?.node || '...'}</span>
              </div>
            </div>

            <div className="settings-about-links">
              <button
                className="settings-about-link"
                onClick={() => {
                  window.open('https://github.com/gilhyun/Octopal', '_blank');
                }}
              >
                <ExternalLink size={14} />
                <span>{t('settings.about.github')}</span>
              </button>
              <button className="settings-about-link" disabled>
                <RotateCw size={14} />
                <span>{t('settings.about.checkUpdates')}</span>
              </button>
            </div>

            <p className="settings-about-copyright">
              {t('settings.about.copyright')}
            </p>
          </div>
        )}

        {dirty && (
          <div className="settings-save-bar">
            <span>{t('settings.unsavedChanges')}</span>
            <button
              className="settings-save-btn"
              onClick={save}
              disabled={saving}
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
