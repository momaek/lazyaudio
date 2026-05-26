import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LibraryEntry, LibraryGroup } from '@shared/ipc/library'
import type { SessionType } from '@shared/ipc/record'
import '../../styles/globals.css'
import './main.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; groups: LibraryGroup[]; total: number }
  | { kind: 'error'; message: string }

const SESSION_I18N_KEY: Record<SessionType, string> = {
  general: 'session.general',
  meeting: 'session.meeting',
  note: 'session.note',
  'interview-as-interviewer': 'session.interviewAsInterviewer',
  'interview-as-candidate': 'session.interviewAsCandidate',
  lecture: 'session.lecture',
  podcast: 'session.podcast',
}

const SESSION_UI_TYPE: Record<SessionType, string> = {
  general: 'general',
  meeting: 'meeting',
  note: 'note',
  'interview-as-interviewer': 'interviewer',
  'interview-as-candidate': 'candidate',
  lecture: 'lecture',
  podcast: 'podcast',
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function formatTimeOfDay(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function sourcePreview(entry: LibraryEntry): string {
  if (entry.status === 'recording') return '录制中'
  if (entry.status === 'failed-partial') return '录音中断，已保存部分音频'
  if (entry.mixStatus === 'running' || entry.mixStatus === 'pending') return '正在生成 mixed.wav'
  if (entry.mixStatus === 'failed') return '混音失败，分轨仍可用'
  return '等待转录'
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="m10.2 10.2 2.3 2.3M6.4 11a4.6 4.6 0 1 1 0-9.2 4.6 4.6 0 0 1 0 9.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ListItem({
  entry,
  selected,
  onSelect,
}: {
  entry: LibraryEntry
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`lib-item ${selected ? 'is-selected' : ''}`}
      data-type={SESSION_UI_TYPE[entry.sessionType]}
      onClick={onSelect}
    >
      <span className="lib-item-dot" />
      <div className="lib-item-title">
        <b>{entry.title}</b>
        <span className="timeofday">{formatTimeOfDay(entry.startedAt)}</span>
      </div>
      <div className="lib-item-dur">{formatDuration(entry.durationMs)}</div>
      <div className="lib-item-preview">{sourcePreview(entry)}</div>
    </button>
  )
}

function LibrarySidebar({
  groups,
  selectedId,
  onSelect,
}: {
  groups: LibraryGroup[]
  selectedId: string | null
  onSelect: (entry: LibraryEntry) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <aside className="lib">
      <div className="lib-window-drag-region" aria-hidden="true" />
      <button type="button" className="lib-tool-btn" title={t('common:settings')}>
        {t('common:library.settingsIcon')}
      </button>
      <div className="lib-search-row">
        <div className="search-input">
          <SearchIcon />
          <input placeholder={t('common:library.searchPlaceholder')} readOnly />
          <span className="search-kbd">{t('common:library.searchShortcut')}</span>
        </div>
      </div>
      <div className="chip-row">
        <button type="button" className="chip is-active">
          {t('common:library.all')}
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="lib-list-empty">
          <div>{t('common:library.emptyTitle')}</div>
          <div>{t('common:library.emptyHint')}</div>
        </div>
      ) : (
        <div className="lib-list">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="lib-group-head">{group.label}</div>
              {group.entries.map((entry) => (
                <ListItem
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === selectedId}
                  onSelect={() => onSelect(entry)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

function DetailPlaceholder({ entry }: { entry: LibraryEntry | null }): React.JSX.Element {
  const { t } = useTranslation()
  if (!entry) {
    return (
      <section className="detail empty-detail">
        <h2>{t('common:library.detailEmptyTitle')}</h2>
        <p>{t('common:library.detailEmptyHint')}</p>
      </section>
    )
  }

  return (
    <section className="detail">
      <header className="dh">
        <span className="dh-title">{entry.title}</span>
        <span className="type-badge" data-type={SESSION_UI_TYPE[entry.sessionType]}>
          {t(`common:${SESSION_I18N_KEY[entry.sessionType]}`)}
        </span>
        <span className="dh-meta">
          <span>{formatDuration(entry.durationMs)}</span>
          <span className="dot-sep" />
          <span>{sourcePreview(entry)}</span>
        </span>
      </header>
      <div className="detail-stage">
        <h2>{t('common:library.detailTitle')}</h2>
        <p>{t('common:library.detailHint')}</p>
      </div>
    </section>
  )
}

export function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.lazyaudio.library
      .list()
      .then((result) => {
        if (cancelled) return
        setState({ kind: 'ready', groups: result.groups, total: result.total })
        setSelectedId(result.groups[0]?.entries[0]?.id ?? null)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedEntry = useMemo(() => {
    if (state.kind !== 'ready' || !selectedId) return null
    for (const group of state.groups) {
      const entry = group.entries.find((item) => item.id === selectedId)
      if (entry) return entry
    }
    return null
  }, [selectedId, state])

  if (state.kind === 'loading') {
    return <main className="main-loading">{t('common:library.loading')}</main>
  }

  if (state.kind === 'error') {
    return (
      <main className="main-loading is-error">
        {t('errors:libraryListFailed', { message: state.message })}
      </main>
    )
  }

  return (
    <main className="main-window">
      <div className="mw-body">
        <LibrarySidebar
          groups={state.groups}
          selectedId={selectedId}
          onSelect={(entry) => setSelectedId(entry.id)}
        />
        <DetailPlaceholder entry={selectedEntry} />
      </div>
    </main>
  )
}
