// MenuBar.jsx — §6.5 menu-bar dropdown (idle + recording)
// Shows a macOS top bar slice with the LazyAudio icon active +
// the dropdown menu open below.

function MenuSep() { return <div className="mb-sep"/>; }

function MenuItem({ label, kbd, submenu, hover, disabled, leading }) {
  return (
    <div className={'mb-item' + (hover ? ' is-hover' : '') + (disabled ? ' is-disabled' : '')}>
      {leading}
      <span className="lbl">{label}</span>
      {kbd && <span className="kbd-line">{kbd}</span>}
      {submenu && <span className="submenu">▸</span>}
    </div>
  );
}

function MenuRecentItem({ type, title, when, preview, hover }) {
  return (
    <div className={'mb-recent-item' + (hover ? ' is-hover' : '')}>
      <span className="type-dot" style={{ background: `var(--type-${type})` }}/>
      <span className="title">{title}</span>
      <span className="when">{when}</span>
      <span className="sub">{preview}</span>
    </div>
  );
}

// Top status bar slice (macOS-style)
function TopBar({ recording, theme }) {
  return (
    <div className="mb-bar">
      <span className="mb-apple">  </span>
      <div className="mb-mainmenu">
        <span style={{ fontWeight: 600 }}>LazyAudio</span>
        <span>文件</span><span>编辑</span><span>录音</span><span>视图</span><span>窗口</span><span>帮助</span>
      </div>
      <div className="mb-right">
        <span>📡</span>
        <span>🔋</span>
        <span className="mb-icon is-active">
          {recording
            ? <span className="mb-rec">
                <span className="record-dot"/>
                <span className="dur">03:24</span>
              </span>
            : <span className="la-mark">L</span>}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>16:27</span>
        <span>🔍</span>
        <span>⊙</span>
      </div>
    </div>
  );
}

// Idle dropdown — with "最近录音 ▸" submenu open
function MenuBarIdle({ theme = 'light' }) {
  // The active app icon sits at the right side of menu bar; menu drops below.
  // Approx anchor: icon centered around right side; menu opens to its left edge.
  return (
    <div className={'mb-stage' + (theme === 'dark' ? ' dark' : '')} data-theme={theme}>
      <TopBar recording={false} theme={theme}/>

      {/* main dropdown */}
      <div className="mb-menu" style={{ top: 30, right: 154, width: 280 }}>
        <MenuItem label="开始录音…" kbd="⌘⇧R" hover/>
        <MenuSep/>
        <MenuItem label="显示主窗口" kbd="⌘1"/>
        <MenuItem label="最近录音" submenu/>
        <MenuSep/>
        <MenuItem label="设置…" kbd="⌘,"/>
        <MenuItem label="退出 LazyAudio" kbd="⌘Q"/>
      </div>

      {/* submenu shown opened to the LEFT of the parent because we're near right edge */}
      <div className="mb-menu mb-submenu" style={{ top: 78, right: 440, width: 320, padding: 4 }}>
        <MenuRecentItem type="interviewer" title="面试官" when="14:30" preview="好的我们今天主要聊一下你过去一年的工作…" hover/>
        <MenuRecentItem type="meeting" title="产品周会" when="10:00" preview="OK 我们先过一下本周的发布节奏…"/>
        <MenuRecentItem type="note" title="关于 onboarding 卡顿的想法" when="昨天 16:45" preview="app 启动后第一屏到模型下载这段路径太长…"/>
        <MenuRecentItem type="lecture" title="分布式系统 — 一致性算法" when="昨天 14:00" preview="我们今天主要讲 Paxos 和 Raft…"/>
        <MenuRecentItem type="candidate" title="系统设计专项面（C 公司）" when="周四" preview="请你设计一个支持百万 QPS 的短链服务…"/>
        <MenuSep/>
        <MenuItem label="在主窗口中查看全部…"/>
      </div>
    </div>
  );
}

// Recording dropdown
function MenuBarRecording({ theme = 'light' }) {
  return (
    <div className={'mb-stage' + (theme === 'dark' ? ' dark' : '')} data-theme={theme}>
      <TopBar recording={true} theme={theme}/>

      <div className="mb-menu" style={{ top: 30, right: 138, width: 280 }}>
        <div className="mb-item is-header" style={{ height: 28 }}>
          <span className="record-dot"/>
          <span className="dur">03:24</span>
          <span className="who">录制中（笔记）</span>
        </div>
        <MenuSep/>
        <MenuItem label="暂停录音" kbd="⌘⇧P" hover/>
        <MenuItem label="停止并保存" kbd="⌘⇧R"/>
        <MenuSep/>
        <MenuItem label="显示主窗口" kbd="⌘1"/>
        <MenuSep/>
        <MenuItem label="设置…" kbd="⌘,"/>
        <MenuItem label="退出 LazyAudio…" kbd="⌘Q"/>
      </div>
    </div>
  );
}

window.MenuBarIdle = MenuBarIdle;
window.MenuBarRecording = MenuBarRecording;
