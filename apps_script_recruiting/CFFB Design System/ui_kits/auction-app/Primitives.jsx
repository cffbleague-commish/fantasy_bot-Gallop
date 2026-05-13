// CFFB UI Kit · Shared primitives (compositional building blocks)
// Exposed via window so other Babel-transpiled scripts can use them.

const TEAMS = {
  TEX:  { name: 'Texas',       bg: '#BF5700', fg: '#FFFFFF', conf: 'sec' },
  UGA:  { name: 'Georgia',     bg: '#990000', fg: '#FEC10C', conf: 'sec' },
  OSU:  { name: 'Ohio State',  bg: '#BB0000', fg: '#FFFFFF', conf: 'b1g' },
  MICH: { name: 'Michigan',    bg: '#00274C', fg: '#FFCB05', conf: 'b1g' },
  USC:  { name: 'USC',         bg: '#841617', fg: '#F2A900', conf: 'b1g' },
  BAMA: { name: 'Alabama',     bg: '#C8102E', fg: '#FFFFFF', conf: 'sec' },
  ND:   { name: 'Notre Dame',  bg: '#D7A22A', fg: '#0A0A0A', conf: 'ind' },
  UF:   { name: 'Florida',     bg: '#0021A5', fg: '#FA4616', conf: 'sec' },
  ORE:  { name: 'Oregon',      bg: '#154733', fg: '#FEE123', conf: 'b1g' },
  LSU:  { name: 'LSU',         bg: '#461D7C', fg: '#FDD023', conf: 'sec' },
  PSU:  { name: 'Penn State',  bg: '#041E42', fg: '#FFFFFF', conf: 'b1g' },
  MIA:  { name: 'Miami',       bg: '#F47321', fg: '#005030', conf: 'acc' },
};

const POS_COLORS = {
  QB: '#C9A227',  RB: '#3B82C4',  WR: '#7BA4C9',  TE: '#E8C547',
  OL: '#6A6A6A',  DL: '#8B6F1F',  LB: '#B84545',  DB: '#5A5A5A',  ATH: '#9A9A9A',
};

const CONF_STYLES = {
  sec:   { bg: 'rgba(201,162,39,0.18)', fg: '#C9A227', border: 'rgba(201,162,39,0.4)', label: 'SEC' },
  b1g:   { bg: 'rgba(74,111,165,0.18)', fg: '#7DA0CC', border: 'rgba(74,111,165,0.4)', label: 'B1G' },
  acc:   { bg: 'rgba(139,74,92,0.2)',   fg: '#C58DA0', border: 'rgba(139,74,92,0.45)', label: 'ACC' },
  big12: { bg: 'rgba(184,69,69,0.18)',  fg: '#D88787', border: 'rgba(184,69,69,0.4)',  label: 'Big 12' },
  pac:   { bg: 'rgba(92,122,106,0.2)',  fg: '#9CB8A8', border: 'rgba(92,122,106,0.45)',label: 'Pac-12' },
  ind:   { bg: '#1C1C1C',               fg: '#9A9A9A', border: '#2A2A2A',              label: 'Indep.' },
};

const TeamChip = ({ code, size = 'md' }) => {
  const t = TEAMS[code] || { bg: '#3A3A3A', fg: '#9A9A9A' };
  const sz = { sm: 24, md: 32, lg: 48, xl: 64, '2xl': 80 }[size] || 32;
  const fs = { sm: 9, md: 11, lg: 14, xl: 18, '2xl': 22 }[size] || 11;
  return (
    <div className="bid-row__team" style={{ background: t.bg, color: t.fg, width: sz, height: sz, fontSize: fs }}>
      {code}
    </div>
  );
};

const PosTag = ({ pos }) => (
  <div className="bid-row__pos" style={{ background: POS_COLORS[pos] || '#5A5A5A', color: pos === 'LB' || pos === 'DB' ? '#fff' : '#0A0A0A' }}>
    {pos}
  </div>
);

const ConfTag = ({ conf }) => {
  const s = CONF_STYLES[conf] || CONF_STYLES.ind;
  return (
    <span className="otc__tag-conf" style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
};

const Stars = ({ count, tier, size = 14 }) => {
  const color = { 5: '#C9A227', 4: '#3B82C4', 3: '#7BA4C9', 2: '#6A6A6A', 1: '#4A4A4A' }[tier || count] || '#C9A227';
  return (
    <div style={{ display: 'inline-flex', gap: 1, color, fontSize: size, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= count ? color : '#2A2A2A' }}>★</span>
      ))}
    </div>
  );
};

const GradeBadge = ({ grade, size = 'md' }) => {
  const top = grade.startsWith('A');
  const bg = top
    ? 'linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%)'
    : grade.startsWith('B') ? '#2D7A4E'
    : grade.startsWith('C') ? '#C9A227'
    : '#B84545';
  const fg = top || grade.startsWith('C') ? '#0A0A0A' : '#F5F5F5';
  const fs = { sm: 14, md: 20, lg: 32 }[size] || 20;
  return (
    <div className="lb__grade" style={{ background: bg, color: fg, fontSize: fs, padding: size === 'lg' ? '6px 14px' : '4px 0' }}>
      {grade}
    </div>
  );
};

const ValueDelta = ({ value, size = 'md' }) => {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  const cls = value > 0 ? 'cffb-delta--pos' : value < 0 ? 'cffb-delta--neg' : 'cffb-delta--flat';
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '·';
  const fs = { sm: 12, md: 13, lg: 18 }[size] || 13;
  const color = value > 0 ? '#2D7A4E' : value < 0 ? '#B84545' : '#5A5A5A';
  return (
    <span style={{ color, fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: fs, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <span style={{ fontSize: '0.85em' }}>{arrow}</span>{sign}${Math.abs(value)}
    </span>
  );
};

const LiveIndicator = ({ label = 'LIVE · ROUND 4' }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
    <div style={{
      width: 22, height: 22, borderRadius: '50%',
      background: 'conic-gradient(from 0deg, #E8C547, #C9A227, #8B6F1F, #C9A227, #E8C547)',
      padding: '1.5px',
      animation: 'ring-spin 4s linear infinite',
    }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'ring-spin 4s linear infinite reverse' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2D7A4E', boxShadow: '0 0 8px rgba(45,122,78,0.85)', animation: 'cffb-live-dot-pulse 1.4s ease-in-out infinite' }} />
      </div>
    </div>
    <span style={{ fontFamily: 'Saira Condensed, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#F5F5F5' }}>{label}</span>
  </div>
);

const KpiTile = ({ label, value, sub, subTone, hero }) => (
  <div className="kpi">
    <div className="kpi__label">{label}</div>
    <div className={'kpi__val' + (hero ? ' kpi__val--hero' : '')}>{value}</div>
    {sub && <div className={'kpi__sub' + (subTone === 'pos' ? ' kpi__sub--pos' : subTone === 'neg' ? ' kpi__sub--neg' : '')}>{sub}</div>}
  </div>
);

const CompositionBar = ({ commits }) => {
  // commits: { 5: 3, 4: 7, 3: 8, 2: 4 }
  const segs = [5, 4, 3, 2].map((tier) => ({ tier, n: commits[tier] || 0 }));
  const total = segs.reduce((s, x) => s + x.n, 0) || 1;
  const colors = { 5: 'linear-gradient(135deg, #E8C547, #C9A227, #8B6F1F)', 4: '#3B82C4', 3: '#7BA4C9', 2: '#6A6A6A' };
  return (
    <div className="lb__bar">
      {segs.map((s) => (
        s.n > 0 && <div key={s.tier} className="lb__bar-seg" style={{ flex: s.n / total, background: colors[s.tier] }} />
      ))}
    </div>
  );
};

Object.assign(window, { TEAMS, POS_COLORS, CONF_STYLES, TeamChip, PosTag, ConfTag, Stars, GradeBadge, ValueDelta, LiveIndicator, KpiTile, CompositionBar });
