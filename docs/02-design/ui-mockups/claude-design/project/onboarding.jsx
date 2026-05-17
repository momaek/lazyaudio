// Onboarding.jsx — §6.6 P0 五屏：1 / 2 / 4a / 5 / 7
// Each screen wraps in OnboardingShell (720×520 non-resizable).

function AppIcon({ size = 80 }) {
  // Simple mark: rounded square + minimal waveform bars (3 vertical rects = "audio").
  // Per design rules — no hand-drawn complex SVG. Bars only.
  return (
    <div className="la-icon" style={{ width: size, height: size, borderRadius: size * 0.225 }}>
      <div className="bars" style={{ height: size * 0.4 }}>
        <i style={{ height: '40%' }}/>
        <i style={{ height: '90%' }}/>
        <i style={{ height: '60%' }}/>
        <i style={{ height: '100%' }}/>
        <i style={{ height: '50%' }}/>
      </div>
    </div>
  );
}

function ProgressDots({ active = 1, total = 7 }) {
  return (
    <div className="dots">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={'dot' + (i === active ? ' is-active' : '')}/>
      ))}
    </div>
  );
}

function OnboardingShell({ step, total = 7, onBack, onNext, nextLabel = '下一步', secondaryNext, children, theme = 'light' }) {
  return (
    <div className={'ob-stage' + (theme === 'dark' ? ' dark' : '')} data-theme={theme}>
      <div className="ob-window">
        <div className="mac-traffic-overlay">
          <span className="tl-close"/>
          <span className="tl-min" style={{ background: '#C8C9CC' }}/>
          <span className="tl-max" style={{ background: '#C8C9CC' }}/>
        </div>
        <div className="ob-body">{children}</div>
        <div className="ob-footer">
          <button className={'back' + (step === 0 ? ' is-hidden' : '')}>← 上一步</button>
          <ProgressDots active={step} total={total}/>
          <div className="next">
            {secondaryNext && <button className="btn btn-secondary">{secondaryNext}</button>}
            <button className="btn btn-primary">{nextLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Screen 1: 欢迎 =====
function OnbWelcome({ theme }) {
  return (
    <OnboardingShell step={0} theme={theme}>
      <AppIcon size={80}/>
      <h1 className="ob-h1">录下你电脑的声音<br/>转成可搜索的文字</h1>
      <p className="ob-sub">本地优先 · 自动转录 · AI 一键纪要</p>
    </OnboardingShell>
  );
}

// ===== Screen 2: 隐私模式选择 =====
function OnbPrivacy({ theme, selected = 'local' }) {
  return (
    <OnboardingShell step={1} theme={theme}>
      <h2 className="ob-h2">如何处理音频转录？</h2>
      <p className="ob-sub" style={{ maxWidth: 460 }}>
        转录是把音频变成文字的关键一步。你可以选择本地模型（隐私优先），或调用你自己的云端 API。
      </p>
      <div className="privacy-cards">
        <div className={'privacy-card' + (selected === 'local' ? ' is-selected' : '')}>
          <div className="head">
            <span className="glyph">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="7" width="10" height="7" rx="1.5"/>
                <path d="M5 7V5a3 3 0 0 1 6 0v2"/>
              </svg>
            </span>
            本地（推荐）
          </div>
          <div className="desc">所有音频、转录、摘要都保存在你的机器上。不连接任何第三方服务。</div>
          <div className="meta-row">
            <span className="pill">whisper.cpp · medium-zh</span>
            <span>约 270 MB</span>
          </div>
        </div>

        <div className={'privacy-card' + (selected === 'cloud' ? ' is-selected' : '')}>
          <div className="head">
            <span className="glyph">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13a3 3 0 1 1 .5-5.95A4 4 0 0 1 13 8.5a2.5 2.5 0 0 1 0 5H5z"/>
              </svg>
            </span>
            云端 API
          </div>
          <div className="desc">用你自己的 OpenAI 兼容 API key 转录。速度更快，但音频内容会发送至该服务。</div>
          <div className="meta-row">
            <span className="pill">需要 API key</span>
            <span>按用量计费</span>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}

// ===== Screen 4a: 模型下载 =====
function OnbModelDownload({ theme }) {
  return (
    <OnboardingShell step={3} theme={theme}>
      <h2 className="ob-h2">正在下载本地转录模型</h2>
      <p className="ob-sub">下载一次，之后所有转录都在本地完成。可随时切换镜像。</p>

      <div className="ob-download">
        <div className="model-row">
          <span className="icon">zh</span>
          <div className="model-name">
            whisper-medium-zh
            <span className="sub">中文优先 · 多语种回退 · CTranslate2</span>
          </div>
          <span className="model-size">272 MB</span>
        </div>

        <div>
          <div className="progress"><div className="progress-fill" style={{ width: '63%' }}/></div>
        </div>
        <div className="pstats">
          <span className="pct">63%</span>
          <span>171.4 / 272 MB</span>
          <span className="right">
            <span>8.3 MB/s</span>
            <span>剩余 ~12 秒</span>
          </span>
        </div>
        <div className="links">
          <button>切换镜像源（当前：HuggingFace）</button>
          <button className="muted">取消并跳过</button>
        </div>
      </div>
    </OnboardingShell>
  );
}

// ===== Screen 5: 快捷键 =====
function OnbShortcut({ theme, platform = 'mac' }) {
  const keys = platform === 'mac' ? ['⌘', '⇧', 'R'] : ['Ctrl', 'Shift', 'R'];
  return (
    <OnboardingShell step={4} theme={theme}>
      <div className="keycap-row">
        {keys.map((k, i) => (
          <React.Fragment key={i}>
            <span className={'keycap' + (platform === 'win' ? ' is-win' : '')}>{k}</span>
            {i < keys.length - 1 && <span className="keycap-plus">+</span>}
          </React.Fragment>
        ))}
      </div>
      <h2 className="ob-h2">用快捷键秒起录音</h2>
      <p className="ob-sub">
        <b style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-base)' }}>
          {platform === 'mac' ? '⌘⇧R' : 'Ctrl + Shift + R'}
        </b>{' '}一键开始 / 停止，全局生效
      </p>
      <p className="ob-meta">
        {platform === 'mac' ? '⌘⇧P' : 'Ctrl + Shift + P'} 暂停 · 可在 设置 → 快捷键 修改
      </p>
    </OnboardingShell>
  );
}

// ===== Screen 7: 完成 =====
function OnbDone({ theme }) {
  return (
    <OnboardingShell
      step={6}
      nextLabel="开始第一次录音"
      secondaryNext="先进入主窗口"
      theme={theme}
    >
      <div className="ob-done-circle">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 12 5 5 11-11"/>
        </svg>
      </div>
      <h1 className="ob-h1">准备就绪</h1>
      <p className="ob-sub">
        按{' '}
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-base)', fontWeight: 600 }}>⌘⇧R</span>{' '}
        开始你的第一次录音
      </p>
    </OnboardingShell>
  );
}

// ===== Screen 3: 系统权限（P1）=====
function OnbPermissions({ theme }) {
  return (
    <OnboardingShell step={2} theme={theme}>
      <h2 className="ob-h2">授予系统权限</h2>
      <p className="ob-sub">需要这两项才能录到完整的电脑声音</p>

      <div className="perm-list">
        <div className="perm-row is-granted">
          <span className="glyph">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="2.5" width="6" height="9" rx="3"/>
              <path d="M3.5 9a5.5 5.5 0 0 0 11 0M9 14.5v2"/>
            </svg>
          </span>
          <div className="body">
            <div className="name">麦克风</div>
            <div className="why">录下你说的话 — 面试、会议、笔记都需要</div>
          </div>
          <span className="act-granted">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2.5 6 2.5 2.5L9.5 3.5"/></svg>
            已授权
          </span>
        </div>

        <div className="perm-row">
          <span className="glyph">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="14" height="10" rx="1.5"/>
              <path d="M6 16h6M9 13v3"/>
            </svg>
          </span>
          <div className="body">
            <div className="name">屏幕录制（用于捕获系统音）</div>
            <div className="why">macOS 只允许通过屏幕录制 API 捕获系统音 — 我们不读取任何画面内容</div>
          </div>
          <button className="act-btn">前往授权</button>
        </div>
      </div>

      <div className="perm-foot">
        <span>🔒</span>
        <span>权限仅用于录音 · 所有数据保存在本机 · 可在系统设置中随时撤销</span>
      </div>
    </OnboardingShell>
  );
}

// ===== Screen 4b: 云端 API 配置（P1，4a 的替代）=====
function OnbApiConfig({ theme }) {
  return (
    <OnboardingShell step={3} theme={theme} nextLabel="测试并保存">
      <h2 className="ob-h2">配置云端 API</h2>
      <p className="ob-sub">支持任何兼容 OpenAI 协议的转录服务</p>

      <div className="api-form">
        <div className="form-row">
          <span className="lbl">baseUrl</span>
          <div className="ctl">
            <input className="input-lg is-mono" placeholder="https://api.openai.com/v1" defaultValue="https://api.openai.com/v1" readOnly/>
          </div>
        </div>
        <div className="form-row">
          <span className="lbl">apiKey</span>
          <div className="ctl">
            <input className="input-lg is-mono" type="password" placeholder="sk-..." defaultValue="sk-proj-abCdEf1234567890QrStUvWx" readOnly/>
            <button className="input-suffix-btn" title="显示">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"/>
                <circle cx="8" cy="8" r="2"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="form-row">
          <span className="lbl">model</span>
          <div className="ctl">
            <input className="input-lg is-mono" defaultValue="gpt-4o-mini-transcribe" readOnly/>
          </div>
        </div>
        <div className="api-hint">音频内容会上传至该服务 — 仅在录音停止后调用一次</div>
      </div>
    </OnboardingShell>
  );
}

// ===== Screen 6: 默认会话类型（P1）=====
function OnbSessionType({ theme, selected = 'note' }) {
  const TYPES = [
    { id: 'general',     name: '通用',   tpl: '通用模板' },
    { id: 'meeting',     name: '会议',   tpl: '会议纪要' },
    { id: 'note',        name: '笔记',   tpl: '笔记模板' },
    { id: 'interviewer', name: '面试官', tpl: '面试评估' },
    { id: 'candidate',   name: '面试者', tpl: '面试复盘' },
    { id: 'lecture',     name: '课程',   tpl: '课程笔记' },
    { id: 'podcast',     name: '播客',   tpl: '节目卡片' },
  ];
  return (
    <OnboardingShell step={5} theme={theme}>
      <h2 className="ob-h2">最常用哪种会话？</h2>
      <p className="ob-sub" style={{ maxWidth: 480 }}>
        选一个作为默认 — 录音前可随时切换。每种类型对应一套 AI 摘要模板。
      </p>

      <div className="type-grid">
        {TYPES.map(t => (
          <div key={t.id} className={'type-tile' + (t.id === selected ? ' is-selected' : '')}>
            <span className="tdot" style={{ background: `var(--type-${t.id})` }}/>
            <div>
              <div className="tname">{t.name}</div>
              <div className="ttpl">{t.tpl}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="type-default-line">
        <span>默认模板可在 设置 → LLM 模板 中调整</span>
      </div>
    </OnboardingShell>
  );
}

window.OnbWelcome = OnbWelcome;
window.OnbPrivacy = OnbPrivacy;
window.OnbPermissions = OnbPermissions;
window.OnbModelDownload = OnbModelDownload;
window.OnbApiConfig = OnbApiConfig;
window.OnbShortcut = OnbShortcut;
window.OnbSessionType = OnbSessionType;
window.OnbDone = OnbDone;
