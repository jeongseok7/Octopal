export const AGENT_COLORS = [
  '#C94466',  // Rose Red   (signature — wine accent)
  '#E8B4C4',  // Blush Pink (secondary — soft rose)
  '#5CB8A0',  // Sage Teal  (cool complement)
  '#B48A9E',  // Mauve      (warm muted rose)
  '#7BA3C9',  // Dusk Blue  (cool accent)
  '#D4836B',  // Coral      (warm sibling)
  '#9E8BAD',  // Lavender   (soft purple)
]

export function colorForName(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length]
}

export function basename(p: string) {
  return p.split('/').filter(Boolean).pop() || p
}
