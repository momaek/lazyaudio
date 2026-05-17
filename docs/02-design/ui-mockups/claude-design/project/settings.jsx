// Settings.jsx — §6.9 settings window
// Shell + tabs: 通用 / 录音 / 转录引擎 / LLM 模板 / 快捷键 / 隐私 / 关于
// 880×640 · nav 200 · content padding 32 · 控件高度 §5.4.1

const NAV_ITEMS = [
  { id: 'general', label: '通用', icon: '⚙' },
  { id: 'recording', label: '录音', icon: '⏺' },
  { id: 'transcribe', label: '转录引擎', icon: '⏯' },
  { id: 'llm', label: 'LLM 模板', icon: '✦' },
  { id: 'shortcut', label: '快捷键', icon: '⌘' },
  { id: 'privacy', label: '隐私', icon: '◉' },
  { id: 'about', label: '关于', icon: 'ⓘ' },
]

function SettingsNav({ active = 'transcribe' }) {
  return (
    <nav className="set-nav">
      {NAV_ITEMS.map((it) => (
        <div key={it.id} className={'set-nav-item' + (it.id === active ? ' is-active' : '')}>
          <span className="glyph">{it.icon}</span>
          <span>{it.label}</span>
        </div>
      ))}
    </nav>
  )
}

// ===== Generic primitives =====
function SetRow({ label, helper, children, stack }) {
  return (
    <div className="setting-row">
      <div className="row-lbl">
        <span>{label}</span>
        {helper && <span className="helper">{helper}</span>}
      </div>
      <div className={'row-ctl' + (stack ? ' stack' : '')}>{children}</div>
    </div>
  )
}
function Toggle({ on }) {
  return <span className={'toggle' + (on ? ' is-on' : '')} />
}
function Radio({ on, children }) {
  return (
    <label className="radio-row">
      <span className={'radio-dot' + (on ? ' is-on' : '')} />
      <span>{children}</span>
    </label>
  )
}
function Select({ value, mono, minWidth }) {
  return (
    <button
      className={'select-trigger' + (mono ? ' is-mono' : '')}
      style={minWidth ? { minWidth } : null}
    >
      <span>{value}</span>
      {Icons.chevronDown(12)}
    </button>
  )
}
function Check({ on, children }) {
  return (
    <label className="check-inline">
      <span className={'cb' + (on ? ' is-on' : '')}>
        {on && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m2.5 6 2.5 2.5L9.5 3.5" />
          </svg>
        )}
      </span>
      <span>{children}</span>
    </label>
  )
}

// ============ Tab: 通用 ============
function SettingsGeneral() {
  return (
    <>
      <div className="set-page-head">
        <h2>通用</h2>
        <div className="sub">应用启动、外观、语言等基础偏好</div>
      </div>

      <div className="setting-rows">
        <SetRow label="启动时打开 LazyAudio" helper="开机后自动启动并隐藏到菜单栏">
          <Toggle on />
        </SetRow>
        <SetRow label="关闭主窗口时" stack>
          <div className="radio-group">
            <Radio on>最小化到菜单栏（保持后台快捷键可用）</Radio>
            <Radio>完全退出 LazyAudio</Radio>
          </div>
        </SetRow>
        <SetRow label="语言">
          <Select value="跟随系统" minWidth={180} />
        </SetRow>
        <SetRow label="主题">
          <div className="segmented narrow">
            <div className="seg">浅色</div>
            <div className="seg">深色</div>
            <div className="seg is-active">跟随系统</div>
          </div>
        </SetRow>
      </div>

      <h3 className="setting-group-title" style={{ marginTop: 8 }}>
        提醒
      </h3>
      <div className="setting-rows">
        <SetRow label="转录完成后提醒" helper="发出系统通知和提示音">
          <Toggle on />
        </SetRow>
        <SetRow label="错误发生时提醒">
          <Toggle />
        </SetRow>
      </div>
    </>
  )
}

// ============ Tab: 转录引擎 (existing) ============
function ModelCard({ name, desc, lang, status, progress, downloaded, size, isDefault }) {
  return (
    <div className={'model-card' + (isDefault ? ' is-default' : '')}>
      <div className="lang-chip">{lang}</div>
      <div className="info">
        <div className="name">
          {name}
          {isDefault && <span className="default-badge">默认</span>}
        </div>
        <div className="desc">{desc}</div>
      </div>
      {status === 'done' && (
        <div className="status is-done">
          <span>✓</span>
          <span>已下载</span>
        </div>
      )}
      {status === 'available' && (
        <div className="status is-avail">
          <span>↓</span>
          <span>未下载</span>
        </div>
      )}
      {status === 'downloading' && (
        <div className="status is-downloading">
          <div className="pbar">
            <div className="fill" style={{ width: progress + '%' }} />
          </div>
          <div className="meta">
            <span>{progress}%</span>
            <span>{downloaded}</span>
          </div>
        </div>
      )}
      <div className="right">
        <span className="size">{size}</span>
        <div className="actions">
          {status === 'done' && !isDefault && (
            <>
              <button className="btn-compact-ghost">设为默认</button>
              <button className="btn-compact-ghost danger">删除</button>
            </>
          )}
          {status === 'done' && isDefault && (
            <button className="btn-compact-ghost danger">删除</button>
          )}
          {status === 'available' && <button className="btn-compact-ghost">下载</button>}
          {status === 'downloading' && <button className="btn-compact-ghost danger">取消</button>}
        </div>
      </div>
    </div>
  )
}

function SettingsTranscribeLocal() {
  return (
    <>
      <div className="set-page-head">
        <h2>转录引擎</h2>
        <div className="sub">
          选择把音频变成文字的方式。本地模型保证音频不出本机；云端 API 更快但会上传内容。
        </div>
      </div>
      <div className="segmented">
        <div className="seg is-active">本地</div>
        <div className="seg">云端 API</div>
      </div>
      <div>
        <h3 className="set-section-title">
          本地转录模型
          <span className="helper">下载后离线可用 · 数据不出本机</span>
        </h3>
      </div>
      <div className="model-list">
        <ModelCard
          lang="zh"
          name="whisper-medium-zh"
          desc="中文优先 · 多语种回退 · CTranslate2 量化"
          status="done"
          size="272 MB"
          isDefault
        />
        <ModelCard
          lang="zh"
          name="whisper-small-zh"
          desc="中文优先 · 比 medium 快 ~2× · 适合实时字幕"
          status="done"
          size="244 MB"
        />
        <ModelCard
          lang="en"
          name="whisper-medium-en"
          desc="英文专用 · 准确率最高 · 用于英文会议 / 面试"
          status="downloading"
          progress={63}
          downloaded="171 / 272 MB"
          size="272 MB"
        />
        <ModelCard
          lang="ml"
          name="whisper-large-v3"
          desc="多语种 · 最高准确率 · 速度较慢 · 推荐 M 系列芯片"
          status="available"
          size="1.55 GB"
        />
        <ModelCard
          lang="zh"
          name="whisper-tiny-zh"
          desc="最小模型 · 适合低配设备做实时草稿"
          status="available"
          size="39 MB"
        />
      </div>
    </>
  )
}

function SettingsTranscribeCloud() {
  return (
    <>
      <div className="set-page-head">
        <h2>转录引擎</h2>
        <div className="sub">
          选择把音频变成文字的方式。本地模型保证音频不出本机；云端 API 更快但会上传内容。
        </div>
      </div>
      <div className="segmented">
        <div className="seg">本地</div>
        <div className="seg is-active">云端 API</div>
      </div>
      <div>
        <h3 className="set-section-title">
          云端 API 配置
          <span className="helper">OpenAI 兼容协议 · 仅在录音转录时调用一次</span>
        </h3>
      </div>
      <div className="cloud-form">
        <div className="form-row">
          <span className="lbl">baseUrl</span>
          <div className="ctl">
            <input className="input-lg is-mono" defaultValue="https://api.openai.com/v1" readOnly />
          </div>
        </div>
        <div className="form-row">
          <span className="lbl">apiKey</span>
          <div className="ctl">
            <input
              className="input-lg is-mono"
              type="password"
              defaultValue="sk-proj-abCdEf1234567890"
              readOnly
            />
            <button className="input-suffix-btn" title="显示">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
                <circle cx="8" cy="8" r="2" />
              </svg>
            </button>
          </div>
        </div>
        <div className="form-row">
          <span className="lbl">model</span>
          <div className="ctl">
            <input className="input-lg is-mono" defaultValue="gpt-4o-mini-transcribe" readOnly />
          </div>
        </div>
        <div className="form-row">
          <span className="lbl">语言</span>
          <div className="ctl">
            <input className="input-lg" defaultValue="自动检测（推荐）" readOnly />
          </div>
        </div>
        <div className="test-row">
          <button className="btn btn-secondary">测试连接</button>
          <span className="status is-ok">
            <span>✓</span>
            <span>已连接</span>
            <span className="mono">· 延迟 84ms · 余额 $12.40</span>
          </span>
        </div>
        <div className="save-row">
          <button className="btn btn-primary">保存</button>
        </div>
      </div>
    </>
  )
}

// ============ Tab: 录音 ============
function SettingsRecording() {
  const TYPE_OPTIONS = ['通用', '会议', '笔记', '面试官', '面试者', '课程', '播客']
  return (
    <>
      <div className="set-page-head">
        <h2>录音</h2>
        <div className="sub">音源、默认类型、音质和存储</div>
      </div>

      <div className="setting-rows">
        <SetRow label="默认音源" helper="录音前的浮窗会预选这些项">
          <div style={{ display: 'flex', gap: 14 }}>
            <Check on>麦克风</Check>
            <Check on>系统音</Check>
          </div>
        </SetRow>
        <SetRow label="默认会话类型">
          <button className="select-trigger" style={{ minWidth: 180 }}>
            <span className="type-glyph-dot" style={{ background: 'var(--type-note)' }} />
            <span>笔记</span>
            {Icons.chevronDown(12)}
          </button>
        </SetRow>
        <SetRow label="音质" helper="高音质占用空间约 2× 标准">
          <div className="segmented narrow">
            <div className="seg is-active">标准 · 64 kbps</div>
            <div className="seg">高 · 128 kbps</div>
          </div>
        </SetRow>
      </div>

      <h3 className="setting-group-title" style={{ marginTop: 8 }}>
        存储
      </h3>
      <div className="setting-rows">
        <SetRow label="录音文件保存到" stack>
          <div className="path-row">
            <span className="path-input">~/Library/Application Support/LazyAudio/Recordings</span>
            <button className="btn btn-secondary btn-compact">选择文件夹…</button>
            <button className="btn-compact-ghost">在 Finder 中显示</button>
          </div>
        </SetRow>
        <SetRow label="自动删除旧录音" helper="超过指定天数的录音会被永久删除（保留转录文本）">
          <div className="num-row">
            <span style={{ color: 'var(--text-muted)' }}>超过</span>
            <input className="num-input" defaultValue="90" readOnly />
            <span style={{ color: 'var(--text-muted)' }}>天</span>
            <Toggle on />
          </div>
        </SetRow>
      </div>
    </>
  )
}

// ============ Tab: 快捷键 ============
function ShortcutRow({ name, sub, keys, capturing, danger }) {
  return (
    <div className={'short-row' + (capturing ? ' is-capturing' : '')}>
      <div className="name">
        <span>{name}</span>
        {sub && <span className="sub">{sub}</span>}
      </div>
      <div className="keys">
        {capturing ? (
          <span className="capture-hint">按下新的快捷键…</span>
        ) : (
          keys.map((k, i) => (
            <React.Fragment key={i}>
              <span className={'kkey' + (k.length === 1 && /[^\w]/.test(k) ? ' is-symbol' : '')}>
                {k}
              </span>
              {i < keys.length - 1 && <span className="kkey-plus">+</span>}
            </React.Fragment>
          ))
        )}
      </div>
      {capturing ? (
        <button className="short-edit-link muted">取消</button>
      ) : (
        <button className={'short-edit-link' + (danger ? ' muted' : '')}>
          {danger ? '清除' : '修改'}
        </button>
      )}
    </div>
  )
}

function SettingsShortcut() {
  return (
    <>
      <div className="set-page-head">
        <h2>快捷键</h2>
        <div className="sub">全局快捷键 — 在任何 app 中都能触发</div>
      </div>

      <div className="short-top-row">
        <span className="setting-group-title" style={{ marginBottom: 0 }}>
          动作
        </span>
        <button className="short-edit-link">恢复默认</button>
      </div>

      <div className="short-table">
        <ShortcutRow
          name="开始 / 停止录音"
          sub="全局热键 · 弹出录音前浮窗或停止当前录音"
          keys={['⌘', '⇧', 'R']}
        />
        <ShortcutRow name="暂停录音" sub="仅录音中可用" keys={['⌘', '⇧', 'P']} capturing />
        <ShortcutRow name="显示主窗口" keys={['⌘', '1']} />
        <ShortcutRow name="聚焦搜索" sub="主窗口内" keys={['⌘', 'F']} />
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-subtle)', padding: '0 4px' }}>
        点击 修改 后按下新的组合键 · Esc 取消 · ⌫ 清除
      </div>
    </>
  )
}

// ============ Tab: 隐私 ============
function SettingsPrivacy({ showModal }) {
  return (
    <>
      <div className="set-page-head">
        <h2>隐私</h2>
        <div className="sub">数据全部保存在本机 · 不上传服务器 · 不收集任何使用统计</div>
      </div>

      <h3 className="setting-group-title">数据</h3>
      <div className="setting-rows">
        <SetRow label="数据存储位置" stack>
          <div className="path-row">
            <span className="path-input">~/Library/Application Support/LazyAudio</span>
            <button className="btn btn-secondary btn-compact">在 Finder 中显示</button>
          </div>
        </SetRow>
      </div>

      <h3 className="setting-group-title" style={{ marginTop: 8 }}>
        诊断
      </h3>
      <div className="setting-rows">
        <SetRow label="记录错误日志" helper="本地保留 7 天 · 仅在你主动反馈时使用">
          <Toggle on />
        </SetRow>
        <SetRow label="日志文件" stack>
          <div className="path-row">
            <span className="path-input">~/Library/Logs/LazyAudio/lazyaudio.log</span>
            <button className="btn-compact-ghost">查看日志</button>
            <button className="btn-compact-ghost">复制路径</button>
          </div>
        </SetRow>
      </div>

      <h3 className="setting-group-title" style={{ marginTop: 8 }}>
        危险操作
      </h3>
      <div className="danger-card">
        <div className="text">
          <div className="title-row">清除全部录音和转录</div>
          <div className="desc">
            将永久删除所有本地音频文件、转录文本和 AI 摘要。此操作不可撤销。
          </div>
        </div>
        <button className="btn-danger">清除全部数据…</button>
      </div>

      <div className="privacy-note">
        LazyAudio 不会向任何服务器发送音频、转录文本或使用数据。开启「云端
        API」转录引擎时，音频片段会按你配置的 baseUrl 上传至该服务，请自行确认其隐私条款。
      </div>

      {showModal && (
        <div className="modal-scrim">
          <div className="modal-card">
            <button className="close-x" title="关闭">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m2.5 2.5 7 7M9.5 2.5l-7 7" />
              </svg>
            </button>
            <h3>确认清除全部数据？</h3>
            <div className="body">
              将永久删除 <code>327 个录音</code>（共 <code>4.2 GB</code>）及其所有转录和摘要。
              <br />
              此操作不可撤销 — 输入 <code>DELETE</code> 以确认。
            </div>
            <input className="input-lg is-mono" placeholder="DELETE" />
            <div className="actions">
              <button className="btn btn-secondary">取消</button>
              <button className="btn-danger solid">永久删除</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ============ Tab: 关于 ============
function SettingsAbout() {
  return (
    <>
      <div className="about-stack">
        <div className="la-icon" style={{ width: 80, height: 80, borderRadius: 18 }}>
          <div className="bars" style={{ height: 32 }}>
            <i style={{ height: '40%' }} />
            <i style={{ height: '90%' }} />
            <i style={{ height: '60%' }} />
            <i style={{ height: '100%' }} />
            <i style={{ height: '50%' }} />
          </div>
        </div>
        <div>
          <h1>LazyAudio</h1>
          <div className="ver">v1.0.0 (build 2034) · macOS 14.0 Sonoma</div>
        </div>
        <p className="slogan">录下你电脑的声音 · 转成可搜索的文字</p>
      </div>

      <div className="update-row">
        <button className="btn btn-secondary">检查更新</button>
        <span className="stat">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m2.5 6 2.5 2.5L9.5 3.5" />
          </svg>
          已是最新版本 · 上次检查 2 分钟前
        </span>
      </div>

      <div className="about-links">
        <a>使用文档 ↗</a>
        <a>反馈问题 ↗</a>
        <a>开源协议</a>
        <a>致谢</a>
      </div>

      <div className="about-copy">
        © 2026 LazyAudio · Made with care in 北京 · 本应用包含开源软件，详见「开源协议」
      </div>
    </>
  )
}

function SettingsWindow({ theme = 'light', tab = 'local', nav = 'transcribe', showModal }) {
  const content =
    nav === 'general' ? (
      <SettingsGeneral />
    ) : nav === 'recording' ? (
      <SettingsRecording />
    ) : nav === 'transcribe' ? (
      tab === 'local' ? (
        <SettingsTranscribeLocal />
      ) : (
        <SettingsTranscribeCloud />
      )
    ) : nav === 'shortcut' ? (
      <SettingsShortcut />
    ) : nav === 'privacy' ? (
      <SettingsPrivacy showModal={showModal} />
    ) : nav === 'about' ? (
      <SettingsAbout />
    ) : (
      <SettingsTranscribeLocal />
    )
  return (
    <div className="settings-window" data-theme={theme}>
      <div className="drag-region" />
      <div className="mac-traffic-overlay">
        <span className="tl-close" />
        <span className="tl-min" />
        <span className="tl-max" />
      </div>
      <div className="settings-body">
        <SettingsNav active={nav} />
        <div className="set-content">{content}</div>
      </div>
    </div>
  )
}

// Export shared primitives so future tabs (录音 / 快捷键 / 隐私 / 关于)
// can reuse them by attaching to window below.
window.SettingsWindow = SettingsWindow
window.SetRow = SetRow
window.Toggle = Toggle
window.Radio = Radio
window.Select = Select
window.Check = Check
