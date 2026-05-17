// MainWindow.jsx — LazyAudio main window
// states: 'data' (§6.1) | 'recording' (§6.3.5) | 'empty' (§6.2)
//       | 'transcribing' (§6.3) | 'failed' (§6.3)

const LIBRARY = [
  { group: '今天', items: [
    { id: 'sT', type: 'meeting', state: 'pending', progress: 34,
      title: '产品发布评审 — Q2 GTM', timeOfDay: '15:42', dur: '00:52:18',
      preview: '正在转录…（约剩 1 分 20 秒）' },
    { id: 'sF', type: 'general', state: 'failed',
      title: '通勤路上想法', timeOfDay: '08:30', dur: '00:00:42',
      preview: '网络连接超时 — 点击重试' },
    { id: 's1', type: 'interviewer', state: 'done',
      title: '面试官', timeOfDay: '14:30', dur: '01:12:34',
      preview: '好的我们今天主要聊一下你过去一年的工作，先简单做个自我介绍吧' },
    { id: 's2', type: 'meeting', state: 'done',
      title: '产品周会', timeOfDay: '10:00', dur: '00:45:11',
      preview: 'OK 我们先过一下本周的发布节奏，然后再 review 一下 OKR…' },
  ]},
  { group: '昨天', items: [
    { id: 's3', type: 'note', state: 'done', title: '关于 onboarding 卡顿的想法', timeOfDay: '16:45', dur: '00:01:23', preview: 'app 启动后第一屏到模型下载这段路径太长，应该把权限请求挪后' },
    { id: 's4', type: 'lecture', state: 'done', title: '分布式系统 — 一致性算法', timeOfDay: '14:00', dur: '01:30:00', preview: '我们今天主要讲 Paxos 和 Raft，重点关注它们的 leader election 机制' },
  ]},
  { group: '本周', items: [
    { id: 's5', type: 'candidate', state: 'done', title: '系统设计专项面（C 公司）', timeOfDay: '周四 11:00', dur: '00:38:12', preview: '请你设计一个支持百万 QPS 的短链服务，可以从需求开始' },
    { id: 's6', type: 'meeting', state: 'done', title: '和 Ops 同步 — Q3 容量规划', timeOfDay: '周三 09:00', dur: '00:25:00', preview: '基于上半年的曲线，预估 Q3 集群需要扩容 30%，主要是…' },
    { id: 's7', type: 'general', state: 'done', title: '随手记', timeOfDay: '周一 08:12', dur: '00:00:42', preview: '记一下今天通勤想到的，关于 retention 看板的二级跳转…' },
  ]},
  { group: '更早', items: [
    { id: 's8', type: 'podcast', state: 'done', title: '和老王聊云原生', timeOfDay: '5/8', dur: '00:52:30', preview: '今天我们请到了…来聊一下他们这两年从 ECS 迁到 K8s 的过程…' },
    { id: 's9', type: 'interviewer', state: 'done', title: '面试官（实习生 — 后端）', timeOfDay: '5/6', dur: '00:42:18', preview: '你简历上写了一个高并发缓存的项目，能展开讲讲你具体做了什么吗' },
  ]},
];

const TRANSCRIPT = [
  { t: '00:00', sp: '1', text: '好的我们今天主要聊一下你过去一年的工作，先简单做个自我介绍吧' },
  { t: '00:11', sp: '2', text: '好的，我叫陈昊，过去一年在一家 B 端 SaaS 公司做数据分析平台，主要负责后端架构' },
  { t: '00:28', sp: '1', text: '嗯，你们这个产品的核心用户画像是什么' },
  { t: '00:33', sp: '2', text: '主要是中大型互联网公司的运营，他们需要看自己渠道投放的全链路转化' },
  { t: '00:54', sp: '1', text: '日活和事件量大概多大' },
  { t: '00:58', sp: '2', text: '日活 PV 在两千万左右，每天的事件量大概一亿五，峰值会到三亿' },
  { t: '01:14', sp: '1', text: 'OK 那你聊聊技术栈' },
  { t: '01:18', sp: '2', text: '存储我们用 ClickHouse，前面套了一层 Druid 做实时预聚合' },
  { t: '01:32', sp: '1', text: '这个选型是你主导的吗' },
  { t: '01:38', sp: '2', text: '嗯是我主导的，最早我们用 MySQL 直接跑聚合，QPS 上来之后基本撑不住' },
  { t: '01:55', sp: '1', text: '那你当时怎么调研的，主要关注哪几个指标' },
  { t: '02:01', sp: '2', text: '我列了一个备选清单，看三件事：写入吞吐、查询延迟、运维复杂度。OLAP 我们对比了 Druid、Pinot、ClickHouse' },
  { t: '02:24', sp: '1', text: '最后决策的关键因素是什么' },
];
const CURRENT_SEG_IDX = 7;

const RECORDING_SESSION = {
  id: 'rec', type: 'note', state: 'done',
  title: '笔记', timeOfDay: '16:23', dur: '00:03:24',
  preview: '当前正在录制 — 音源：麦克风 + 系统音',
};

function ListItem({ item, selected, recording }) {
  const stateBadge = item.state === 'pending'
    ? <div className="lib-item-badge is-pending">
        <span className="spin">{Icons.refresh(10)}</span>
        <span>{item.progress ?? 0}%</span>
      </div>
    : item.state === 'failed'
    ? <div className="lib-item-badge is-failed">
        <span>⚠</span><span>转录失败</span>
      </div>
    : null;

  return (
    <div
      className={['lib-item', selected && 'is-selected', recording && 'is-recording'].filter(Boolean).join(' ')}
      data-type={item.type}
    >
      <span className="lib-item-dot"/>
      <div className="lib-item-title">
        <b>{item.title}</b>
        {recording ? <span className="rec-tag">（录制中）</span> : <span className="timeofday">{item.timeOfDay}</span>}
      </div>
      {stateBadge ?? <div className="lib-item-dur">{item.dur}</div>}
      <div className="lib-item-preview">{item.preview}</div>
    </div>
  );
}

function TypeChip({ type, label, active }) {
  return <button className={'chip' + (active ? ' is-active' : '')} data-type={type}>{label}</button>;
}

function ChipRow({ active }) {
  return (
    <div className="chip-row">
      <TypeChip type="all" label="全部" active={active === 'all'} />
      <TypeChip type="general" label="通用" active={active === 'general'} />
      <TypeChip type="meeting" label="会议" active={active === 'meeting'} />
      <TypeChip type="note" label="笔记" active={active === 'note'} />
      <TypeChip type="interviewer" label="面试官" active={active === 'interviewer'} />
      <TypeChip type="candidate" label="面试者" active={active === 'candidate'} />
      <TypeChip type="lecture" label="课程" active={active === 'lecture'} />
      <TypeChip type="podcast" label="播客" active={active === 'podcast'} />
    </div>
  );
}

function Library({ activeChip, selectedId, recordingId, empty }) {
  return (
    <aside className="lib">
      <button className="lib-tool-btn" title="设置">{Icons.gear(16)}</button>
      <div className="lib-search-row">
        <div className="search-input">
          {Icons.search()}
          <input placeholder="搜索录音 / 转录…" readOnly/>
          <span className="search-kbd">⌘F</span>
        </div>
      </div>
      <ChipRow active={activeChip}/>
      {empty
        ? <div className="lib-list-empty">
            <div>这里会显示你的所有录音</div>
            <div>按下 <span className="kbd">⌘⇧R</span> 开始第一次录音</div>
          </div>
        : <div className="lib-list">
            {recordingId && (<ListItem item={RECORDING_SESSION} selected={selectedId === recordingId} recording/>)}
            {LIBRARY.map(group => (
              <div key={group.group}>
                <div className="lib-group-head">{group.group}</div>
                {group.items.map(item => (
                  <ListItem key={item.id} item={item} selected={item.id === selectedId} />
                ))}
              </div>
            ))}
          </div>
      }
    </aside>
  );
}

function DetailData() {
  return (
    <section className="detail">
      <header className="dh">
        <span className="dh-title">面试官 2026-05-16 14:30</span>
        <span className="type-badge" data-type="interviewer">{Icons.glyph.interviewer()}面试官</span>
        <span className="dh-meta">
          <span>01:12:34</span><span className="dot-sep"/>
          <span>已完成</span><span className="dot-sep"/>
          <span>2 人</span>
        </span>
        <div className="dh-actions">
          <button className="icon-btn" title="重新转录">{Icons.refresh()}</button>
          <button className="icon-btn" title="导出">{Icons.download()}</button>
          <button className="icon-btn" title="更多">{Icons.more()}</button>
        </div>
      </header>
      <div className="wf">
        <Waveform progress={0.0192} bars={240} height={48} color="var(--accent)" track="var(--border-strong)"/>
        <div className="wf-playhead" style={{ left: 'calc(16px + 1.92% * 0.96)' }}/>
      </div>
      <div className="pc">
        <button className="pc-play" title="播放">{Icons.play(11)}</button>
        <div className="pc-time">
          <span className="now">00:14</span><span className="sep">/</span><span className="total">01:12:34</span>
        </div>
        <div className="pc-right">
          <button className="pc-btn">{Icons.skipBack()}<span>15s</span></button>
          <button className="pc-btn"><span>1.0×</span>{Icons.chevronDown()}</button>
          <button className="pc-btn"><span>15s</span>{Icons.skipForward()}</button>
        </div>
      </div>
      <div className="tx-summary"><Transcript/><div className="tx-divider"/><Summary/></div>
    </section>
  );
}

function Transcript() {
  return (
    <div className="tx">
      <div className="tx-head">
        转录
        <div className="tx-head-right">
          <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--speaker-1)' }}/>麦克风
          </span>
          <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--speaker-2)' }}/>系统音
          </span>
        </div>
      </div>
      <div className="tx-list">
        {TRANSCRIPT.map((seg, i) => (
          <div key={i} className={'tx-seg' + (i === CURRENT_SEG_IDX ? ' is-current' : '')} data-sp={seg.sp}>
            <span className="tx-seg-time">{seg.t}</span>
            <span className="tx-seg-speaker">
              <span className="sp-dot"/><span className="sp-letter">{seg.sp === '1' ? 'M' : 'S'}</span>
            </span>
            <span className="tx-seg-text">{seg.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Summary() {
  return (
    <div className="sm">
      <div className="sm-head">AI 摘要<span className="template">{Icons.template()}面试评估</span></div>
      <div className="sm-body">
        <div className="sm-section">
          <h4>候选人定位</h4>
          <ul>
            <li>5 年后端经验，过去一年在 B 端 SaaS 做数据分析平台，<b>负责 OLAP 架构选型与落地</b></li>
            <li>团队规模 4 人，本人为技术 owner</li>
          </ul>
        </div>
        <div className="sm-section">
          <h4>表现亮点</h4>
          <ul>
            <li><span className="tag">01:38</span>能讲清楚 MySQL → ClickHouse 的迁移动机，关注 QPS 上量后的真实瓶颈</li>
            <li><span className="tag">02:01</span>调研流程结构化（吞吐 / 延迟 / 运维），不是凭直觉选型</li>
          </ul>
        </div>
        <div className="sm-section">
          <h4>待验证</h4>
          <ul>
            <li>ClickHouse 集群运维细节（副本 / shard 拆分策略）</li>
            <li>Druid 预聚合的 schema 设计，是否考虑过维度爆炸</li>
          </ul>
        </div>
        <div className="sm-section">
          <h4>综合建议</h4>
          <ul><li>推进至下一轮（系统设计专项面）</li></ul>
        </div>
      </div>
      <div className="sm-actions">
        <button className="btn btn-secondary btn-compact">{Icons.template()}换模板</button>
        <button className="btn btn-secondary btn-compact">{Icons.copy()}复制</button>
      </div>
    </div>
  );
}

function DetailRecording() {
  return (
    <section className="detail">
      <header className="dh">
        <span className="dh-title">笔记 2026-05-16 16:23</span>
        <span className="type-badge" data-type="note">{Icons.glyph.note()}笔记</span>
        <span className="dh-meta">
          <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
            <span className="record-dot"/>
            <span style={{ fontFamily:'var(--font-mono)', fontWeight:600, color:'var(--record)', fontVariantNumeric:'tabular-nums' }}>03:24</span>
          </span>
          <span className="dot-sep"/><span>麦克风 + 系统音</span>
        </span>
        <div className="dh-actions" style={{ gap: 8 }}>
          <button className="btn-rec-pause">{Icons.pause(11)}暂停</button>
          <button className="btn-rec-stop">{Icons.stop(11)}停止并保存</button>
        </div>
      </header>
      <div className="wf"><LiveWaveform/></div>
      <div className="pc is-disabled">
        <button className="pc-play">{Icons.play(11)}</button>
        <div className="pc-time">
          <span className="now">—:—</span><span className="sep">/</span><span className="total">03:24</span>
        </div>
        <div className="pc-right">
          <button className="pc-btn">{Icons.skipBack()}<span>15s</span></button>
          <button className="pc-btn"><span>1.0×</span>{Icons.chevronDown()}</button>
          <button className="pc-btn"><span>15s</span>{Icons.skipForward()}</button>
        </div>
      </div>
      <div className="tx-summary">
        <div className="tx">
          <div className="tx-head">
            转录
            <div className="tx-head-right" style={{ color:'var(--text-subtle)' }}>录音结束后自动开始</div>
          </div>
          <div className="tx-placeholder">
            <div className="skeleton-stack">
              {[0,1,2,3,4,5].map(i => (
                <div className="sk-row" key={i}>
                  <div className="sk-bar" style={{ width: 32, height: 8 }}/>
                  <div className="sk-bar" style={{ width: 14, height: 8, borderRadius: '50%' }}/>
                  <div className="sk-bar" style={{ width: `${60 + (i * 7) % 36}%` }}/>
                </div>
              ))}
            </div>
            <div className="hint">录音结束后转录 · 在 设置 → 转录 中开启实时字幕</div>
          </div>
        </div>
        <div className="tx-divider"/>
        <div className="sm is-disabled">
          <div className="sm-head">AI 摘要<span className="template" style={{ color:'var(--text-subtle)' }}>{Icons.template()}笔记模板</span></div>
          <div className="sm-placeholder">
            <div className="icon-box">{Icons.template(20)}</div>
            <div className="hint" style={{ fontSize: 13, color: 'var(--text-muted)' }}>录音结束后生成</div>
            <div className="hint">将根据当前会话类型自动套用「笔记模板」</div>
          </div>
          <div className="sm-actions">
            <button className="btn btn-secondary btn-compact">{Icons.template()}换模板</button>
            <button className="btn btn-secondary btn-compact">{Icons.copy()}复制</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveWaveform() {
  const bars = 220;
  const arr = React.useMemo(() => {
    const out = []; let seed = 4421;
    for (let i = 0; i < bars; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const r = seed / 233280;
      const recency = i / bars;
      const env = 0.3 + 0.6 * recency;
      const local = 0.3 + 0.8 * Math.pow(r, 1.3);
      const pocket = (i % 53 < 3) ? 0.3 : 1;
      out.push(Math.max(0.08, env * local * pocket));
    }
    return out;
  }, []);
  const height = 48;
  return (
    <svg className="wf-canvas" viewBox={`0 0 ${bars * 4} ${height}`} preserveAspectRatio="none">
      {arr.map((v, i) => {
        const h = Math.max(1, v * (height - 4));
        const y = (height - h) / 2;
        const isHead = i > bars - 8;
        return (
          <rect key={i} x={i * 4 + 1} y={y} width={2} height={h} rx={1}
                fill="var(--record)" opacity={isHead ? 0.95 : 0.6}/>
        );
      })}
    </svg>
  );
}

// ============ DETAIL: empty (§6.2) ============
function DetailEmpty() {
  return (
    <section className="detail">
      <div className="empty-stage">
        <div className="icon-circle">{Icons.glyph.note(24)}</div>
        <h2>还没有录音</h2>
        <div className="sub">
          <span>按</span>
          <span className="kbd">⌘</span><span className="kbd">⇧</span><span className="kbd">R</span>
          <span>开始第一次录音</span>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 8 }}>开始录音</button>
        <div className="empty-tips">
          <div className="row"><span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-subtle)' }}/>录音会同时捕获麦克风和系统音</div>
          <div className="row"><span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-subtle)' }}/>所有数据保存在本地，不上传任何服务器</div>
          <div className="row"><span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-subtle)' }}/>可在「设置 → 快捷键」修改触发键</div>
        </div>
      </div>
    </section>
  );
}

// ============ DETAIL: transcribing (§6.3) ============
function DetailTranscribing() {
  return (
    <section className="detail">
      <header className="dh">
        <span className="dh-title">产品发布评审 — Q2 GTM</span>
        <span className="type-badge" data-type="meeting">{Icons.glyph.meeting()}会议</span>
        <span className="dh-meta">
          <span>00:52:18</span><span className="dot-sep"/>
          <span style={{ color: 'var(--warning)' }}>转录中</span><span className="dot-sep"/>
          <span>5 分钟前停止</span>
        </span>
        <div className="dh-actions">
          <button className="icon-btn" title="重新转录">{Icons.refresh()}</button>
          <button className="icon-btn" title="导出">{Icons.download()}</button>
          <button className="icon-btn" title="更多">{Icons.more()}</button>
        </div>
      </header>
      <div className="wf"><Waveform progress={0} bars={240} height={48} color="var(--accent)" track="var(--border-strong)"/></div>
      <div className="pc is-disabled">
        <button className="pc-play">{Icons.play(11)}</button>
        <div className="pc-time"><span className="now">00:00</span><span className="sep">/</span><span className="total">00:52:18</span></div>
        <div className="pc-right">
          <button className="pc-btn">{Icons.skipBack()}<span>15s</span></button>
          <button className="pc-btn"><span>1.0×</span>{Icons.chevronDown()}</button>
          <button className="pc-btn"><span>15s</span>{Icons.skipForward()}</button>
        </div>
      </div>
      <div className="tx-summary">
        <div className="tx">
          <div className="tx-progress">
            <span className="label">
              <span className="spin">{Icons.refresh(12)}</span>
              正在转录 · 本地 whisper.cpp · medium-zh
            </span>
            <div className="bar"><div className="bar-fill" style={{ width: '34%' }}/></div>
            <span className="pct">34%</span>
            <button className="pc-btn" style={{ height: 24, padding: '0 8px', fontSize: 11 }}>取消</button>
          </div>
          <div className="tx-placeholder">
            <div className="skeleton-stack">
              {[0,1,2,3,4,5,6].map(i => (
                <div className="sk-row" key={i}>
                  <div className="sk-bar" style={{ width: 32, height: 8 }}/>
                  <div className="sk-bar" style={{ width: 14, height: 8, borderRadius: '50%' }}/>
                  <div className="sk-bar" style={{ width: `${55 + (i * 11) % 42}%` }}/>
                </div>
              ))}
            </div>
            <div className="hint">预计剩余 ~1 分 20 秒</div>
          </div>
        </div>
        <div className="tx-divider"/>
        <div className="sm is-disabled">
          <div className="sm-head">AI 摘要<span className="template" style={{ color:'var(--text-subtle)' }}>{Icons.template()}会议纪要</span></div>
          <div className="sm-placeholder">
            <div className="icon-box">{Icons.template(20)}</div>
            <div className="hint" style={{ fontSize: 13, color: 'var(--text-muted)' }}>转录完成后生成</div>
            <div className="hint">将根据当前会话类型自动套用「会议纪要」</div>
          </div>
          <div className="sm-actions">
            <button className="btn btn-secondary btn-compact">{Icons.template()}换模板</button>
            <button className="btn btn-secondary btn-compact">{Icons.copy()}复制</button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============ DETAIL: failed (§6.3) ============
function DetailFailed() {
  return (
    <section className="detail">
      <header className="dh">
        <span className="dh-title">通勤路上想法 2026-05-16 08:30</span>
        <span className="type-badge" data-type="general">{Icons.glyph.general()}通用</span>
        <span className="dh-meta">
          <span>00:00:42</span><span className="dot-sep"/>
          <span style={{ color: 'var(--danger)' }}>转录失败</span>
        </span>
        <div className="dh-actions">
          <button className="icon-btn" title="重新转录">{Icons.refresh()}</button>
          <button className="icon-btn" title="导出">{Icons.download()}</button>
          <button className="icon-btn" title="更多">{Icons.more()}</button>
        </div>
      </header>
      <div className="wf"><Waveform progress={0} bars={240} height={48} color="var(--accent)" track="var(--border-strong)"/></div>
      <div className="pc">
        <button className="pc-play" title="播放">{Icons.play(11)}</button>
        <div className="pc-time"><span className="now">00:00</span><span className="sep">/</span><span className="total">00:00:42</span></div>
        <div className="pc-right">
          <button className="pc-btn">{Icons.skipBack()}<span>15s</span></button>
          <button className="pc-btn"><span>1.0×</span>{Icons.chevronDown()}</button>
          <button className="pc-btn"><span>15s</span>{Icons.skipForward()}</button>
        </div>
      </div>
      <div className="tx-summary">
        <div className="tx">
          <div className="tx-head">
            转录<div className="tx-head-right" style={{ color: 'var(--danger)' }}><span>⚠ 失败</span></div>
          </div>
          <div className="error-stage">
            <div className="err-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>
              </svg>
            </div>
            <h3>网络连接超时</h3>
            <div className="err-msg">
              转录引擎设置为「云端 API」，但请求 <code style={{ fontFamily: 'var(--font-mono)' }}>api.openai.com</code> 时超时。录音文件已完整保存，可重试或切换至本地引擎。
            </div>
            <div className="err-detail">
{`POST https://api.openai.com/v1/audio/transcriptions
ECONNRESET — connect ETIMEDOUT 17.253.144.10:443
[2026-05-16 08:31:14] retried 3× · backoff 0.5s / 1s / 2s`}
            </div>
            <div className="err-actions">
              <button className="btn btn-primary">{Icons.refresh()}重试</button>
              <button className="btn btn-secondary">改用本地引擎</button>
              <button className="link">查看完整日志 →</button>
            </div>
          </div>
        </div>
        <div className="tx-divider"/>
        <div className="sm is-disabled">
          <div className="sm-head">AI 摘要<span className="template" style={{ color:'var(--text-subtle)' }}>{Icons.template()}通用模板</span></div>
          <div className="sm-placeholder">
            <div className="icon-box">{Icons.template(20)}</div>
            <div className="hint" style={{ fontSize: 13, color: 'var(--text-muted)' }}>转录失败 — 等待重试</div>
            <div className="hint">摘要将在转录完成后生成</div>
          </div>
          <div className="sm-actions">
            <button className="btn btn-secondary btn-compact">{Icons.template()}换模板</button>
            <button className="btn btn-secondary btn-compact">{Icons.copy()}复制</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MainWindow({
  theme = 'light', chrome = 'mac', state = 'data',
  selectedId, activeChip = 'all',
}) {
  const recordingId = state === 'recording' ? 'rec' : null;
  const empty = state === 'empty';
  const effSelected =
    state === 'recording'    ? 'rec' :
    state === 'transcribing' ? 'sT'  :
    state === 'failed'       ? 'sF'  :
    state === 'empty'        ? null  :
    selectedId || 's1';
  const detail =
    state === 'empty'        ? <DetailEmpty/>        :
    state === 'recording'    ? <DetailRecording/>    :
    state === 'transcribing' ? <DetailTranscribing/> :
    state === 'failed'       ? <DetailFailed/>       :
                               <DetailData/>;
  return (
    <div className={chrome === 'win' ? 'win-window' : 'mac-window'} data-theme={theme}>
      {/* implicit drag region */}
      <div className="drag-region"/>

      {chrome === 'mac' && (
        <div className="mac-traffic-overlay">
          <span className="tl-close"/><span className="tl-min"/><span className="tl-max"/>
        </div>
      )}
      {chrome === 'win' && (
        <div className="win-controls-overlay">
          <button className="win-ctl" title="最小化">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><path d="M1 5h8"/></svg>
          </button>
          <button className="win-ctl" title="最大化">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="1" y="1" width="8" height="8"/></svg>
          </button>
          <button className="win-ctl close" title="关闭">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><path d="m1 1 8 8M9 1l-8 8"/></svg>
          </button>
        </div>
      )}

      <div className="mw-body">
        <Library activeChip={activeChip} selectedId={effSelected} recordingId={recordingId} empty={empty}/>
        {detail}
      </div>
    </div>
  );
}

window.MainWindow = MainWindow;
