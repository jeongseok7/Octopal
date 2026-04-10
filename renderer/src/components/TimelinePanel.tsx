import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentAvatar } from './AgentAvatar'
import { ConfirmModal } from './ConfirmModal'
import { GitCommit, RotateCcw, ChevronDown, ChevronRight, Plus, Minus, Upload, FileText, Loader2 } from 'lucide-react'

interface CommitEntry {
  hash: string
  shortHash: string
  author: string
  email: string
  date: string
  message: string
  body: string
}

interface DiffEntry {
  file: string
  status: string
  additions: number
  deletions: number
  patch: string
}

interface TimelinePanelProps {
  activeFolder: string | null
  octos: OctoFile[]
}

const PER_PAGE = 30

function relativeTime(isoDate: string, t: (key: string, opts?: any) => string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return t('activity.justNow')
  if (sec < 60) return t('activity.secondsAgo', { n: sec })
  const min = Math.floor(sec / 60)
  if (min < 60) return t('activity.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('activity.hoursAgo', { n: hr })
  const day = Math.floor(hr / 24)
  return t('activity.daysAgo', { n: day })
}

function statusIcon(status: string) {
  switch (status) {
    case 'A': return <Plus size={12} className="diff-status-icon diff-status-added" />
    case 'D': return <Minus size={12} className="diff-status-icon diff-status-deleted" />
    default: return <FileText size={12} className="diff-status-icon diff-status-modified" />
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    default: return 'modified'
  }
}

export function TimelinePanel({ activeFolder, octos }: TimelinePanelProps) {
  const { t } = useTranslation()
  const [commits, setCommits] = useState<CommitEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [expandedHash, setExpandedHash] = useState<string | null>(null)
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([])
  const [diffLoading, setDiffLoading] = useState(false)
  const [revertingHash, setRevertingHash] = useState<string | null>(null)
  const [hasRemote, setHasRemote] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [confirmState, setConfirmState] = useState<{
    message: string
    commit: CommitEntry
    index: number
  } | null>(null)

  const loadHistory = useCallback(async (p: number, append = false) => {
    if (!activeFolder) return
    setLoading(true)
    try {
      const result = await window.api.gitGetHistory({
        folderPath: activeFolder,
        page: p,
        perPage: PER_PAGE,
      })
      if (result.ok) {
        setCommits((prev) => append ? [...prev, ...result.commits] : result.commits)
        setTotal(result.total)
      }
    } finally {
      setLoading(false)
    }
  }, [activeFolder])

  useEffect(() => {
    setCommits([])
    setTotal(0)
    setPage(1)
    setExpandedHash(null)
    loadHistory(1)
  }, [activeFolder, loadHistory])

  // Check remote availability
  useEffect(() => {
    if (!activeFolder) return
    window.api.gitHasRemote({ folderPath: activeFolder }).then((r) => {
      setHasRemote(r.ok && r.hasRemote)
    })
  }, [activeFolder])

  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    loadHistory(nextPage, true)
  }

  const handleToggleDiff = async (hash: string) => {
    if (expandedHash === hash) {
      setExpandedHash(null)
      setDiffEntries([])
      return
    }
    setExpandedHash(hash)
    setDiffLoading(true)
    try {
      const result = await window.api.gitGetDiff({
        folderPath: activeFolder!,
        hash,
      })
      setDiffEntries(result.ok ? result.entries : [])
    } finally {
      setDiffLoading(false)
    }
  }

  const handleRevert = (commit: CommitEntry, index: number) => {
    if (!activeFolder) return
    const isLatest = index === 0
    const msg = isLatest
      ? t('timeline.revertSingle')
      : t('timeline.revertConfirm', { count: index })
    setConfirmState({ message: msg, commit, index })
  }

  const executeRevert = async () => {
    if (!confirmState || !activeFolder) return
    const { commit, index } = confirmState
    setConfirmState(null)
    setRevertingHash(commit.hash)
    try {
      let result: any
      if (index === 0) {
        result = await window.api.gitRevert({ folderPath: activeFolder, hash: commit.hash })
      } else {
        // Revert range: from latest to this commit (inclusive)
        result = await window.api.gitRevert({
          folderPath: activeFolder,
          hash: commits[0].hash,
          toHash: commit.hash,
        })
      }

      if (result.conflict) {
        showToast(t('timeline.revertConflict'), 'err')
      } else if (result.ok) {
        showToast(t('timeline.reverted'), 'ok')
        // Reload history
        setPage(1)
        loadHistory(1)
      } else {
        showToast(t('timeline.revertFailed') + (result.error ? `: ${result.error}` : ''), 'err')
      }
    } finally {
      setRevertingHash(null)
    }
  }

  const handlePush = async () => {
    if (!activeFolder) return
    setPushing(true)
    try {
      const result = await window.api.gitPush({ folderPath: activeFolder })
      if (result.ok && result.pushed) {
        showToast(t('timeline.pushSuccess'), 'ok')
      } else {
        showToast(t('timeline.pushFailed') + (result.error ? `: ${result.error}` : ''), 'err')
      }
    } finally {
      setPushing(false)
    }
  }

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const findOcto = (authorName: string) =>
    octos.find((o) => o.name === authorName)

  const hasMore = commits.length < total

  if (!activeFolder) {
    return (
      <div className="timeline-panel">
        <div className="timeline-panel-header drag">
          <span className="section-title">{t('timeline.title')}</span>
        </div>
        <div className="timeline-panel-empty">{t('timeline.emptyDesc')}</div>
      </div>
    )
  }

  return (
    <div className="timeline-panel">
      {/* Confirm Modal */}
      {confirmState && (
        <ConfirmModal
          title={t('timeline.revert')}
          message={confirmState.message}
          confirmLabel={t('timeline.revert')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          onConfirm={executeRevert}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {/* Header */}
      <div className="timeline-panel-header drag">
        <div className="timeline-panel-header-left">
          <span className="section-title">{t('timeline.title')}</span>
          {total > 0 && <span className="timeline-panel-count">{total}</span>}
        </div>
        {hasRemote && (
          <button
            className="timeline-push-btn"
            onClick={handlePush}
            disabled={pushing}
            title={t('timeline.push')}
          >
            <Upload size={14} />
            {pushing ? <Loader2 size={12} className="spin" /> : t('timeline.pushLabel')}
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`timeline-toast timeline-toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* Commit List */}
      <div className="timeline-panel-list">
        {commits.length === 0 && !loading ? (
          <div className="timeline-panel-empty">
            <GitCommit size={32} className="timeline-empty-icon" />
            <p>{t('timeline.empty')}</p>
            <p className="timeline-empty-sub">{t('timeline.emptyDesc')}</p>
          </div>
        ) : (
          <>
            {commits.map((commit, idx) => {
              const octo = findOcto(commit.author)
              const isExpanded = expandedHash === commit.hash
              const isReverting = revertingHash === commit.hash
              return (
                <div key={commit.hash} className="timeline-node">
                  {/* Timeline connector */}
                  <div className="timeline-connector">
                    <div className="timeline-dot" />
                    {idx < commits.length - 1 && <div className="timeline-line" />}
                  </div>

                  {/* Commit content */}
                  <div className="timeline-content">
                    <div className="timeline-commit-header">
                      <AgentAvatar
                        name={commit.author}
                        icon={octo?.icon}
                        color={octo?.color}
                        size="sm"
                      />
                      <div className="timeline-commit-info">
                        <span className="timeline-commit-author">{commit.author}</span>
                        <span className="timeline-commit-time">
                          {relativeTime(commit.date, t)}
                        </span>
                      </div>
                      {/* Revert button (hover) */}
                      <button
                        className="timeline-revert-btn"
                        onClick={() => handleRevert(commit, idx)}
                        disabled={isReverting}
                        title={t('timeline.revert')}
                      >
                        <RotateCcw size={13} />
                        <span>{isReverting ? '...' : t('timeline.revert')}</span>
                      </button>
                    </div>

                    <div className="timeline-commit-message">{commit.message}</div>

                    {/* Expand diff */}
                    <button
                      className="timeline-diff-toggle"
                      onClick={() => handleToggleDiff(commit.hash)}
                    >
                      {isExpanded
                        ? <ChevronDown size={14} />
                        : <ChevronRight size={14} />}
                      <span>
                        {isExpanded ? t('timeline.hideDiff') : t('timeline.showDiff')}
                      </span>
                      <span className="timeline-commit-hash">{commit.shortHash}</span>
                    </button>

                    {/* Diff viewer */}
                    {isExpanded && (
                      <div className="timeline-diff-viewer">
                        {diffLoading ? (
                          <div className="timeline-diff-loading">
                            <Loader2 size={14} className="spin" />
                          </div>
                        ) : diffEntries.length === 0 ? (
                          <div className="timeline-diff-empty">{t('timeline.noChanges')}</div>
                        ) : (
                          diffEntries.map((entry) => (
                            <div key={entry.file} className="timeline-diff-file">
                              <div className="timeline-diff-file-header">
                                {statusIcon(entry.status)}
                                <span className="timeline-diff-filename">{entry.file}</span>
                                <span className={`timeline-diff-stat-label ${entry.status === 'D' ? 'deleted' : ''}`}>
                                  {statusLabel(entry.status)}
                                </span>
                                {entry.additions > 0 && (
                                  <span className="timeline-diff-stat timeline-diff-add">
                                    +{entry.additions}
                                  </span>
                                )}
                                {entry.deletions > 0 && (
                                  <span className="timeline-diff-stat timeline-diff-del">
                                    -{entry.deletions}
                                  </span>
                                )}
                              </div>
                              {entry.patch && (
                                <pre className="timeline-diff-patch">{
                                  entry.patch
                                    .split('\n')
                                    .slice(0, 50) // limit visible lines
                                    .map((line, i) => {
                                      const cls = line.startsWith('+') ? 'diff-add'
                                        : line.startsWith('-') ? 'diff-del'
                                        : undefined
                                      return (
                                        <span key={i} className={cls}>
                                          {line}
                                          {'\n'}
                                        </span>
                                      )
                                    })
                                }</pre>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Load more */}
            {hasMore && (
              <button
                className="timeline-load-more"
                onClick={handleLoadMore}
                disabled={loading}
              >
                {loading ? '...' : t('timeline.loadMore')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
