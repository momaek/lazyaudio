import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings, ThemeMode } from '@shared/ipc/settings'
import type { SessionType } from '@shared/ipc/record'
import type { ModelListEntry } from '@shared/ipc/model'
import '../../styles/globals.css'
import './settings.css'

type NavId = 'general' | 'recording' | 'engine' | 'templates' | 'shortcuts' | 'privacy' | 'about'

const NAV_ITEMS: { id: NavId; glyph: string; enabled: boolean }[] = [
  { id: 'general', glyph: '⚙', enabled: true },
  { id: 'recording', glyph: '⏺', enabled: false },
  { id: 'engine', glyph: '⌁', enabled: true },
  { id: 'templates', glyph: '✦', enabled: false },
  { id: 'shortcuts', glyph: '⌘', enabled: true },
  { id: 'privacy', glyph: '◉', enabled: false },
  { id: 'about', glyph: 'ⓘ', enabled: false },
]

const SESSION_TYPES: SessionType[] = [
  'general',
  'meeting',
  'note',
  'interview-as-interviewer',
  'interview-as-candidate',
  'lecture',
  'podcast',
]

const SESSION_I18N_KEY: Record<SessionType, string> = {
  general: 'session.general',
  meeting: 'session.meeting',
  note: 'session.note',
  'interview-as-interviewer': 'session.interviewAsInterviewer',
  'interview-as-candidate': 'session.interviewAsCandidate',
  lecture: 'session.lecture',
  podcast: 'session.podcast',
}

function ChevronDown(): React.JSX.Element {
  return (
    <svg
      className="select-chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3 4.5 3 3 3-3" />
    </svg>
  )
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle${on ? ' is-on' : ''}`}
      onClick={() => onChange(!on)}
    />
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
}): React.JSX.Element {
  return (
    <div className="segmented narrow" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          className={`seg${opt.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function SelectControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className={`select-wrap${disabled ? ' is-disabled' : ''}`}>
      <select
        className="select-native"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value as T)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown />
    </div>
  )
}

function SetRow({
  label,
  helper,
  stack,
  children,
}: {
  label: string
  helper?: string
  stack?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="setting-row">
      <div className="row-lbl">
        <span>{label}</span>
        {helper ? <span className="helper">{helper}</span> : null}
      </div>
      <div className={`row-ctl${stack ? ' stack' : ''}`}>{children}</div>
    </div>
  )
}

// ---- 快捷键 accelerator <-> 显示/录入 ----
const MODIFIER_GLYPH: Record<string, string> = {
  CommandOrControl: '⌘',
  Command: '⌘',
  Cmd: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
}

function accelToChips(accel: string): string[] {
  return accel.split('+').map((part) => MODIFIER_GLYPH[part] ?? part)
}

/** keydown → Electron accelerator;无主键(只按修饰键)返回 null */
function eventToAccel(e: React.KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.metaKey) mods.push('Command')
  if (e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')

  const code = e.code
  let key: string | null = null
  if (code.startsWith('Key')) key = code.slice(3)
  else if (code.startsWith('Digit')) key = code.slice(5)
  else {
    const map: Record<string, string> = {
      Space: 'Space',
      Enter: 'Return',
      Comma: ',',
      Period: '.',
      Slash: '/',
      Backquote: '`',
    }
    key = map[code] ?? null
  }
  if (!key) return null // 只按了修饰键
  if (mods.length === 0) return null // 必须含至少一个修饰键
  return [...mods, key].join('+')
}

function GeneralTab({
  settings,
  patch,
}: {
  settings: Settings
  patch: (next: Partial<Settings['general']>) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const g = settings.general
  return (
    <>
      <div className="set-page-head">
        <h2>{t('common:settingsPage.general.title')}</h2>
        <div className="sub">{t('common:settingsPage.general.subtitle')}</div>
      </div>

      <div>
        <h3 className="setting-group-title">{t('common:settingsPage.general.sectionStartup')}</h3>
        <div className="setting-rows">
          <SetRow
            label={t('common:settingsPage.general.openAtLogin')}
            helper={t('common:settingsPage.general.openAtLoginHelper')}
          >
            <Toggle
              on={g.openAtLogin}
              onChange={(v) => patch({ openAtLogin: v })}
              label={t('common:settingsPage.general.openAtLogin')}
            />
          </SetRow>
          <SetRow label={t('common:settingsPage.general.closeBehavior')}>
            <SelectControl
              value={g.closeMainWindowBehavior}
              onChange={(v) => patch({ closeMainWindowBehavior: v })}
              options={[
                { value: 'minimize', label: t('common:settingsPage.general.closeMinimize') },
                { value: 'quit', label: t('common:settingsPage.general.closeQuit') },
              ]}
            />
          </SetRow>
          <SetRow
            label={t('common:settingsPage.general.showOnLaunch')}
            helper={t('common:settingsPage.general.showOnLaunchHelper')}
          >
            <Toggle
              on={g.showMainWindowOnLaunch}
              onChange={(v) => patch({ showMainWindowOnLaunch: v })}
              label={t('common:settingsPage.general.showOnLaunch')}
            />
          </SetRow>
          <SetRow label={t('common:settingsPage.general.trayClick')}>
            <SelectControl
              value={g.trayClickBehavior}
              onChange={(v) => patch({ trayClickBehavior: v })}
              options={[
                { value: 'menu', label: t('common:settingsPage.general.trayMenu') },
                { value: 'record', label: t('common:settingsPage.general.trayRecord') },
                { value: 'window', label: t('common:settingsPage.general.trayWindow') },
              ]}
            />
          </SetRow>
        </div>
      </div>

      <div>
        <h3 className="setting-group-title">
          {t('common:settingsPage.general.sectionAppearance')}
        </h3>
        <div className="setting-rows">
          <SetRow label={t('common:settingsPage.general.theme')}>
            <Segmented<ThemeMode>
              value={g.theme}
              onChange={(v) => patch({ theme: v })}
              options={[
                { value: 'light', label: t('common:settingsPage.theme.light') },
                { value: 'dark', label: t('common:settingsPage.theme.dark') },
                { value: 'system', label: t('common:settingsPage.theme.system') },
              ]}
            />
          </SetRow>
          <SetRow label={t('common:settingsPage.general.language')}>
            <SelectControl
              value={g.language}
              disabled
              onChange={() => {}}
              options={[{ value: 'zh-CN', label: t('common:settingsPage.general.languageZh') }]}
            />
          </SetRow>
          <SetRow label={t('common:settingsPage.general.listDensity')}>
            <Segmented
              value={g.listDensity}
              onChange={(v) => patch({ listDensity: v })}
              options={[
                { value: 'compact', label: t('common:settingsPage.density.compact') },
                { value: 'comfortable', label: t('common:settingsPage.density.comfortable') },
              ]}
            />
          </SetRow>
        </div>
      </div>

      <div>
        <h3 className="setting-group-title">{t('common:settingsPage.general.sectionDefaults')}</h3>
        <div className="setting-rows">
          <SetRow label={t('common:settingsPage.general.defaultSessionType')}>
            <SelectControl
              value={g.defaultSessionType}
              onChange={(v) => patch({ defaultSessionType: v })}
              options={[
                { value: 'last', label: t('common:settingsPage.defaultSession.last') },
                ...SESSION_TYPES.map((st) => ({
                  value: st,
                  label: t(`common:${SESSION_I18N_KEY[st]}`),
                })),
              ]}
            />
          </SetRow>
          <SetRow
            label={t('common:settingsPage.general.skipPrep')}
            helper={t('common:settingsPage.general.skipPrepHelper')}
          >
            <Toggle
              on={g.skipPrepPopover}
              onChange={(v) => patch({ skipPrepPopover: v })}
              label={t('common:settingsPage.general.skipPrep')}
            />
          </SetRow>
        </div>
      </div>
    </>
  )
}

function ShortcutsTab({
  settings,
  setShortcut,
}: {
  settings: Settings
  setShortcut: (accel: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [capturing, setCapturing] = useState(false)
  const chips = accelToChips(settings.shortcuts.toggleRecord)

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!capturing) return
      e.preventDefault()
      if (e.key === 'Escape') {
        setCapturing(false)
        return
      }
      const accel = eventToAccel(e)
      if (accel) {
        setShortcut(accel)
        setCapturing(false)
      }
    },
    [capturing, setShortcut],
  )

  return (
    <>
      <div className="set-page-head">
        <h2>{t('common:settingsPage.shortcuts.title')}</h2>
        <div className="sub">{t('common:settingsPage.shortcuts.subtitle')}</div>
      </div>

      <div>
        <h3 className="setting-group-title">{t('common:settingsPage.shortcuts.sectionGlobal')}</h3>
        <div className="short-table">
          <div className={`short-row${capturing ? ' is-capturing' : ''}`}>
            <div className="name">
              <span>{t('common:settingsPage.shortcuts.toggleRecord')}</span>
              <span className="sub">{t('common:settingsPage.shortcuts.toggleRecordSub')}</span>
            </div>
            <div
              className="keys"
              tabIndex={capturing ? 0 : -1}
              onKeyDown={onKeyDown}
              ref={(el) => {
                if (capturing && el) el.focus()
              }}
            >
              {capturing ? (
                <span className="capture-hint">{t('common:settingsPage.shortcuts.capturing')}</span>
              ) : (
                chips.map((k, i) => (
                  <span className="kkey" key={i}>
                    {k}
                  </span>
                ))
              )}
            </div>
            <button
              type="button"
              className="short-edit-link"
              onClick={() => setCapturing((c) => !c)}
            >
              {capturing
                ? t('common:settingsPage.shortcuts.cancel')
                : t('common:settingsPage.shortcuts.modify')}
            </button>
          </div>
        </div>
        <div className="short-hint">{t('common:settingsPage.shortcuts.hint')}</div>
        <div className="short-hint">{t('common:settingsPage.shortcuts.moreSoon')}</div>
      </div>
    </>
  )
}

// ---- 转录引擎 tab(T31:最小模型管理 = 列表 + 下载 + 删除)----
// 本地/云端切换、当前引擎大卡、高级 section、云端表单 留 T38。
function formatBytes(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} GB`
  return `${Math.round(n / 1_000_000)} MB`
}

function ModelCard({
  model,
  onDownload,
  onCancel,
  onDelete,
}: {
  model: ModelListEntry
  onDownload: () => void
  onCancel: () => void
  onDelete: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const downloaded = model.downloadedBytes ?? 0
  const pct =
    model.sizeBytes > 0 ? Math.min(100, Math.round((downloaded / model.sizeBytes) * 100)) : 0

  return (
    <div className={`model-card${model.isDefault ? ' is-default' : ''}`}>
      <div className="lang-chip">{model.lang}</div>
      <div className="info">
        <div className="name">
          {model.displayName}
          {model.isDefault ? (
            <span className="default-badge">{t('common:settingsPage.engine.default')}</span>
          ) : null}
        </div>
        <div className="desc">{model.description}</div>
      </div>

      {model.status === 'downloaded' ? (
        <div className="status is-done">
          <span>✓</span>
          <span>{t('common:settingsPage.engine.statusDownloaded')}</span>
        </div>
      ) : null}
      {model.status === 'available' ? (
        <div className="status is-avail">
          <span>↓</span>
          <span>{t('common:settingsPage.engine.statusAvailable')}</span>
        </div>
      ) : null}
      {model.status === 'downloading' ? (
        <div className="status is-downloading">
          <div className="pbar">
            <div className="fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="meta">
            <span>{pct}%</span>
            <span>{`${formatBytes(downloaded)} / ${formatBytes(model.sizeBytes)}`}</span>
          </div>
        </div>
      ) : null}

      <div className="right">
        <span className="size">{formatBytes(model.sizeBytes)}</span>
        <div className="actions">
          {model.status === 'downloaded' ? (
            <button type="button" className="btn-compact-ghost danger" onClick={onDelete}>
              {t('common:settingsPage.engine.delete')}
            </button>
          ) : null}
          {model.status === 'available' ? (
            <button type="button" className="btn-compact-ghost" onClick={onDownload}>
              {t('common:settingsPage.engine.download')}
            </button>
          ) : null}
          {model.status === 'downloading' ? (
            <button type="button" className="btn-compact-ghost danger" onClick={onCancel}>
              {t('common:settingsPage.engine.cancel')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function EngineTab(): React.JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'local' | 'cloud'>('local')
  const [models, setModels] = useState<ModelListEntry[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const refresh = useCallback(() => {
    window.lazyaudio.model
      .list()
      .then((r) => setModels(r.models))
      .catch(() => {
        /* 拿不到保持 loading */
      })
  }, [])

  useEffect(() => {
    refresh()
    const off = window.lazyaudio.model.onEvent((event) => {
      if (event.phase === 'start') {
        setErrors((prev) => {
          const next = { ...prev }
          delete next[event.modelKey]
          return next
        })
        setModels((prev) =>
          prev
            ? prev.map((m) =>
                m.key === event.modelKey ? { ...m, status: 'downloading', downloadedBytes: 0 } : m,
              )
            : prev,
        )
      } else if (event.phase === 'progress') {
        setModels((prev) =>
          prev
            ? prev.map((m) =>
                m.key === event.modelKey
                  ? { ...m, status: 'downloading', downloadedBytes: event.downloadedBytes }
                  : m,
              )
            : prev,
        )
      } else if (event.phase === 'error') {
        setErrors((prev) => ({ ...prev, [event.modelKey]: event.message }))
        refresh()
      } else if (event.phase === 'done' || event.phase === 'cancelled') {
        refresh()
      }
    })
    return () => off()
  }, [refresh])

  const onDownload = useCallback((key: string) => {
    void window.lazyaudio.model.download(key)
  }, [])
  const onCancel = useCallback((key: string) => {
    void window.lazyaudio.model.cancel(key)
  }, [])
  const onDelete = useCallback(
    (key: string) => {
      if (!window.confirm(t('common:settingsPage.engine.deleteConfirm'))) return
      void window.lazyaudio.model.delete(key).then(refresh)
    },
    [t, refresh],
  )

  return (
    <>
      <div className="set-page-head">
        <h2>{t('common:settingsPage.engine.title')}</h2>
        <div className="sub">{t('common:settingsPage.engine.subtitle')}</div>
      </div>

      <Segmented<'local' | 'cloud'>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'local', label: t('common:settingsPage.engine.modeLocal') },
          { value: 'cloud', label: t('common:settingsPage.engine.modeCloud') },
        ]}
      />

      {mode === 'cloud' ? (
        <div className="set-coming-soon">{t('common:settingsPage.engine.cloudSoon')}</div>
      ) : (
        <div>
          <h3 className="setting-group-title">
            {t('common:settingsPage.engine.sectionLocal')}
            <span className="set-section-helper">
              {t('common:settingsPage.engine.sectionLocalHelper')}
            </span>
          </h3>
          {models === null ? (
            <div className="set-loading">{t('common:settingsPage.engine.loading')}</div>
          ) : (
            <>
              <div className="model-list">
                {models.map((m) => (
                  <div key={m.key}>
                    <ModelCard
                      model={m}
                      onDownload={() => onDownload(m.key)}
                      onCancel={() => onCancel(m.key)}
                      onDelete={() => onDelete(m.key)}
                    />
                    {errors[m.key] ? (
                      <div className="model-error">
                        {t('common:settingsPage.engine.errorPrefix')}
                        {errors[m.key]}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="engine-space">
                {t('common:settingsPage.engine.spaceUsed', {
                  size: formatBytes(
                    models
                      .filter((m) => m.status === 'downloaded')
                      .reduce((sum, m) => sum + m.sizeBytes, 0),
                  ),
                })}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

function ComingSoon({ navId }: { navId: NavId }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      <div className="set-page-head">
        <h2>{t(`common:settingsPage.nav.${navId}`)}</h2>
        <div className="sub">{t('common:settingsPage.comingSoon')}</div>
      </div>
      <div className="set-coming-soon">{t('common:settingsPage.comingSoon')}</div>
    </>
  )
}

export function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [nav, setNav] = useState<NavId>('general')
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    let cancelled = false
    window.lazyaudio.settings
      .get()
      .then((s) => {
        if (!cancelled) setSettings(s)
      })
      .catch(() => {
        /* 拿不到就保持 loading */
      })
    const off = window.lazyaudio.settings.onChanged((s) => {
      if (!cancelled) setSettings(s)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  // 主题应用(T18 仅本窗口;全 app 主题 + 过渡是 T58)
  useEffect(() => {
    if (!settings) return
    const mode = settings.general.theme
    const root = document.documentElement
    const apply = (dark: boolean): void => {
      root.classList.toggle('dark', dark)
    }
    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      apply(mq.matches)
      const handler = (e: MediaQueryListEvent): void => apply(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    apply(mode === 'dark')
    return undefined
  }, [settings])

  const patchGeneral = useCallback((next: Partial<Settings['general']>) => {
    setSettings((prev) => (prev ? { ...prev, general: { ...prev.general, ...next } } : prev))
    void window.lazyaudio.settings.set({ general: next })
  }, [])

  const setShortcut = useCallback((accel: string) => {
    setSettings((prev) =>
      prev ? { ...prev, shortcuts: { ...prev.shortcuts, toggleRecord: accel } } : prev,
    )
    void window.lazyaudio.settings.set({ shortcuts: { toggleRecord: accel } })
  }, [])

  const content = useMemo(() => {
    if (!settings) return null
    if (nav === 'general') return <GeneralTab settings={settings} patch={patchGeneral} />
    if (nav === 'shortcuts') return <ShortcutsTab settings={settings} setShortcut={setShortcut} />
    if (nav === 'engine') return <EngineTab />
    return <ComingSoon navId={nav} />
  }, [nav, settings, patchGeneral, setShortcut])

  return (
    <div className="settings-window">
      <div className="drag-region" />
      <div className="settings-body">
        <nav className="set-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`set-nav-item${item.id === nav ? ' is-active' : ''}${
                item.enabled ? '' : ' is-disabled'
              }`}
              onClick={() => item.enabled && setNav(item.id)}
              disabled={!item.enabled}
            >
              <span className="glyph">{item.glyph}</span>
              <span>{t(`common:settingsPage.nav.${item.id}`)}</span>
            </button>
          ))}
        </nav>
        <div className="set-content">
          {settings ? content : <div className="set-loading">{t('common:library.loading')}</div>}
        </div>
      </div>
    </div>
  )
}
