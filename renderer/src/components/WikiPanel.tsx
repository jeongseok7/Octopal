import { useEffect, useState } from 'react'
import { FileText, Plus, Trash2, Save } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'

interface WikiPanelProps {
  workspaceId: string
}

export function WikiPanel({ workspaceId }: WikiPanelProps) {
  const [pages, setPages] = useState<WikiPage[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newPageName, setNewPageName] = useState<string | null>(null)

  const refreshPages = () => {
    window.api.wikiList(workspaceId).then((list) => {
      setPages(list)
      if (list.length > 0 && !selected) {
        setSelected(list[0].name)
      } else if (list.length === 0) {
        setSelected(null)
        setContent('')
      }
    })
  }

  useEffect(() => {
    refreshPages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  useEffect(() => {
    if (!selected) {
      setContent('')
      setDirty(false)
      return
    }
    window.api.wikiRead({ workspaceId: workspaceId, name: selected }).then((res) => {
      if (res.ok) {
        setContent(res.content)
        setDirty(false)
      }
    })
  }, [selected, workspaceId])

  // Poll for external changes (agents writing) every 3s
  useEffect(() => {
    const interval = setInterval(() => {
      if (!dirty) refreshPages()
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  const openCreatePage = () => {
    setNewPageName('')
  }

  const confirmCreatePage = async () => {
    const name = (newPageName || '').trim()
    if (!name) {
      setNewPageName(null)
      return
    }
    const res = await window.api.wikiWrite({
      workspaceId: workspaceId,
      name,
      content: `# ${name.replace(/\.md$/, '')}\n\n`,
    })
    setNewPageName(null)
    if (res.ok) {
      refreshPages()
      setSelected(res.name)
      setEditMode(true)
    } else {
      alert(res.error)
    }
  }

  const deletePage = async () => {
    if (!selected) return
    if (!confirm(`Delete ${selected}?`)) return
    await window.api.wikiDelete({ workspaceId: workspaceId, name: selected })
    setSelected(null)
    refreshPages()
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    const res = await window.api.wikiWrite({
      workspaceId: workspaceId,
      name: selected,
      content,
    })
    setSaving(false)
    if (res.ok) {
      setDirty(false)
    } else {
      alert(res.error)
    }
  }

  return (
    <div className="wiki-panel">
      <aside className="wiki-sidebar">
        <div className="wiki-sidebar-header drag">
          <span className="section-title">Wiki</span>
          <button className="wiki-new-btn" onClick={openCreatePage} title="New page">
            <Plus size={14} />
          </button>
        </div>
        <div className="wiki-page-list">
          {pages.length === 0 && (
            <div className="empty-agents">No pages yet</div>
          )}
          {pages.map((p) => (
            <button
              key={p.name}
              className={`wiki-page-item ${p.name === selected ? 'active' : ''}`}
              onClick={() => {
                if (dirty && !confirm('Discard unsaved changes?')) return
                setSelected(p.name)
                setEditMode(false)
              }}
            >
              <FileText size={12} />
              <span className="wiki-page-name">{p.name.replace(/\.md$/, '')}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="wiki-main">
        {!selected ? (
          <div className="empty">
            <div className="empty-title">Project wiki</div>
            <div className="empty-sub">
              Shared notes the whole team can read and write.
              <br />Create a page to get started.
            </div>
          </div>
        ) : (
          <>
            <header className="wiki-header">
              <div className="wiki-title">{selected.replace(/\.md$/, '')}</div>
              <div className="wiki-actions">
                <button
                  className="btn-secondary"
                  onClick={() => setEditMode((v) => !v)}
                >
                  {editMode ? 'Preview' : 'Edit'}
                </button>
                {editMode && dirty && (
                  <button className="btn-primary" onClick={save} disabled={saving}>
                    <Save size={12} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                )}
                <button className="btn-danger" onClick={deletePage}>
                  <Trash2 size={12} />
                </button>
              </div>
            </header>
            <div className="wiki-body">
              {editMode ? (
                <textarea
                  className="wiki-editor"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value)
                    setDirty(true)
                  }}
                  placeholder="Write in markdown…"
                />
              ) : (
                <div className="wiki-preview">
                  <MarkdownRenderer content={content || '_(empty)_'} />
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {newPageName !== null && (
        <div className="modal-backdrop" onClick={() => setNewPageName(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">New wiki page</div>
            <label className="modal-label">Name</label>
            <input
              className="modal-input"
              placeholder="goals, decisions, design-system…"
              value={newPageName}
              onChange={(e) => setNewPageName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreatePage()
                if (e.key === 'Escape') setNewPageName(null)
              }}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setNewPageName(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={confirmCreatePage}
                disabled={!newPageName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
