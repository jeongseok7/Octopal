export type FontRole = 'ui' | 'chat' | 'code'

export interface FontOption {
  id: string
  labelKey: string
  stack: string
  roles: FontRole[]
}

export const FONT_CATALOG: FontOption[] = [
  // Sans-serif
  {
    id: 'system',
    labelKey: 'settings.appearance.fonts.system',
    stack: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    roles: ['ui', 'chat'],
  },
  {
    id: 'system-sans',
    labelKey: 'settings.appearance.fonts.systemSans',
    stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
    roles: ['ui', 'chat'],
  },
  {
    id: 'outfit',
    labelKey: 'settings.appearance.fonts.outfit',
    stack: `'Outfit', system-ui, sans-serif`,
    roles: ['ui', 'chat'],
  },
  {
    id: 'pretendard',
    labelKey: 'settings.appearance.fonts.pretendard',
    stack: `'Pretendard Variable', system-ui, sans-serif`,
    roles: ['ui', 'chat'],
  },
  {
    id: 'inter',
    labelKey: 'settings.appearance.fonts.inter',
    stack: `'Inter', system-ui, sans-serif`,
    roles: ['ui', 'chat'],
  },
  {
    id: 'helvetica',
    labelKey: 'settings.appearance.fonts.helvetica',
    stack: `'Helvetica Neue', Helvetica, Arial, sans-serif`,
    roles: ['ui', 'chat'],
  },
  {
    id: 'arial',
    labelKey: 'settings.appearance.fonts.arial',
    stack: `Arial, Helvetica, sans-serif`,
    roles: ['ui', 'chat'],
  },
  // Serif (chat only)
  {
    id: 'serif',
    labelKey: 'settings.appearance.fonts.serif',
    stack: `Georgia, 'Times New Roman', Times, serif`,
    roles: ['chat'],
  },
  // Monospace (code only)
  {
    id: 'sf-mono',
    labelKey: 'settings.appearance.fonts.sfMono',
    stack: `'SF Mono', 'Fira Code', 'Cascadia Code', monospace`,
    roles: ['code'],
  },
  {
    id: 'menlo',
    labelKey: 'settings.appearance.fonts.menlo',
    stack: `Menlo, Monaco, Consolas, monospace`,
    roles: ['code'],
  },
  {
    id: 'consolas',
    labelKey: 'settings.appearance.fonts.consolas',
    stack: `Consolas, 'Courier New', monospace`,
    roles: ['code'],
  },
  {
    id: 'jetbrains-mono',
    labelKey: 'settings.appearance.fonts.jetbrainsMono',
    stack: `'JetBrains Mono', 'Fira Code', monospace`,
    roles: ['code'],
  },
  {
    id: 'fira-code',
    labelKey: 'settings.appearance.fonts.firaCode',
    stack: `'Fira Code', 'SF Mono', monospace`,
    roles: ['code'],
  },
  {
    id: 'courier',
    labelKey: 'settings.appearance.fonts.courier',
    stack: `'Courier New', Courier, monospace`,
    roles: ['code'],
  },
]

export const INTERFACE_FONTS = FONT_CATALOG.filter((f) => f.roles.includes('ui'))
export const CHAT_FONTS = FONT_CATALOG.filter((f) => f.roles.includes('chat'))
export const CODE_FONTS = FONT_CATALOG.filter((f) => f.roles.includes('code'))

export const DEFAULT_FONTS = {
  interfaceFont: 'system',
  chatFont: 'system',
  codeBlockFont: 'sf-mono',
} as const

const DEFAULT_STACKS: Record<FontRole, string> = {
  ui: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  chat: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  code: `'SF Mono', 'Fira Code', 'Cascadia Code', monospace`,
}

export function getFontStack(id: string, role: FontRole): string {
  const opt = FONT_CATALOG.find((f) => f.id === id && f.roles.includes(role))
  const stack = opt ? opt.stack : DEFAULT_STACKS[role]
  if (role === 'ui' || role === 'chat') {
    return `${stack}, 'Tossface'`
  }
  return stack
}
