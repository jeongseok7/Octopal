import { useEffect, useRef } from 'react'
import { AgentAvatar } from './AgentAvatar'

interface MentionPopupProps {
  filteredMentions: string[]
  pickMention: (name: string) => void
  octos: OctoFile[]
  selectedIndex: number
}

export function MentionPopup({ filteredMentions, pickMention, octos, selectedIndex }: MentionPopupProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Scroll selected item into view
  useEffect(() => {
    const el = itemRefs.current[selectedIndex]
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  return (
    <div className="mention-popup">
      {filteredMentions.map((name, i) => {
        const octo = octos.find(r => r.name === name)
        return (
          <button
            key={name}
            ref={(el) => { itemRefs.current[i] = el }}
            className={`mention-item${i === selectedIndex ? ' selected' : ''}`}
            onClick={() => pickMention(name)}
          >
            {name === 'all' ? (
              <div className="avatar sm" style={{ background: '#666' }}>A</div>
            ) : (
              <AgentAvatar name={name} icon={octo?.icon} size="sm" />
            )}
            <span>{name}</span>
          </button>
        )
      })}
    </div>
  )
}
