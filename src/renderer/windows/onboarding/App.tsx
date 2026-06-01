import '../../styles/globals.css'
import './onboarding.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { MicStatus } from '@shared/ipc/permission'
import type { ModelEvent, ModelListEntry } from '@shared/ipc/model'
import type { OnboardingStep, PlatformSupport, PrivacyMode } from '@shared/ipc/onboarding'

const STEPS: OnboardingStep[] = [
  'welcome',
  'privacy',
  'permission',
  'model-download',
  'shortcut',
  'compliance',
  'done',
]

const STEP_INDEX: Record<OnboardingStep, number> = {
  'version-check': -1,
  welcome: 0,
  privacy: 1,
  permission: 2,
  'model-download': 3,
  'api-config': 3,
  shortcut: 4,
  compliance: 5,
  done: 6,
}

function formatBytes(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} GB`
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} MB`
  return `${Math.round(n / 1_000)} KB`
}

function accelToChips(accel: string): string[] {
  const map: Record<string, string> = {
    CommandOrControl: navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl',
    Command: '⌘',
    Cmd: '⌘',
    Control: 'Ctrl',
    Ctrl: 'Ctrl',
    Shift: '⇧',
    Alt: 'Alt',
    Option: '⌥',
  }
  return accel.split('+').map((part) => map[part] ?? part)
}

function AppIcon({ size = 96 }: { size?: number }): React.JSX.Element {
  return (
    <div className="ob-app-icon" style={{ width: size, height: size }} aria-hidden>
      <span style={{ height: '38%' }} />
      <span style={{ height: '76%' }} />
      <span style={{ height: '52%' }} />
      <span style={{ height: '88%' }} />
      <span style={{ height: '46%' }} />
    </div>
  )
}

function StepLabel({ step }: { step: OnboardingStep }): React.JSX.Element {
  return <div className="ob-step-label">步骤 {STEP_INDEX[step] + 1} / 7</div>
}

function Shell({
  step,
  canBack,
  canNext,
  nextLabel,
  onBack,
  onNext,
  children,
}: {
  step: OnboardingStep
  canBack: boolean
  canNext: boolean
  nextLabel: string
  onBack: () => void
  onNext: () => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="ob-window">
      <div className="ob-drag" />
      <div className="ob-content">
        <StepLabel step={step} />
        {children}
      </div>
      <footer className="ob-footer">
        {canBack ? (
          <button type="button" className="ob-back" onClick={onBack}>
            ← 上一步
          </button>
        ) : (
          <span />
        )}
        <span className="ob-footer-step">步骤 {STEP_INDEX[step] + 1} / 7</span>
        <button type="button" className="ob-primary" disabled={!canNext} onClick={onNext}>
          {nextLabel}
        </button>
      </footer>
    </div>
  )
}

function VersionGate({ platform }: { platform: PlatformSupport }): React.JSX.Element {
  return (
    <div className="ob-window version-gate">
      <div className="ob-drag" />
      <div className="gate-body">
        <div className="gate-icon" aria-hidden>
          <svg
            width="42"
            height="42"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4M8 8l8 5M16 8l-8 5" />
          </svg>
        </div>
        <h1>{platform.title}</h1>
        <p>{platform.detail}</p>
        <div className="gate-detected">当前系统：{platform.detected}</div>
        <div className="gate-actions">
          {platform.primaryLabel ? (
            <button
              type="button"
              className="ob-primary"
              onClick={() => void window.lazyaudio.onboarding.openSystemUpdate()}
            >
              {platform.primaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="ob-secondary"
            onClick={() => void window.lazyaudio.onboarding.quit()}
          >
            退出 LazyAudio
          </button>
        </div>
        <button
          type="button"
          className="ob-link"
          onClick={() => void window.lazyaudio.onboarding.quit()}
        >
          了解为什么需要 macOS 14.2+ / Windows 10 2004+ ↗
        </button>
      </div>
    </div>
  )
}

function Welcome(): React.JSX.Element {
  return (
    <div className="screen centered">
      <AppIcon />
      <h1>LazyAudio</h1>
      <p className="lead">录下你电脑的声音 — 转成可搜索的文字 — 让 LLM 提炼要点</p>
      <p className="muted">本地优先 · macOS 14.2+ / Windows 10+ · 开源</p>
    </div>
  )
}

function Privacy({
  mode,
  setMode,
}: {
  mode: PrivacyMode
  setMode: (m: PrivacyMode) => void
}): React.JSX.Element {
  return (
    <div className="screen">
      <h1>选择隐私模式</h1>
      <p className="lead">你的录音和转录数据如何处理 — 可以随时在设置里切换。</p>
      <div className="privacy-grid">
        <button
          type="button"
          className={`choice-card${mode === 'local' ? ' selected' : ''}`}
          onClick={() => setMode('local')}
        >
          <div className="card-title">
            <span className="glyph">□</span>本地 <span className="tag">推荐</span>
          </div>
          <p>所有音频和转录留在你的机器上，离线可用。首次需下载约 238 MB SenseVoice 模型和 VAD。</p>
        </button>
        <button
          type="button"
          className={`choice-card${mode === 'cloud' ? ' selected' : ''}`}
          onClick={() => setMode('cloud')}
        >
          <div className="card-title">
            <span className="glyph">☁</span>云端 API
          </div>
          <p>用你的 OpenAI 兼容 API 转录，本机不存模型。速度依赖网络，需要 baseUrl 和 API key。</p>
          <span className="hint">需联网</span>
        </button>
      </div>
    </div>
  )
}

function PermissionScreen({
  micStatus,
  setStatus,
  refreshMic,
}: {
  micStatus: MicStatus
  setStatus: (status: MicStatus) => void
  refreshMic: () => void
}): React.JSX.Element {
  const request = useCallback(() => {
    void window.lazyaudio.permission.requestMic().then((r) => setStatus(r.status))
  }, [setStatus])
  const openSettings = useCallback(() => {
    void window.lazyaudio.permission.openMicSettings().then(refreshMic)
  }, [refreshMic])

  const granted = micStatus === 'granted'
  const denied = micStatus === 'denied' || micStatus === 'restricted'
  const label = granted ? '已授权' : denied ? '已拒绝' : micStatus === 'unknown' ? '未知' : '待授权'

  return (
    <div className="screen">
      <h1>授权麦克风权限</h1>
      <p className="lead">
        LazyAudio 需要访问你的麦克风以录制音频。系统音通过 CoreAudio Tap 抓取，不需要屏幕录制权限。
      </p>
      <div className="permission-card">
        <div className="perm-icon">mic</div>
        <div className="perm-main">
          <strong>麦克风</strong>
          <span>录制你说话的声音。会议、面试、笔记都需要这个权限。</span>
          <span className={`status-dot ${granted ? 'ok' : denied ? 'bad' : 'warn'}`}>{label}</span>
        </div>
        {granted ? <span className="check">✓</span> : null}
        {!granted && !denied ? (
          <button type="button" className="ob-primary small" onClick={request}>
            授权
          </button>
        ) : null}
        {denied ? (
          <button type="button" className="ob-secondary" onClick={openSettings}>
            打开系统设置
          </button>
        ) : null}
      </div>
      <div className="info-bar">若错过授权，可在「系统设置 → 隐私 → 麦克风」里手动开启。</div>
    </div>
  )
}

function ModelDownload({
  models,
  events,
}: {
  models: ModelListEntry[]
  events: Record<string, ModelEvent>
}): React.JSX.Element {
  const defaults = models.filter((m) => m.isDefault)
  const startAll = useCallback(() => {
    for (const model of defaults.filter((m) => m.status === 'available')) {
      void window.lazyaudio.model.download(model.key)
    }
  }, [defaults])

  return (
    <div className="screen">
      <h1>下载本地转录模型</h1>
      <p className="lead">首次需要下载约 238 MB。下载完成后所有转录都在本机进行。</p>
      <div className="model-list-ob">
        {defaults.length === 0 ? <div className="info-bar">模型列表加载中…</div> : null}
        {defaults.map((model) => {
          const event = events[model.key]
          const downloaded =
            event?.phase === 'progress'
              ? event.downloadedBytes
              : (model.downloadedBytes ?? (model.status === 'downloaded' ? model.sizeBytes : 0))
          const pct =
            model.sizeBytes > 0
              ? Math.min(100, Math.round((downloaded / model.sizeBytes) * 100))
              : 0
          return (
            <div className="model-ob-card" key={model.key}>
              <div className="model-head">
                <strong>{model.displayName}</strong>
                <span>{formatBytes(model.sizeBytes)}</span>
              </div>
              <div className="model-sub">{model.description}</div>
              <div className="progress">
                <span style={{ width: `${model.status === 'downloaded' ? 100 : pct}%` }} />
              </div>
              <div className="model-meta">
                <span>
                  {model.status === 'downloaded'
                    ? '✓ 下载完成'
                    : model.status === 'downloading'
                      ? `${pct}%`
                      : '准备下载…'}
                </span>
                <span>
                  {formatBytes(downloaded)} / {formatBytes(model.sizeBytes)}
                </span>
                {event?.phase === 'progress' ? (
                  <span>{formatBytes(event.bytesPerSec)}/s</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      <div className="row-actions">
        <button type="button" className="ob-primary" onClick={startAll}>
          开始下载
        </button>
        <span className="ob-muted">从默认镜像下载，可在设置中继续管理。</span>
      </div>
    </div>
  )
}

function ApiConfig({
  cloudOk,
  setCloudOk,
  form,
  setForm,
}: {
  cloudOk: boolean
  setCloudOk: (ok: boolean) => void
  form: { baseUrl: string; chatModel: string; apiKey: string }
  setForm: Dispatch<SetStateAction<{ baseUrl: string; chatModel: string; apiKey: string }>>
}): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState(form.baseUrl)
  const [apiKey, setApiKey] = useState(form.apiKey)
  const [model, setModel] = useState(form.chatModel)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')

  const save = useCallback(() => {
    const next = { baseUrl, chatModel: model, apiKey }
    setForm(next)
    return next
  }, [apiKey, baseUrl, model, setForm])

  const test = useCallback(() => {
    const next = save()
    setTesting(true)
    setMessage('')
    window.lazyaudio.settings
      .set({ cloud: { baseUrl: next.baseUrl, chatModel: next.chatModel, apiKey: next.apiKey } })
      .then(() => window.lazyaudio.summary.testConnection())
      .then((r) => {
        setCloudOk(r.ok)
        setMessage(r.ok ? '连接成功' : (r.error ?? '连接失败'))
      })
      .catch((e) => {
        setCloudOk(false)
        setMessage(String(e))
      })
      .finally(() => {
        setForm(next)
        setTesting(false)
      })
  }, [save, setCloudOk, setForm])

  return (
    <div className="screen">
      <h1>配置 OpenAI 兼容 API</h1>
      <p className="lead">
        LazyAudio 支持任意 OpenAI 兼容的转录 / chat API。API key 会用系统 keychain 加密存储。
      </p>
      <div className="form-card">
        <label>
          Base URL
          <input
            value={baseUrl}
            placeholder="https://api.openai.com/v1"
            onChange={(e) => {
              setBaseUrl(e.currentTarget.value)
              setCloudOk(false)
            }}
            onBlur={save}
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={apiKey}
            placeholder="sk-..."
            onChange={(e) => {
              setApiKey(e.currentTarget.value)
              setCloudOk(false)
            }}
            onBlur={save}
          />
        </label>
        <label>
          Chat 模型
          <input
            value={model}
            placeholder="gpt-4o-mini"
            onChange={(e) => {
              setModel(e.currentTarget.value)
              setCloudOk(false)
            }}
            onBlur={save}
          />
        </label>
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="ob-secondary"
          disabled={testing || !baseUrl || !apiKey || !model}
          onClick={test}
        >
          {testing ? '测试中…' : '测试连接'}
        </button>
        {message ? <span className={cloudOk ? 'msg-ok' : 'msg-bad'}>{message}</span> : null}
      </div>
    </div>
  )
}

function Shortcut({ accel }: { accel: string }): React.JSX.Element {
  return (
    <div className="screen centered">
      <div className="keycap-row">
        {accelToChips(accel).map((k) => (
          <span className="keycap" key={k}>
            {k}
          </span>
        ))}
      </div>
      <h1>确认快捷键</h1>
      <p className="lead">
        全局快捷键让你不切回 LazyAudio 也能开始录音。可随时在「设置 → 快捷键」修改。
      </p>
      <div className="shortcut-list">
        <div>
          <strong>开始 / 停止录音</strong>
          <span>{accelToChips(accel).join(' + ')}</span>
        </div>
        <div>
          <strong>暂停 / 继续</strong>
          <span>
            {navigator.platform.toLowerCase().includes('mac') ? '⌘ + ⇧ + P' : 'Ctrl + ⇧ + P'}
          </span>
        </div>
        <div>
          <strong>显示主窗口</strong>
          <span>{navigator.platform.toLowerCase().includes('mac') ? '⌘ + 1' : 'Ctrl + 1'}</span>
        </div>
      </div>
    </div>
  )
}

function Compliance({
  hidden,
  setHidden,
}: {
  hidden: boolean
  setHidden: (v: boolean) => void
}): React.JSX.Element {
  return (
    <div className="screen">
      <h1>录音合规提示</h1>
      <div className="compliance-card">
        <strong>请在录制对方音频前遵守当地法律，并按需告知对方。</strong>
        <p>
          LazyAudio
          让你能录下电脑系统音和麦克风。在大多数国家和地区，你录自己的声音、自己的会议没有问题，但有些地方对录制他人的声音有更严格的规定。
        </p>
        <p>LazyAudio 不会上传你的录音 — 但你与他人分享录音 / 转录时，请同样注意对方的同意权。</p>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={hidden}
          onChange={(e) => setHidden(e.currentTarget.checked)}
        />{' '}
        不再提示此信息
      </label>
    </div>
  )
}

function Done(): React.JSX.Element {
  return (
    <div className="screen centered">
      <div className="done-icon">✓</div>
      <h1>准备好了</h1>
      <p className="lead">按快捷键开始你的第一次录音，或点下面的按钮。</p>
      <div className="info-bar">录音中点关闭窗口不会停止录音，LazyAudio 会留在菜单栏。</div>
    </div>
  )
}

export function App(): React.JSX.Element {
  const [loading, setLoading] = useState(true)
  const [platform, setPlatform] = useState<PlatformSupport | null>(null)
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('local')
  const [complianceHidden, setComplianceHidden] = useState(false)
  const [micStatus, setMicStatus] = useState<MicStatus>('unknown')
  const [models, setModels] = useState<ModelListEntry[]>([])
  const [modelEvents, setModelEvents] = useState<Record<string, ModelEvent>>({})
  const [cloudOk, setCloudOk] = useState(false)
  const [cloudForm, setCloudForm] = useState<{
    baseUrl: string
    chatModel: string
    apiKey: string
  }>({
    baseUrl: '',
    chatModel: 'gpt-4o-mini',
    apiKey: '',
  })
  const [shortcut, setShortcut] = useState('CommandOrControl+Shift+R')

  const refreshMic = useCallback(() => {
    void window.lazyaudio.permission.getMicStatus().then((r) => setMicStatus(r.status))
  }, [])

  const refreshModels = useCallback(() => {
    void window.lazyaudio.model.list().then((r) => setModels(r.models))
  }, [])

  useEffect(() => {
    let cancelled = false
    window.lazyaudio.onboarding.status().then((status) => {
      if (cancelled) return
      setPlatform(status.platform)
      setPrivacyMode(status.onboarding.privacyMode)
      setComplianceHidden(status.onboarding.complianceReminderHidden)
      if (status.platform.ok) {
        const saved = status.onboarding.step
        setStep(
          saved && saved !== 'version-check'
            ? saved === 'api-config'
              ? 'api-config'
              : saved
            : 'welcome',
        )
      }
      setLoading(false)
    })
    window.lazyaudio.settings.get().then((s) => {
      if (!cancelled) setShortcut(s.shortcuts.toggleRecord)
    })
    refreshMic()
    refreshModels()
    const offModel = window.lazyaudio.model.onEvent((event) => {
      setModelEvents((prev) => ({ ...prev, [event.modelKey]: event }))
      if (event.phase === 'done' || event.phase === 'cancelled' || event.phase === 'error')
        refreshModels()
    })
    const offClose = window.lazyaudio.onboarding.onRequestClose(() => {
      if (window.confirm('尚未完成设置，确定退出？')) void window.lazyaudio.onboarding.quit()
    })
    return () => {
      cancelled = true
      offModel()
      offClose()
    }
  }, [refreshMic, refreshModels])

  const persistStep = useCallback(
    (next: OnboardingStep, mode = privacyMode) => {
      setStep(next)
      void window.lazyaudio.onboarding.setStep({
        step: next,
        privacyMode: mode,
        complianceReminderHidden: complianceHidden,
      })
    },
    [complianceHidden, privacyMode],
  )

  const defaultModelsDone = useMemo(() => {
    const defaults = models.filter((m) => m.isDefault)
    return defaults.length === 0 || defaults.every((m) => m.status === 'downloaded')
  }, [models])

  const canNext = useMemo(() => {
    if (step === 'permission') return micStatus === 'granted'
    if (step === 'model-download') return privacyMode !== 'local' || defaultModelsDone
    if (step === 'api-config') return cloudOk
    return true
  }, [cloudOk, defaultModelsDone, micStatus, privacyMode, step])

  const goBack = useCallback(() => {
    if (step === 'api-config') {
      persistStep('permission')
      return
    }
    if (step === 'model-download') {
      persistStep('permission')
      return
    }
    const idx = STEP_INDEX[step]
    if (idx <= 0) return
    if (step === 'shortcut') persistStep(privacyMode === 'local' ? 'model-download' : 'api-config')
    else persistStep(STEPS[idx - 1] ?? 'welcome')
  }, [persistStep, privacyMode, step])

  const goNext = useCallback(() => {
    if (step === 'welcome') persistStep('privacy')
    else if (step === 'privacy') persistStep('permission')
    else if (step === 'permission')
      persistStep(privacyMode === 'local' ? 'model-download' : 'api-config')
    else if (step === 'model-download' || step === 'api-config') persistStep('shortcut')
    else if (step === 'shortcut') persistStep('compliance')
    else if (step === 'compliance') persistStep('done')
    else if (step === 'done') {
      void window.lazyaudio.onboarding.complete({
        action: 'start-recording',
        privacyMode,
        complianceReminderHidden: complianceHidden,
        cloud: privacyMode === 'cloud' ? cloudForm : undefined,
      })
    }
  }, [cloudForm, complianceHidden, persistStep, privacyMode, step])

  const setMode = useCallback(
    (mode: PrivacyMode) => {
      setPrivacyMode(mode)
      void window.lazyaudio.onboarding.setStep({
        step,
        privacyMode: mode,
        complianceReminderHidden: complianceHidden,
      })
    },
    [complianceHidden, step],
  )

  if (loading || !platform) return <div className="ob-loading">加载中…</div>
  if (!platform.ok) return <VersionGate platform={platform} />

  let content: ReactNode
  if (step === 'welcome') content = <Welcome />
  else if (step === 'privacy') content = <Privacy mode={privacyMode} setMode={setMode} />
  else if (step === 'permission')
    content = (
      <PermissionScreen micStatus={micStatus} setStatus={setMicStatus} refreshMic={refreshMic} />
    )
  else if (step === 'model-download')
    content = <ModelDownload models={models} events={modelEvents} />
  else if (step === 'api-config')
    content = (
      <ApiConfig
        cloudOk={cloudOk}
        setCloudOk={setCloudOk}
        form={cloudForm}
        setForm={setCloudForm}
      />
    )
  else if (step === 'shortcut') content = <Shortcut accel={shortcut} />
  else if (step === 'compliance')
    content = <Compliance hidden={complianceHidden} setHidden={setComplianceHidden} />
  else content = <Done />

  const nextLabel = step === 'done' ? '开始第一次录音 →' : '下一步 →'
  return (
    <Shell
      step={step}
      canBack={STEP_INDEX[step] > 0}
      canNext={canNext}
      nextLabel={nextLabel}
      onBack={goBack}
      onNext={goNext}
    >
      {content}
      {step === 'done' ? (
        <button
          type="button"
          className="ob-link bottom-link"
          onClick={() =>
            void window.lazyaudio.onboarding.complete({
              action: 'open-main',
              privacyMode,
              complianceReminderHidden: complianceHidden,
              cloud: privacyMode === 'cloud' ? cloudForm : undefined,
            })
          }
        >
          稍后 — 先打开主窗口看看
        </button>
      ) : null}
    </Shell>
  )
}
