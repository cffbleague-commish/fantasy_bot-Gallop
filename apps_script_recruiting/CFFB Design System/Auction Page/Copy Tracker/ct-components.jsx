// CFFB · Copy Tracker — shared atoms (mirrors the Auction Board vocabulary)

const { useState: useStateA } = React;

const ctInitials = (name) => {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] || '');
  return (a + b).toUpperCase();
};
const ctPosTextColor = (pos) => (pos === 'LB' || pos === 'DB' || pos === 'DL' ? '#F5F5F5' : '#0A0A0A');

// ---- Headshot (initials avatar w/ position accent) ------------------------
const Shot = ({ name, pos, size = 38 }) => (
  <div className="ct-shot" style={{ width: size, height: size }}>
    <span className="ct-shot__initials" style={{ fontSize: Math.round(size * 0.4) }}>{ctInitials(name)}</span>
    <span className="ct-shot__accent" style={{ background: POS_COLORS[pos] || '#5A5A5A' }} />
  </div>
);

// ---- Large profile portrait slot (PlayerCardExpanded lineage) -------------
const PortraitSlot = ({ name, pos, cls }) => (
  <div className="ct-portrait">
    <div className="ct-portrait__bar" style={{ background: POS_COLORS[pos] || '#5A5A5A' }} />
    <div className="ct-portrait__empty">
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="20" r="9" /><path d="M10 50 C10 38 18 32 28 32 C38 32 46 38 46 50" />
      </svg>
      <div className="ct-portrait__label">Photo</div>
    </div>
    <span className="ct-portrait__class">{(cls || '').toUpperCase()}</span>
    <span className="ct-portrait__initials">{ctInitials(name)}</span>
  </div>
);

// ---- Position tag ----------------------------------------------------------
const PosTag = ({ pos }) => (
  <span className="ct-pos-tag" style={{ background: POS_COLORS[pos] || '#5A5A5A', color: ctPosTextColor(pos) }}>{pos}</span>
);

// ---- Stars -----------------------------------------------------------------
const STAR_COLOR = { 5: '#C9A227', 4: '#3B82C4', 3: '#7BA4C9', 2: '#6A6A6A', 1: '#4A4A4A' };
const Stars = ({ n, size = 16 }) => (
  <span className="ct-stars" style={{ fontSize: size }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <span key={i} style={{ color: i <= n ? STAR_COLOR[n] : '#262626' }}>★</span>
    ))}
  </span>
);

// ---- Conference badge (logo + name) ---------------------------------------
const ConfBadge = ({ id, size = 22, showName = true }) => (
  <span className="ct-conf">
    <img className="ct-conf__logo" src={CONF_LOGO[id]} alt={CONF_NAME[id]} style={{ width: size, height: size }} />
    {showName && <span className="ct-conf__name">{CONF_NAME[id]}</span>}
  </span>
);

// ---- Team logo PILL (fallback: abbr on team color w/ conf accent edge) -----
const TeamPill = ({ id, h = 24 }) => {
  const t = TEAMS[id] || { bg: '#2A2A2A', fg: '#9A9A9A', abbr: '??', conf: 'ind' };
  if (t.pill) {
    return <span className="ct-pill ct-pill--img" style={{ height: h }}><img src={t.pill} alt={t.name} /></span>;
  }
  const abbr = t.abbr.length > 4 ? t.abbr.slice(0, 4) : t.abbr;
  return (
    <span className="ct-pill ct-pill--fb" style={{ height: h, borderRadius: Math.round(h * 0.22) }} title={t.name}>
      <span className="ct-pill__edge" style={{ width: Math.round(h * 0.6), background: CONF_ACCENT[t.conf] || '#5A5A5A' }} />
      <span className="ct-pill__body" style={{ background: t.bg, color: t.fg, fontSize: Math.max(11, Math.round(h * 0.46)) }}>{abbr}</span>
    </span>
  );
};

// ---- Status chip (Available / In Process / Sold) --------------------------
const StatusChip = ({ status, size = 'md' }) => {
  const m = STATUS_META[status];
  return (
    <span className={'ct-status ct-status--' + status + ' ct-status--' + size}>
      <span className="ct-status__dot" style={{ background: m.color }} />
      <span className="ct-status__label">{m.label}</span>
    </span>
  );
};

// ---- Delta chip (+$8 green / −$5 red) -------------------------------------
const Delta = ({ value }) => {
  if (value == null) return null;
  const pos = value > 0;
  return (
    <span className={'ct-delta ' + (pos ? 'is-pos' : value < 0 ? 'is-neg' : 'is-flat')}>
      {pos ? '+' : '−'}${Math.abs(value)}
    </span>
  );
};

Object.assign(window, { Shot, PortraitSlot, PosTag, Stars, ConfBadge, TeamPill, StatusChip, Delta });
