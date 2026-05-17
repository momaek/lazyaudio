// PreRecord.jsx — §6.4 录音前确认浮窗 (360×220, macOS vibrancy)

function CheckMark() {
  return (
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
  )
}

function PreRecordDialog({ theme = 'light', typeKey = 'interviewer' }) {
  const TYPE_LABEL = {
    general: '通用',
    meeting: '会议',
    note: '笔记',
    interviewer: '面试官',
    candidate: '面试者',
    lecture: '课程',
    podcast: '播客',
  }
  return (
    <div className="prerec" data-theme={theme}>
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
      <h3>准备录音</h3>

      <div className="prerec-row">
        <span className="lbl">会话类型</span>
        <button className="type-select">
          <span className="type-glyph-dot" style={{ background: `var(--type-${typeKey})` }} />
          <span>{TYPE_LABEL[typeKey]}</span>
          {Icons.chevronDown(12)}
        </button>
      </div>

      <div className="prerec-row">
        <span className="lbl">音源</span>
        <div className="checkbox-stack">
          <label className="checkbox-row">
            <span className="cb is-on">
              <CheckMark />
            </span>
            <span>麦克风</span>
            <span className="meta">MacBook Pro Microphone</span>
          </label>
          <label className="checkbox-row">
            <span className="cb is-on">
              <CheckMark />
            </span>
            <span>系统音</span>
            <span className="meta">通过 BlackHole 16ch</span>
          </label>
        </div>
      </div>

      <div className="prerec-actions">
        <button className="btn btn-secondary">取消</button>
        <button className="btn btn-primary">开始录音 →</button>
      </div>

      <div className="prerec-hint">
        <span>
          <span className="keys">⌘⇧R</span> 直接开始
        </span>
        <span>
          <span className="keys">Esc</span> 取消
        </span>
      </div>
    </div>
  )
}

// Stage with vibrant backdrop so the blur is visible
function PreRecordStage({ theme = 'light', typeKey = 'interviewer' }) {
  return (
    <div className={'prerec-bg' + (theme === 'dark' ? ' dark' : '')} data-theme={theme}>
      <PreRecordDialog theme={theme} typeKey={typeKey} />
    </div>
  )
}

window.PreRecordDialog = PreRecordDialog
window.PreRecordStage = PreRecordStage
