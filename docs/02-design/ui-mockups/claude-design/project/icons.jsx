// Icons.jsx — minimal inline SVG icons, stroke-based, currentColor.
// Style: 1.5 stroke, line caps round, optimized for 14–16px display.
const Icons = {
  search: (s=14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>
    </svg>
  ),
  gear: (s=14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.2"/>
      <path d="M8 1.5v1.7M8 12.8v1.7M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M1.5 8h1.7M12.8 8h1.7M3.4 12.6l1.2-1.2M11.4 4.6l1.2-1.2"/>
    </svg>
  ),
  refresh: (s=14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.95"/>
      <path d="M13.5 2.5V5h-2.5"/>
    </svg>
  ),
  download: (s=14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8.5"/><path d="m4.5 7 3.5 3.5L11.5 7"/><path d="M3 13.5h10"/>
    </svg>
  ),
  more: (s=14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/>
    </svg>
  ),
  play: (s=12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="currentColor">
      <path d="M3 1.5v9l8-4.5L3 1.5z"/>
    </svg>
  ),
  pause: (s=12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="currentColor">
      <rect x="3" y="2" width="2.2" height="8" rx="0.5"/>
      <rect x="6.8" y="2" width="2.2" height="8" rx="0.5"/>
    </svg>
  ),
  stop: (s=12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="currentColor">
      <rect x="2.5" y="2.5" width="7" height="7" rx="1"/>
    </svg>
  ),
  skipBack: (s=14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4.5 5 8l6 3.5V4.5z"/><path d="M5 4v8"/>
    </svg>
  ),
  skipForward: (s=14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4.5 11 8l-6 3.5V4.5z"/><path d="M11 4v8"/>
    </svg>
  ),
  copy: (s=14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="8.5" height="9" rx="1.5"/>
      <path d="M10.5 5V3.5A1 1 0 0 0 9.5 2.5h-6A1 1 0 0 0 2.5 3.5v7A1 1 0 0 0 3.5 11.5H5"/>
    </svg>
  ),
  chevronDown: (s=12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 4.5 3 3 3-3"/>
    </svg>
  ),
  template: (s=12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="8" height="8" rx="1"/>
      <path d="M2 4.8h8M5 4.8v5.2"/>
    </svg>
  ),
  // Session-type glyphs — used for detail header type badge only.
  glyph: {
    general:     (s=12) => <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="6" r="3.5"/></svg>,
    meeting:     (s=12) => <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="3.5" cy="4.5" r="1.4"/><circle cx="8.5" cy="4.5" r="1.4"/><path d="M1.5 10c.4-1.4 1.6-2.2 2-2.2M10.5 10c-.4-1.4-1.6-2.2-2-2.2"/></svg>,
    note:        (s=12) => <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 1.5h4.5L9.5 3.5V10a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z"/><path d="M4.5 5h3M4.5 7h3"/></svg>,
    interviewer: (s=12) => <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="8" height="6" rx="0.8"/><path d="M4.5 4V2.5h3V4"/></svg>,
    candidate:   (s=12) => <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="4.2" r="1.8"/><path d="M2.5 10c.5-1.8 2-2.8 3.5-2.8s3 1 3.5 2.8"/></svg>,
    lecture:     (s=12) => <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 4 6 2l4.5 2L6 6 1.5 4z"/><path d="M3.5 5v2.5c0 .8 1.1 1.5 2.5 1.5s2.5-.7 2.5-1.5V5"/></svg>,
    podcast:     (s=12) => <svg width={s} height={s} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="4.5" y="2" width="3" height="5" rx="1.5"/><path d="M3 6.5c0 1.5 1.3 2.7 3 2.7s3-1.2 3-2.7M6 9.2v1.3"/></svg>,
  }
};

window.Icons = Icons;
