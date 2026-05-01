import { useTranslation } from 'react-i18next'

type FontKind = 'ui' | 'chat' | 'code'

export interface FontOption {
  value: string
  label: string
  stack: string
}

export const UI_FONT_OPTIONS: FontOption[] = [
  { value: 'system', label: 'System Default', stack: '' },
  {
    value: 'system-ui',
    label: 'System Sans',
    stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  { value: 'outfit', label: 'Outfit', stack: '"Outfit", system-ui, sans-serif' },
  {
    value: 'pretendard',
    label: 'Pretendard',
    stack: '"Pretendard Variable", system-ui, sans-serif',
  },
  {
    value: 'helvetica',
    label: 'Helvetica Neue',
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  { value: 'georgia', label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
]

export const CHAT_FONT_OPTIONS: FontOption[] = UI_FONT_OPTIONS

export const CODE_FONT_OPTIONS: FontOption[] = [
  { value: 'system', label: 'System Default', stack: '' },
  {
    value: 'ui-monospace',
    label: 'UI Monospace',
    stack: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  { value: 'menlo', label: 'Menlo', stack: 'Menlo, monospace' },
  { value: 'consolas', label: 'Consolas', stack: 'Consolas, "Courier New", monospace' },
  {
    value: 'jetbrains',
    label: 'JetBrains Mono',
    stack: '"JetBrains Mono", ui-monospace, monospace',
  },
  { value: 'fira-code', label: 'Fira Code', stack: '"Fira Code", ui-monospace, monospace' },
]

export function optionsFor(kind: FontKind): FontOption[] {
  if (kind === 'code') return CODE_FONT_OPTIONS
  if (kind === 'chat') return CHAT_FONT_OPTIONS
  return UI_FONT_OPTIONS
}

export function stackFor(kind: FontKind, value: string): string {
  return optionsFor(kind).find((o) => o.value === value)?.stack ?? ''
}

interface Props {
  kind: FontKind
  value: string
  onChange: (next: string) => void
}

export function AppearanceFontSelector({ kind, value, onChange }: Props) {
  const { t } = useTranslation()
  const options = optionsFor(kind)
  const labelKey =
    kind === 'ui'
      ? 'settings.appearance.interfaceFont'
      : kind === 'chat'
        ? 'settings.appearance.chatFont'
        : 'settings.appearance.codeFont'
  const descKey = `${labelKey}Desc`
  const previewText =
    kind === 'code'
      ? t('settings.appearance.fontPreviewCode')
      : t('settings.appearance.fontPreview')
  const stack = stackFor(kind, value)

  return (
    <div className="settings-field">
      <span className="settings-toggle-info">
        <span className="settings-label">{t(labelKey)}</span>
        <span className="settings-desc">{t(descKey)}</span>
      </span>
      <select
        className="settings-select"
        aria-label={t(labelKey)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value === 'system' ? t('settings.appearance.fontSystemDefault') : o.label}
          </option>
        ))}
      </select>
      <div
        className="font-preview"
        style={stack ? { fontFamily: stack } : undefined}
      >
        {previewText}
      </div>
    </div>
  )
}
