import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings, ThemeMode } from '@shared/ipc/settings'
import type { SessionType } from '@shared/ipc/record'
import type { ModelListEntry } from '@shared/ipc/model'
import type { SummaryTemplate } from '@shared/ipc/summary'
import type { TemplateId } from '@shared/llm/templates'
import '../../styles/globals.css'
import './settings.css'

type NavId = 'general' | 'recording' | 'engine' | 'templates' | 'shortcuts' | 'privacy' | 'about'

const NAV_ITEMS: { id: NavId; glyph: string; enabled: boolean }[] = [
  { id: 'general', glyph: '⚙', enabled: true },
  { id: 'recording', glyph: '⏺', enabled: true },
  { id: 'engine', glyph: '⌁', enabled: true },
  { id: 'templates', glyph: '✦', enabled: true },
  { id: 'shortcuts', glyph: '⌘', enabled: true },
  { id: 'privacy', glyph: '◉', enabled: true },
  { id: 'about', glyph: 'ⓘ', enabled: true },
]

const APP_VERSION = 'v0.1.0' // 关于页展示用;真实版本注入留后续

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

const TEMPLATE_ICON: Record<TemplateId, string> = {
  meeting: 'users',
  note: 'pencil',
  'interview-as-interviewer': 'search',
  'interview-as-candidate': 'user',
  lecture: 'cap',
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

// T51 — 云端 LLM 配置表单(补 T38 占位)。base URL / API key / chat model + 自动摘要 + 测试连接。
function CloudForm(): React.JSX.Element {
  const { t } = useTranslation()
  const [cloud, setCloud] = useState<Settings['cloud'] | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [test, setTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'fail'; msg?: string }>({
    state: 'idle',
  })

  useEffect(() => {
    let cancelled = false
    window.lazyaudio.settings
      .get()
      .then((s) => {
        if (!cancelled) setCloud(s.cloud)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const persist = useCallback(
    (patch: {
      baseUrl?: string
      chatModel?: string
      transcribeModel?: string
      autoSummary?: boolean
    }) => {
      void window.lazyaudio.settings.set({ cloud: patch })
    },
    [],
  )

  const saveApiKey = useCallback(() => {
    const key = apiKeyInput.trim()
    if (!key) return
    void window.lazyaudio.settings.set({ cloud: { apiKey: key } }).then(() => {
      setApiKeyInput('')
      window.lazyaudio.settings.get().then((s) => setCloud(s.cloud))
    })
  }, [apiKeyInput])

  const onTest = useCallback(() => {
    setTest({ state: 'testing' })
    window.lazyaudio.summary
      .testConnection()
      .then((r) => setTest(r.ok ? { state: 'ok' } : { state: 'fail', msg: r.error ?? '' }))
      .catch((e) => setTest({ state: 'fail', msg: String(e) }))
  }, [])

  if (!cloud) return <div className="set-loading">{t('common:library.loading')}</div>
  const hasKey = !!cloud.apiKeyCipher

  return (
    <div>
      <h3 className="setting-group-title">{t('common:settingsPage.engine.sectionCloud')}</h3>
      <div className="setting-rows">
        <SetRow label={t('common:settingsPage.engine.baseUrl')}>
          <input
            className="text-input"
            value={cloud.baseUrl}
            placeholder="https://api.openai.com/v1"
            onChange={(e) => setCloud({ ...cloud, baseUrl: e.currentTarget.value })}
            onBlur={() => persist({ baseUrl: cloud.baseUrl })}
          />
        </SetRow>
        <SetRow label={t('common:settingsPage.engine.apiKey')}>
          <input
            className="text-input"
            type="password"
            value={apiKeyInput}
            placeholder={hasKey ? t('common:settingsPage.engine.apiKeySet') : 'sk-...'}
            onChange={(e) => setApiKeyInput(e.currentTarget.value)}
            onBlur={saveApiKey}
          />
        </SetRow>
        <SetRow label={t('common:settingsPage.engine.transcribeModel')}>
          <input
            className="text-input"
            value={cloud.transcribeModel}
            placeholder="whisper-1"
            onChange={(e) => setCloud({ ...cloud, transcribeModel: e.currentTarget.value })}
            onBlur={() => persist({ transcribeModel: cloud.transcribeModel })}
          />
        </SetRow>
        <SetRow label={t('common:settingsPage.engine.chatModel')}>
          <input
            className="text-input"
            value={cloud.chatModel}
            placeholder="gpt-4o-mini"
            onChange={(e) => setCloud({ ...cloud, chatModel: e.currentTarget.value })}
            onBlur={() => persist({ chatModel: cloud.chatModel })}
          />
        </SetRow>
        <SetRow label={t('common:settingsPage.engine.autoSummary')}>
          <Toggle
            on={cloud.autoSummary}
            onChange={(v) => {
              setCloud({ ...cloud, autoSummary: v })
              persist({ autoSummary: v })
            }}
            label={t('common:settingsPage.engine.autoSummary')}
          />
        </SetRow>
      </div>
      <div className="cloud-test">
        <button type="button" className="btn btn-secondary btn-compact" onClick={onTest}>
          {t('common:settingsPage.engine.testConnection')}
        </button>
        {test.state === 'testing' ? (
          <span className="cloud-test-msg">{t('common:settingsPage.engine.testing')}</span>
        ) : null}
        {test.state === 'ok' ? (
          <span className="cloud-test-msg ok">{t('common:settingsPage.engine.testOk')}</span>
        ) : null}
        {test.state === 'fail' ? (
          <span className="cloud-test-msg fail">
            {t('common:settingsPage.engine.testFail')} {test.msg}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function EngineTab(): React.JSX.Element {
  const { t } = useTranslation()
  // T53 — 本地/云端切换驱动 onboarding.privacyMode(转录路由信号)
  const [mode, setMode] = useState<'local' | 'cloud'>('local')
  const [models, setModels] = useState<ModelListEntry[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    window.lazyaudio.settings
      .get()
      .then((s) => {
        if (!cancelled) setMode(s.onboarding.privacyMode)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const onModeChange = useCallback((v: 'local' | 'cloud') => {
    setMode(v)
    void window.lazyaudio.settings.set({ onboarding: { privacyMode: v } })
  }, [])

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
        onChange={onModeChange}
        options={[
          { value: 'local', label: t('common:settingsPage.engine.modeLocal') },
          { value: 'cloud', label: t('common:settingsPage.engine.modeCloud') },
        ]}
      />

      {mode === 'cloud' ? (
        <CloudForm />
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

function TemplatesTab(): React.JSX.Element {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<SummaryTemplate[] | null>(null)
  const [selectedId, setSelectedId] = useState<TemplateId>('meeting')
  const [draftPrompt, setDraftPrompt] = useState('')
  const [draftSessions, setDraftSessions] = useState<SessionType[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const selected = templates?.find((tpl) => tpl.id === selectedId) ?? null
  const dirty =
    !!selected &&
    (draftPrompt !== selected.systemPrompt || !sameSessions(draftSessions, selected.sessionTypes))

  const load = useCallback(() => {
    window.lazyaudio.summary
      .listTemplates()
      .then((result) => {
        setTemplates(result.templates)
        const nextSelected =
          result.templates.find((tpl) => tpl.id === selectedId) ?? result.templates[0]
        if (nextSelected) {
          setSelectedId(nextSelected.id)
          setDraftPrompt(nextSelected.systemPrompt)
          setDraftSessions(nextSelected.sessionTypes)
        }
      })
      .catch((e) => setMessage(String(e)))
  }, [selectedId])

  useEffect(() => {
    load()
  }, [load])

  const selectTemplate = useCallback(
    (tpl: SummaryTemplate) => {
      if (dirty && !window.confirm(t('common:settingsPage.templates.confirmSwitch'))) return
      setSelectedId(tpl.id)
      setDraftPrompt(tpl.systemPrompt)
      setDraftSessions(tpl.sessionTypes)
      setMessage(null)
    },
    [dirty, t],
  )

  const toggleSession = useCallback((sessionType: SessionType) => {
    setDraftSessions((prev) => {
      if (prev.includes(sessionType)) {
        return prev.length > 1 ? prev.filter((s) => s !== sessionType) : prev
      }
      return [...prev, sessionType]
    })
  }, [])

  const save = useCallback(() => {
    if (!selected) return
    setSaving(true)
    setMessage(null)
    window.lazyaudio.summary
      .setTemplate({ id: selected.id, systemPrompt: draftPrompt, sessionTypes: draftSessions })
      .then((result) => {
        setTemplates((prev) =>
          prev ? prev.map((tpl) => (tpl.id === result.template.id ? result.template : tpl)) : prev,
        )
        setDraftPrompt(result.template.systemPrompt)
        setDraftSessions(result.template.sessionTypes)
        setMessage(t('common:settingsPage.templates.saved'))
      })
      .catch((e) => setMessage(String(e)))
      .finally(() => setSaving(false))
  }, [draftPrompt, draftSessions, selected, t])

  const reset = useCallback(() => {
    if (!selected) return
    if (!window.confirm(t('common:settingsPage.templates.confirmReset', { name: selected.name })))
      return
    setSaving(true)
    setMessage(null)
    window.lazyaudio.summary
      .resetTemplate(selected.id)
      .then((result) => {
        setTemplates((prev) =>
          prev ? prev.map((tpl) => (tpl.id === result.template.id ? result.template : tpl)) : prev,
        )
        setDraftPrompt(result.template.systemPrompt)
        setDraftSessions(result.template.sessionTypes)
        setMessage(t('common:settingsPage.templates.resetDone'))
      })
      .catch((e) => setMessage(String(e)))
      .finally(() => setSaving(false))
  }, [selected, t])

  return (
    <>
      <div className="set-page-head template-head">
        <div>
          <h2>{t('common:settingsPage.templates.title')}</h2>
          <div className="sub">{t('common:settingsPage.templates.subtitle')}</div>
        </div>
        <button type="button" className="btn-compact-ghost" disabled={!selected} onClick={reset}>
          {t('common:settingsPage.templates.resetDefault')}
        </button>
      </div>

      {templates === null ? (
        <div className="set-loading">{t('common:library.loading')}</div>
      ) : (
        <div className="template-editor">
          <aside className="template-list">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className={`template-nav-item${tpl.id === selectedId ? ' is-active' : ''}`}
                onClick={() => selectTemplate(tpl)}
              >
                <span className="template-icon">{TEMPLATE_ICON[tpl.id]}</span>
                <span className="template-nav-text">
                  <span>{tpl.name}</span>
                  <span>
                    {tpl.isCustomized
                      ? t('common:settingsPage.templates.customized')
                      : t('common:settingsPage.templates.default')}
                  </span>
                </span>
              </button>
            ))}
            <button type="button" className="template-new" disabled>
              {t('common:settingsPage.templates.newTemplate')}
            </button>
          </aside>

          <section className="template-detail">
            {selected ? (
              <>
                <div className="template-field">
                  <label>{t('common:settingsPage.templates.templateName')}</label>
                  <input className="text-input" value={selected.name} disabled />
                </div>
                <div className="template-field">
                  <label>{t('common:settingsPage.templates.applyTo')}</label>
                  <div className="session-chip-wrap">
                    {SESSION_TYPES.map((sessionType) => (
                      <button
                        key={sessionType}
                        type="button"
                        className={`session-chip${draftSessions.includes(sessionType) ? ' is-on' : ''}`}
                        onClick={() => toggleSession(sessionType)}
                      >
                        {t(`common:${SESSION_I18N_KEY[sessionType]}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="template-field grow">
                  <label>{t('common:settingsPage.templates.prompt')}</label>
                  <textarea
                    className="template-prompt"
                    value={draftPrompt}
                    onChange={(e) => setDraftPrompt(e.currentTarget.value)}
                    spellCheck={false}
                  />
                </div>
                <div className="template-actions">
                  {message ? <span className="template-msg">{message}</span> : <span />}
                  <button type="button" className="btn-compact-ghost danger" onClick={reset}>
                    {t('common:settingsPage.templates.resetPrompt')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-compact"
                    disabled={!dirty || saving}
                    onClick={save}
                  >
                    {saving
                      ? t('common:settingsPage.templates.saving')
                      : t('common:settingsPage.templates.save')}
                  </button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
    </>
  )
}

function sameSessions(a: SessionType[], b: SessionType[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((x) => set.has(x))
}

// ---- T57 录音 tab ----
const DEFAULT_DIR_DISPLAY = '~/Library/Application Support/LazyAudio/recordings/'

function RecordingTab({
  settings,
  patch,
}: {
  settings: Settings
  patch: (next: Partial<Settings['recording']>) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const r = settings.recording

  const pickDir = useCallback(() => {
    window.lazyaudio.settings
      .pickRecordingsDir()
      .then((res) => {
        if (!res.canceled && res.path) patch({ saveDir: res.path })
      })
      .catch((e) => console.warn('pickRecordingsDir failed', e))
  }, [patch])

  return (
    <>
      <div className="set-page-head">
        <h2>{t('common:settingsPage.recording.title')}</h2>
        <div className="sub">{t('common:settingsPage.recording.subtitle')}</div>
      </div>

      <h3 className="setting-group-title">{t('common:settingsPage.recording.sectionLocation')}</h3>
      <div className="setting-rows">
        <SetRow label={t('common:settingsPage.recording.saveDir')}>
          <div className="path-row">
            <input className="text-input" readOnly value={r.saveDir || DEFAULT_DIR_DISPLAY} />
            <button type="button" className="btn btn-secondary btn-compact" onClick={pickDir}>
              {t('common:settingsPage.recording.choose')}
            </button>
          </div>
        </SetRow>
        <SetRow label={t('common:settingsPage.recording.showInFinder')}>
          <button
            type="button"
            className="link-btn"
            onClick={() => void window.lazyaudio.settings.openRecordingsDir()}
          >
            {t('common:settingsPage.recording.openFinder')}
          </button>
        </SetRow>
        <SetRow label={t('common:settingsPage.recording.autoCleanup')}>
          <div className="inline-ctl">
            <Toggle
              on={r.autoCleanupEnabled}
              onChange={(v) => patch({ autoCleanupEnabled: v })}
              label={t('common:settingsPage.recording.autoCleanup')}
            />
            {r.autoCleanupEnabled ? (
              <input
                type="number"
                className="num-input"
                min={7}
                max={365}
                value={r.autoCleanupDays}
                onChange={(e) =>
                  patch({ autoCleanupDays: clampInt(e.currentTarget.value, 7, 365, 90) })
                }
              />
            ) : null}
            <span className="unit">{t('common:settingsPage.recording.days')}</span>
          </div>
        </SetRow>
      </div>

      <h3 className="setting-group-title">
        {t('common:settingsPage.recording.sectionFiles')}
        <span className="set-section-helper">
          {t('common:settingsPage.recording.pipelineNote')}
        </span>
      </h3>
      <div className="setting-rows">
        <SetRow label={t('common:settingsPage.recording.tracks')}>
          <Toggle
            on={r.generateTracks}
            // 分轨 / 混音不可同时关:关分轨时若混音也关则忽略
            onChange={(v) => {
              if (!v && !r.generateMixed) return
              patch({ generateTracks: v })
            }}
            label={t('common:settingsPage.recording.tracks')}
          />
        </SetRow>
        <SetRow label={t('common:settingsPage.recording.mixed')}>
          <Toggle
            on={r.generateMixed}
            onChange={(v) => {
              if (!v && !r.generateTracks) return
              patch({ generateMixed: v })
            }}
            label={t('common:settingsPage.recording.mixed')}
          />
        </SetRow>
        <SetRow
          label={t('common:settingsPage.recording.sampleRate')}
          helper={t('common:settingsPage.recording.sampleRateHelper')}
        >
          <SelectControl<string>
            value={String(r.wavSampleRate)}
            options={[
              { value: '16000', label: '16000 Hz' },
              { value: '24000', label: '24000 Hz' },
              { value: '48000', label: '48000 Hz' },
            ]}
            onChange={(v) => patch({ wavSampleRate: Number(v) as 16000 | 24000 | 48000 })}
          />
        </SetRow>
        <SetRow
          label={t('common:settingsPage.recording.nameFormat')}
          helper="{sessionType} {date} {time} {title}"
        >
          <input
            className="text-input"
            value={r.fileNameFormat}
            onChange={(e) => patch({ fileNameFormat: e.currentTarget.value })}
          />
        </SetRow>
      </div>

      <h3 className="setting-group-title">
        {t('common:settingsPage.recording.sectionBehavior')}
        <span className="set-section-helper">
          {t('common:settingsPage.recording.pipelineNote')}
        </span>
      </h3>
      <div className="setting-rows">
        <SetRow label={t('common:settingsPage.recording.autoTranscribe')}>
          <Toggle
            on={r.autoTranscribe}
            onChange={(v) => patch({ autoTranscribe: v })}
            label={t('common:settingsPage.recording.autoTranscribe')}
          />
        </SetRow>
        <SetRow label={t('common:settingsPage.recording.levelMeter')}>
          <Toggle
            on={r.showLevelMeter}
            onChange={(v) => patch({ showLevelMeter: v })}
            label={t('common:settingsPage.recording.levelMeter')}
          />
        </SetRow>
        <SetRow label={t('common:settingsPage.recording.silenceStop')}>
          <div className="inline-ctl">
            <Toggle
              on={r.silenceAutoStopEnabled}
              onChange={(v) => patch({ silenceAutoStopEnabled: v })}
              label={t('common:settingsPage.recording.silenceStop')}
            />
            {r.silenceAutoStopEnabled ? (
              <input
                type="number"
                className="num-input"
                min={30}
                max={600}
                value={r.silenceAutoStopSec}
                onChange={(e) =>
                  patch({ silenceAutoStopSec: clampInt(e.currentTarget.value, 30, 600, 60) })
                }
              />
            ) : null}
            <span className="unit">{t('common:settingsPage.recording.seconds')}</span>
          </div>
        </SetRow>
        <SetRow label={t('common:settingsPage.recording.minDuration')}>
          <div className="inline-ctl">
            <input
              type="number"
              className="num-input"
              min={0}
              max={10}
              value={r.minDurationSec}
              onChange={(e) => patch({ minDurationSec: clampInt(e.currentTarget.value, 0, 10, 2) })}
            />
            <span className="unit">{t('common:settingsPage.recording.seconds')}</span>
          </div>
        </SetRow>
      </div>
    </>
  )
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// ---- T57 隐私 tab ----
function PrivacyTab({ settings }: { settings: Settings }): React.JSX.Element {
  const { t } = useTranslation()
  // 「录音合规提示」开 = 录音前提示(complianceReminderHidden=false)
  const complianceOn = !settings.onboarding.complianceReminderHidden

  const danger = useCallback(
    (
      action: 'clear-recordings' | 'clear-models' | 'reset-app' | 'wipe-all',
      confirmKey: string,
    ) => {
      if (!window.confirm(t(`common:settingsPage.privacy.${confirmKey}`))) return
      if (!window.confirm(t('common:settingsPage.privacy.confirmAgain'))) return
      window.lazyaudio.settings
        .dangerAction(action)
        .then((r) => {
          if (r.ok) window.alert(t('common:settingsPage.privacy.done'))
          else if (r.error === 'recording-active')
            window.alert(t('common:settingsPage.privacy.activeError'))
          else window.alert(t('common:settingsPage.privacy.failed'))
        })
        .catch((e) => console.warn('dangerAction failed', e))
    },
    [t],
  )

  return (
    <>
      <div className="set-page-head">
        <h2>{t('common:settingsPage.privacy.title')}</h2>
        <div className="sub">{t('common:settingsPage.privacy.subtitle')}</div>
      </div>

      <h3 className="setting-group-title">{t('common:settingsPage.privacy.sectionData')}</h3>
      <div className="setting-rows">
        <SetRow label={t('common:settingsPage.privacy.dataLocation')}>
          <button
            type="button"
            className="link-btn"
            onClick={() => void window.lazyaudio.settings.openRecordingsDir()}
          >
            {t('common:settingsPage.recording.openFinder')}
          </button>
        </SetRow>
        <SetRow label={t('common:settingsPage.privacy.keyStorage')}>
          <span className="readonly-val">{t('common:settingsPage.privacy.keychain')}</span>
        </SetRow>
        <SetRow label={t('common:settingsPage.privacy.compliance')}>
          <Toggle
            on={complianceOn}
            onChange={(v) =>
              void window.lazyaudio.settings.set({
                onboarding: { complianceReminderHidden: !v },
              })
            }
            label={t('common:settingsPage.privacy.compliance')}
          />
        </SetRow>
      </div>

      <h3 className="setting-group-title">{t('common:settingsPage.privacy.sectionReport')}</h3>
      <div className="setting-rows">
        <SetRow
          label={t('common:settingsPage.privacy.crashReport')}
          helper={t('common:settingsPage.privacy.disabledHelper')}
        >
          <Toggle
            on={false}
            onChange={() => {}}
            label={t('common:settingsPage.privacy.crashReport')}
          />
        </SetRow>
        <SetRow
          label={t('common:settingsPage.privacy.usageStats')}
          helper={t('common:settingsPage.privacy.disabledHelper')}
        >
          <Toggle
            on={false}
            onChange={() => {}}
            label={t('common:settingsPage.privacy.usageStats')}
          />
        </SetRow>
      </div>

      <div className="danger-zone">
        <h3 className="danger-zone-title">{t('common:settingsPage.privacy.sectionDanger')}</h3>
        <div className="danger-rows">
          <button
            type="button"
            className="btn-danger-outline"
            onClick={() => danger('clear-recordings', 'confirmClearRecordings')}
          >
            {t('common:settingsPage.privacy.clearRecordings')}
          </button>
          <button
            type="button"
            className="btn-danger-outline"
            onClick={() => danger('clear-models', 'confirmClearModels')}
          >
            {t('common:settingsPage.privacy.clearModels')}
          </button>
          <button
            type="button"
            className="btn-danger-outline"
            onClick={() => danger('reset-app', 'confirmResetApp')}
          >
            {t('common:settingsPage.privacy.resetApp')}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => danger('wipe-all', 'confirmWipeAll')}
          >
            {t('common:settingsPage.privacy.wipeAll')}
          </button>
        </div>
      </div>
    </>
  )
}

// ---- T57 关于 tab ----
function AboutTab(): React.JSX.Element {
  const { t } = useTranslation()
  const open = (url: string): void => {
    void window.lazyaudio.system.openExternal(url)
  }
  const LICENSES = [
    'LazyAudio — MIT',
    'sherpa-onnx — Apache-2.0',
    'SenseVoice — MIT',
    'Silero VAD — MIT',
    'onnxruntime — MIT',
    'Electron — MIT',
    'lucide icons — ISC',
  ]
  return (
    <>
      <div className="set-page-head">
        <h2>{t('common:settingsPage.about.title')}</h2>
        <div className="sub">{t('common:settingsPage.about.subtitle')}</div>
      </div>

      <div className="about-version">
        <div className="about-logo">LA</div>
        <div className="about-name">LazyAudio</div>
        <div className="about-ver">{APP_VERSION}</div>
        <div className="about-links">
          <button
            type="button"
            className="link-btn"
            onClick={() => open('https://github.com/momaek/lazyaudio')}
          >
            {t('common:settingsPage.about.github')}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => open('https://github.com/momaek/lazyaudio/issues')}
          >
            {t('common:settingsPage.about.feedback')}
          </button>
        </div>
      </div>

      <h3 className="setting-group-title">{t('common:settingsPage.about.sectionUpdate')}</h3>
      <div className="setting-rows">
        <SetRow
          label={t('common:settingsPage.about.checkUpdate')}
          helper={t('common:settingsPage.about.updateDisabled')}
        >
          <button type="button" className="btn btn-secondary btn-compact" disabled>
            {t('common:settingsPage.about.checkUpdate')}
          </button>
        </SetRow>
      </div>

      <h3 className="setting-group-title">{t('common:settingsPage.about.sectionLicense')}</h3>
      <div className="about-licenses">
        {LICENSES.map((l) => (
          <div key={l} className="about-license-row">
            {l}
          </div>
        ))}
      </div>

      <h3 className="setting-group-title">{t('common:settingsPage.about.sectionCredits')}</h3>
      <p className="about-credits">{t('common:settingsPage.about.credits')}</p>
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

  const patchRecording = useCallback((next: Partial<Settings['recording']>) => {
    setSettings((prev) => (prev ? { ...prev, recording: { ...prev.recording, ...next } } : prev))
    void window.lazyaudio.settings.set({ recording: next })
  }, [])

  const content = useMemo(() => {
    if (!settings) return null
    if (nav === 'general') return <GeneralTab settings={settings} patch={patchGeneral} />
    if (nav === 'recording') return <RecordingTab settings={settings} patch={patchRecording} />
    if (nav === 'shortcuts') return <ShortcutsTab settings={settings} setShortcut={setShortcut} />
    if (nav === 'engine') return <EngineTab />
    if (nav === 'templates') return <TemplatesTab />
    if (nav === 'privacy') return <PrivacyTab settings={settings} />
    if (nav === 'about') return <AboutTab />
    return <ComingSoon navId={nav} />
  }, [nav, settings, patchGeneral, patchRecording, setShortcut])

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
