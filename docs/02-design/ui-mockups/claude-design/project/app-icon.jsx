// AppIcon.jsx — 1024×1024 master + small previews on light + dark
// Concept: a notecard / document with text lines (= transcript) + a small accent
// orb in the bottom-right with audio bars (= the "录音 + 转录" link). Avoids
// the cliché microphone-plus-music-note pattern. Pure geometry, no gradients.

function IconMaster({ shape = 'mac', size = 220 }) {
  return (
    <div className={'icon-master ' + shape} style={{ width: size, height: size }}>
      <div className="glyph">
        <div className="doc">
          <div className="line l1"/>
          <div className="line l2"/>
          <div className="line l3"/>
        </div>
        <div className="wave-orb">
          <i style={{ height: 8 }}/>
          <i style={{ height: 18 }}/>
          <i style={{ height: 12 }}/>
          <i style={{ height: 22 }}/>
          <i style={{ height: 14 }}/>
        </div>
      </div>
    </div>
  );
}

function IconPreviewRow({ shape }) {
  return (
    <div className="row-prev">
      <span className="small" style={{ borderRadius: shape === 'mac' ? 10 : 0 }}>
        <span className="bars"><i style={{ height: 4 }}/><i style={{ height: 9 }}/><i style={{ height: 6 }}/><i style={{ height: 11 }}/><i style={{ height: 7 }}/></span>
      </span>
      <span className="small" style={{ width: 28, height: 28, borderRadius: shape === 'mac' ? 7 : 0 }}>
        <span className="bars" style={{ height: 10 }}>
          <i style={{ height: 3 }}/><i style={{ height: 7 }}/><i style={{ height: 5 }}/><i style={{ height: 9 }}/><i style={{ height: 4 }}/>
        </span>
      </span>
      <span className="small" style={{ width: 16, height: 16, borderRadius: shape === 'mac' ? 4 : 0 }}>
        <span className="bars" style={{ height: 6 }}>
          <i style={{ height: 2 }}/><i style={{ height: 4 }}/><i style={{ height: 3 }}/><i style={{ height: 5 }}/>
        </span>
      </span>
      <div className="meta">
        <span>1024 / 512 / 256 / 64</span>
        <span>·</span>
        <span>{shape === 'mac' ? 'macOS · squircle 22.4% radius' : 'Windows · square'}</span>
      </div>
    </div>
  );
}

function AppIconStage({ shape = 'mac' }) {
  return (
    <div className="icon-stage">
      <div className="pane light">
        <h4>{shape === 'mac' ? 'macOS · 浅色背景' : 'Windows · 浅色背景'}</h4>
        <IconMaster shape={shape} size={220}/>
        <IconPreviewRow shape={shape}/>
      </div>
      <div className="pane dark">
        <h4>{shape === 'mac' ? 'macOS · 深色背景' : 'Windows · 深色背景'}</h4>
        <IconMaster shape={shape} size={220}/>
        <IconPreviewRow shape={shape}/>
      </div>
    </div>
  );
}

window.AppIconStage = AppIconStage;
