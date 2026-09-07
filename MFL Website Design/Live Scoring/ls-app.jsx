// CFFB · Live Scoring — app
// Ports Live Scoring/live-scoring/LiveScoring.dc.html into React, fed by the live
// MFL data layer (ls-data-live.jsx). Keeps the mock's inline-style + cffb-token
// look; swaps the mock's random simulator for a real ~40s poll of MFL liveScoring.
const { useState, useEffect, useRef } = React;

// ── Small atoms ───────────────────────────────────────────────────────────────

// Franchise pill: icon image → logo image → colored initials circle. Mirrors the
// Roster Board's TeamChip fallback chain (franchiseDatabase icons can 404).
const Pill = ({ side, size }) => {
  const srcs = [side.pill, side.pill2].filter(Boolean);
  const [step, setStep] = useState(0);
  const src = srcs[step];
  if (src) {
    return React.createElement('img', {
      src, alt: side.abbr,
      onError: () => setStep((s) => s + 1),
      style: { height: size + 'px', width: 'auto', flex: 'none', display: 'block', objectFit: 'contain', maxWidth: (size * 2.4) + 'px' },
    });
  }
  const fs = Math.max(7, Math.round(size * 0.32));
  return (
    <span style={{
      width: size + 'px', height: size + 'px', borderRadius: '50%', flex: 'none',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: fs + 'px',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.1)',
      background: side.color || 'var(--border-strong)', color: side.txt || 'var(--fg-primary)',
    }}>{side.abbr}</span>
  );
};

// Player avatar: colored position bar + initials, with the MFL headshot on top
// (removed on error so the initials show through).
const Avatar = ({ p, size }) => {
  const [err, setErr] = useState(false);
  const sz = size || 34;
  return (
    <span style={{
      position: 'relative', width: sz + 'px', height: sz + 'px', borderRadius: '5px',
      background: 'var(--bg-surface-elev)', overflow: 'hidden',
      outline: '1px dashed rgba(201,162,39,.28)', outlineOffset: '-4px', flex: 'none',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: POS_COLORS[p.pos] || 'var(--border-strong)' }} />
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: Math.round(sz * 0.38) + 'px', letterSpacing: '.04em', color: '#5A5A5A' }}>{p.initials}</span>
      {p.photo && !err && React.createElement('img', {
        src: p.photo, alt: '', loading: 'lazy', onError: () => setErr(true),
        style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
      })}
    </span>
  );
};

const stColor = (st) => (st === 'LIVE' ? '#57B87F' : st === 'PRE' ? 'var(--fg-secondary)' : 'var(--fg-tertiary)');
const fmt = (n) => (typeof n === 'number' ? n.toFixed(2) : '—');

// ── Per-team color ────────────────────────────────────────────────────────────
// MFL exposes no franchise color field, so we sample each team's real color from
// its logo (the MFL-hosted logo is same-origin on the page → canvas-safe; the
// imgur icon works too when it sends CORS, otherwise it taints and we skip it).
// Falls back to a distinct, stable hash color so two same-conference teams never
// render the same. Resolved colors are cached module-wide across re-renders.
const LS_TEAM_COLOR = {};
function hashColor(seed) {
  let h = 0; const s = String(seed || 'x');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'hsl(' + (h % 360) + ',58%,52%)';
}
function extractLogoColor(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const n = 40, cv = document.createElement('canvas');
        cv.width = n; cv.height = n;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, n, n);
        const d = ctx.getImageData(0, 0, n, n).data;
        // Histogram the VIBRANT pixels into coarse color buckets, then pick the
        // most prominent bucket. Averaging every pixel (the old approach) blended
        // a team's colors into mud; picking the dominant saturated bucket returns
        // the actual primary color. Grays / near-white / near-black are dropped.
        const bins = {};
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
          if (a < 160) continue;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const lum = (mx + mn) / 2;
          const sat = mx === 0 ? 0 : (mx - mn) / mx;
          if (lum < 30 || lum > 228) continue;      // skip near-black / near-white
          if (sat < 0.28) continue;                 // skip grays — the muddy culprit
          const key = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5); // 8 levels/channel
          const bin = bins[key] || (bins[key] = { r: 0, g: 0, b: 0, w: 0 });
          const w = 0.4 + sat;                      // favor the most saturated pixels
          bin.r += r * w; bin.g += g * w; bin.b += b * w; bin.w += w;
        }
        let best = null;
        for (const k in bins) { if (!best || bins[k].w > best.w) best = bins[k]; }
        if (!best) return resolve(null);            // no vibrant color → hash fallback
        const to = (x) => Math.round(x / best.w).toString(16).padStart(2, '0');
        resolve('#' + to(best.r) + to(best.g) + to(best.b));
      } catch (e) { resolve(null); }              // tainted canvas → fall back
    };
    img.src = url;
  });
}
// The official sheet color (same as Power Rankings) wins when available; else the
// logo-sampled color; else a distinct stable hash.
const sheetColorOf = (side) => (typeof SHEET_COLOR !== 'undefined' && SHEET_COLOR[side.fid] && SHEET_COLOR[side.fid].bg) || null;
const useTeamColor = (side) => {
  const [color, setColor] = useState(() => sheetColorOf(side) || LS_TEAM_COLOR[side.fid] || hashColor(side.fid || side.abbr));
  useEffect(() => {
    let alive = true;
    const sheet = sheetColorOf(side);
    if (sheet) { setColor(sheet); return; }              // official color — no sampling needed
    if (LS_TEAM_COLOR[side.fid]) { setColor(LS_TEAM_COLOR[side.fid]); return; }
    (async () => {
      const c = (await extractLogoColor(side.pill2)) || (await extractLogoColor(side.pill));
      if (alive && c && !sheetColorOf(side)) { LS_TEAM_COLOR[side.fid] = c; setColor(c); }
    })();
    return () => { alive = false; };
  }, [side.fid]);
  return color;
};

// ── Player row (starters + bench share the same 6-column grid) ────────────────
const GRID = '36px 34px minmax(0,1fr) 118px 52px 44px';

const PlayerRow = ({ p, flash, bench, groupStart }) => {
  const fxColor = flash ? (flash.dir === 'up' ? '#57B87F' : '#D66A6A') : '';
  return (
    <div
      className="ls-row"
      style={{
        display: 'grid', gridTemplateColumns: GRID, gap: '10px', alignItems: 'center',
        padding: bench ? '8px 18px' : '9px 18px',
        borderBottom: '1px solid rgba(42,42,42,' + (bench ? '.4' : '.55') + ')',
        borderTop: groupStart ? '1px solid var(--border-strong)' : undefined,
        opacity: bench ? 0.72 : 1,
        animation: flash ? 'cffb-ls-flash' + flash.dir + ' 2.4s ease-out' : 'none',
      }}
    >
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: (bench ? 11 : 12) + 'px', color: 'var(--fg-tertiary)', letterSpacing: '.04em' }}>{p.pos}</span>
      <Avatar p={p} size={34} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
          {p.playerId && typeof MFL_PLAYER_LINK === 'function' ? (
            <a
              className="ls-plink"
              href={MFL_PLAYER_LINK(p.playerId)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: (bench ? 15 : 16) + 'px', lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >{p.name}</a>
          ) : (
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: (bench ? 15 : 16) + 'px', lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          )}
        </span>
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', font: '600 10px/1.2 var(--font-body)', color: 'var(--fg-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.team || '—'}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', font: '600 10px/1.2 var(--font-body)', marginTop: '2px', color: stColor(p.st) }}>
          {p.isLive && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#57B87F', flex: 'none', animation: 'cffb-ls-pulse 1.6s ease-in-out infinite' }} />}
          {p.gameDetail}
        </span>
      </span>
      <span style={{ textAlign: 'right' }}>
        <span className="cffb-num" style={{ display: 'inline-block', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: (bench ? 16 : 18) + 'px', color: p.st === 'PRE' ? 'var(--fg-tertiary)' : 'var(--fg-primary)', animation: flash ? 'cffb-ls-pop .6s ease-out' : 'none', ...(flash ? { color: fxColor } : {}) }}>{fmt(p.pts)}</span>
        {flash && <span className="cffb-num" style={{ display: 'block', font: '700 10px/1 var(--font-body)', marginTop: '2px', color: fxColor }}>{flash.delta}</span>}
      </span>
      <span className="cffb-num" style={{ textAlign: 'right', fontSize: '12px', color: 'var(--fg-secondary)' }}>{p.proj != null ? fmt(p.proj) : '—'}</span>
    </div>
  );
};

// ── Lineup column (starters + collapsible bench) ──────────────────────────────
const LineupColumn = ({ side, flashes }) => {
  const [openBench, setOpenBench] = useState(true);
  const benchPts = side.bench.reduce((a, p) => a + p.pts, 0);
  const fl = (p) => flashes[side.key + '|' + p.pid];
  return (
    <div style={{ flex: '1 1 460px', minWidth: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', overflowX: 'auto' }}>
      <div style={{ minWidth: '520px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '19px', textTransform: 'uppercase' }}>{side.name}</span>
          <span style={{ marginLeft: 'auto', font: '600 9px/1 var(--font-body)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-tertiary)' }}>Starters</span>
          <span className="cffb-num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '19px', color: 'var(--gold)' }}>{fmt(side.pts)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '10px', alignItems: 'center', padding: '9px 18px', borderBottom: '1px solid var(--border)', font: '600 9px/1 var(--font-body)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--fg-tertiary)' }}>
          <span /><span /><span>Player</span><span>Game</span><span style={{ textAlign: 'right', color: 'var(--gold)' }}>Pts</span><span style={{ textAlign: 'right' }}>Proj</span>
        </div>
        {side.starters.map((p, i, arr) => <PlayerRow key={p.pid} p={p} flash={fl(p)} groupStart={i > 0 && arr[i - 1].pos !== p.pos} />)}
        {side.bench.length > 0 && (
          <div>
            <button
              onClick={() => setOpenBench((o) => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 18px', background: 'var(--bg-surface-elev)', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ font: '700 9px/1 var(--font-body)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--fg-tertiary)' }}>{openBench ? '▾' : '▸'} Bench <span style={{ color: 'var(--fg-secondary)' }}>{side.bench.length}</span></span>
              <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span className="cffb-num" style={{ font: '600 10px/1 var(--font-body)', color: 'var(--fg-tertiary)' }}>{fmt(benchPts)} pts</span>
            </button>
            {openBench && side.bench.map((p, i, arr) => <PlayerRow key={p.pid} p={p} flash={fl(p)} bench groupStart={i > 0 && arr[i - 1].pos !== p.pos} />)}
          </div>
        )}
        {side.onBye && side.onBye.length > 0 && (
          <div className="ls-bye" title="On a bye this week — not playing">
            <span className="ls-bye__lbl">◷ On bye · {side.onBye.length}</span>
            <span className="ls-bye__names">{side.onBye.map((p) => p.name).join(' · ')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Featured scoreboard ───────────────────────────────────────────────────────
// A 3-column grid (pill · name+counts · score) so the score never wraps onto a
// second line and a long team name truncates instead of breaking the layout.
// Home mirrors on desktop and un-mirrors when the board stacks (see ls.css).
const SideBlock = ({ side, home, leading }) => (
  <div className={'ls-sb' + (home ? ' ls-sb--home' : '')}>
    <span className="ls-sb__pill"><Pill side={side} size={64} /></span>
    <div className="ls-sb__id">
      <div className="ls-sb__name" title={side.name}>{side.name}</div>
      <div className="ls-sb__counts">
        <span style={{ color: '#57B87F' }}>{side.playing} playing</span> · {side.left} to play · {side.done} final
      </div>
    </div>
    <div className="ls-sb__score">
      <div className="cffb-num ls-sb__pts" style={{ color: leading ? 'var(--fg-primary)' : 'var(--fg-secondary)' }}>{fmt(side.pts)}</div>
      <div className="ls-sb__proj">Proj <span className="cffb-num" style={{ color: 'var(--fg-secondary)' }}>{fmt(side.proj)}</span></div>
    </div>
  </div>
);

const Scoreboard = ({ m }) => {
  const awayProb = 100 - m.homeProb;
  const awayLead = m.away.pts >= m.home.pts;
  const awayColor = useTeamColor(m.away);
  const homeColor = useTeamColor(m.home);
  return (
    <div style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '28px 28px 24px', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--gold-gradient)' }} />
      <div className="ls-board">
        <SideBlock side={m.away} leading={awayLead} />
        <div className="ls-vs">VS</div>
        <SideBlock side={m.home} home leading={!awayLead} />
      </div>
      <div style={{ marginTop: '24px', paddingTop: '18px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
          <span className="cffb-num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: awayColor }}>{awayProb}%</span>
          <span style={{ font: '600 9px/1 var(--font-body)', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--fg-tertiary)' }} title="Estimated from projected margin — not MFL's official win probability">Win Probability<span style={{ color: 'var(--fg-tertiary)', opacity: 0.7 }}> · est</span></span>
          <span className="cffb-num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: homeColor }}>{m.homeProb}%</span>
        </div>
        <div style={{ display: 'flex', height: '8px', borderRadius: 'var(--r-pill)', overflow: 'hidden', background: 'var(--bg-surface-elev)' }}>
          <span style={{ height: '100%', transition: 'width var(--dur-fast) var(--ease-out), background var(--dur-base)', width: awayProb + '%', background: awayColor }} />
          <span style={{ flex: 1, height: '100%', background: homeColor, boxShadow: 'inset 1px 0 0 rgba(10,10,10,.5)' }} />
        </div>
      </div>
    </div>
  );
};

// ── Around-the-league strip ───────────────────────────────────────────────────
const StripCard = ({ m, i, active, onSelect }) => {
  const live = m.away.playing + m.home.playing;
  const left = m.away.left + m.home.left;
  const status = live > 0 ? 'Live' : left > 0 ? 'In progress' : 'Final';
  const statusColor = live > 0 ? '#57B87F' : 'var(--fg-tertiary)';
  const awayLead = m.away.pts >= m.home.pts;
  const teamLine = (side, lead) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
      <span style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}><Pill side={side} size={18} /></span>
      <span className="cffb-num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: lead ? 'var(--fg-primary)' : 'var(--fg-secondary)' }}>{fmt(side.pts)}</span>
    </div>
  );
  return (
    <button
      onClick={onSelect}
      className="ls-strip-card"
      style={{
        cursor: 'pointer', textAlign: 'left', padding: '8px 10px', borderRadius: 'var(--r-3)',
        fontFamily: 'var(--font-body)', background: active ? 'var(--bg-surface-elev)' : 'var(--bg-surface)',
        border: '1px solid ' + (active ? 'var(--gold)' : 'var(--border)'),
        transition: 'filter var(--dur-fast) var(--ease-out)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
        <span style={{ font: '700 8px/1 var(--font-body)', letterSpacing: '.14em', textTransform: 'uppercase', color: statusColor }}>{status}</span>
        <span style={{ font: '600 8px/1 var(--font-body)', letterSpacing: '.1em', color: 'var(--fg-tertiary)' }}>M{i + 1}</span>
      </div>
      {teamLine(m.away, awayLead)}
      {teamLine(m.home, !awayLead)}
    </button>
  );
};

// ── App ───────────────────────────────────────────────────────────────────────
const POLL_MS = 40000; // MFL live feed refreshes ~every 40s

// ── Conference filter tabs ────────────────────────────────────────────────────
// "All" + one tab per conference that has games this week, each with a game count.
// Active tab picks up its conference accent color; the user's own conference is
// flagged. Filters the around-the-league strip to that conference's matchups.
const ConfTabs = ({ confs, effConf, counts, total, myConf, onPick }) => (
  <div className="ls-conftabs" role="tablist">
    <button
      role="tab" aria-selected={effConf === 'ALL'}
      className={'ls-conftab' + (effConf === 'ALL' ? ' is-active' : '')}
      style={effConf === 'ALL' ? { boxShadow: 'inset 0 -2px 0 var(--gold)', color: 'var(--fg-primary)' } : null}
      onClick={() => onPick('ALL')}
    >All<span className="ls-conftab__n">{total}</span></button>
    {confs.map((c) => (
      <button
        key={c} role="tab" aria-selected={effConf === c}
        className={'ls-conftab' + (effConf === c ? ' is-active' : '')}
        style={effConf === c ? { boxShadow: 'inset 0 -2px 0 ' + CONF_ACCENT[c], color: 'var(--fg-primary)' } : null}
        onClick={() => onPick(c)}
      >
        {CONF_LOGOS[c] && <img className="ls-conflogo" src={CONF_LOGOS[c]} alt="" />}
        <span style={effConf === c ? { color: CONF_ACCENT[c] } : null}>{CONF_LABEL[c] || c.toUpperCase()}</span>
        {c === myConf && <span className="ls-conftab__you">YOU</span>}
        <span className="ls-conftab__n">{counts[c]}</span>
      </button>
    ))}
  </div>
);

const App = () => {
  const seed = (typeof LS_PAYLOAD !== 'undefined' && LS_PAYLOAD) ? LS_PAYLOAD : { week: '', slate: '', matchups: [], flashes: {} };
  const [data, setData] = useState(seed);
  const [conf, setConf] = useState(null);    // selected conference id | 'ALL' | null (→ default to my conference)
  const [selId, setSelId] = useState(null);  // selected matchup id | null (→ default)
  const [flashes, setFlashes] = useState({});

  useEffect(() => {
    let alive = true;
    const timers = [];
    const tick = async () => {
      try {
        const pd = await window.__refreshLiveScoring();
        if (!alive) return;
        setData(pd);
        if (pd.flashes && Object.keys(pd.flashes).length) {
          setFlashes((f) => ({ ...f, ...pd.flashes }));
          timers.push(setTimeout(() => {
            setFlashes((f) => { const n = { ...f }; Object.keys(pd.flashes).forEach((k) => delete n[k]); return n; });
          }, 2400));
        }
      } catch (e) { /* keep last good data; retry next tick */ }
    };
    const iv = setInterval(tick, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(iv); timers.forEach(clearTimeout); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const matchups = data.matchups || [];
  if (!matchups.length) {
    return <div className="cffb-boot">No live matchups for week {data.week || '—'} yet.</div>;
  }

  const myFid = data.myFid;
  const myConf = (typeof TEAMS !== 'undefined' && TEAMS[myFid]) ? TEAMS[myFid].conf : null;

  // A game belongs to a conference if EITHER team is in it (so cross-conference
  // games surface under both). Count games per conference for the tab badges.
  const inConf = (g, c) => g.away.conf === c || g.home.conf === c;
  const counts = {};
  CONF_ORDER.forEach((c) => { counts[c] = matchups.filter((g) => inConf(g, c)).length; });
  // Always show a tab for every conference that exists in the LEAGUE (from the
  // franchise directory), not just those playing this week — so the strip never
  // disappears and a conference on a bye still gets a tab (its filter shows none).
  const confsPresent = CONF_ORDER.filter((c) => (typeof TEAMS !== 'undefined') && Object.keys(TEAMS).some((fid) => TEAMS[fid].conf === c));
  const showConfTabs = confsPresent.length > 1;

  // Effective conference: explicit pick, else the user's conference if it has
  // games, else All.
  const effConf = conf != null ? conf
    : (myConf && counts[myConf]) ? myConf
      : 'ALL';
  const filtered = effConf === 'ALL' ? matchups : matchups.filter((g) => inConf(g, effConf));

  // Effective featured matchup: an explicit pick that is still in view, else the
  // user's own matchup within the filter, else the first game of the filter.
  const myMatchup = matchups.find((g) => g.away.fid === myFid || g.home.fid === myFid);
  const inView = (id) => filtered.some((g) => g.id === id);
  const effSelId = (selId != null && inView(selId)) ? selId
    : (myMatchup && inView(myMatchup.id)) ? myMatchup.id
      : (filtered[0] ? filtered[0].id : null);
  const m = matchups.find((g) => g.id === effSelId) || filtered[0] || matchups[0];

  const anyLive = matchups.some((g) => (g.away.playing + g.home.playing) > 0);
  const pickConf = (c) => { setConf(c); setSelId(null); };  // reset featured into the new conference
  const pickMatchup = (id) => setSelId(id);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 72px', fontFamily: 'var(--font-body)', color: 'var(--fg-primary)' }}>
      {/* Masthead */}
      <div style={{ position: 'relative', padding: '32px 0 26px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px 24px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
            <div style={{ width: '8px', height: '26px', background: 'var(--gold-gradient)', borderRadius: '1px', alignSelf: 'center' }} />
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '30px', lineHeight: 1, textTransform: 'uppercase' }}>Live Scoring</div>
            {anyLive && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '4px 10px', borderRadius: '2px', background: 'rgba(45,122,78,.14)', border: '1px solid rgba(45,122,78,.4)', font: '700 10px/1 var(--font-body)', letterSpacing: '.16em', textTransform: 'uppercase', color: '#57B87F' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#57B87F', animation: 'cffb-ls-pulse 1.6s ease-in-out infinite' }} />Live
              </span>
            )}
          </div>
          <div style={{ font: '600 var(--tx-2xs)/1 var(--font-body)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--fg-tertiary)' }}>Week {data.week} · {data.slate}</div>
        </div>
      </div>

      {/* Conference filter */}
      {showConfTabs && (
        <ConfTabs confs={confsPresent} effConf={effConf} counts={counts} total={matchups.length} myConf={myConf} onPick={pickConf} />
      )}

      {/* Around the league (filtered to the selected conference) */}
      {filtered.length ? (
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'repeat(2,auto)', gridAutoColumns: '150px', gap: '6px', margin: '14px 0 24px', overflowX: 'auto', paddingBottom: '6px' }} className="ls-strip">
          {filtered.map((g, i) => <StripCard key={g.id} m={g} i={i} active={g.id === m.id} onSelect={() => pickMatchup(g.id)} />)}
        </div>
      ) : (
        <div className="ls-strip-empty">No {CONF_LABEL[effConf] || String(effConf).toUpperCase()} games this week.</div>
      )}

      {/* Featured scoreboard */}
      <Scoreboard m={m} />

      {/* Lineups */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start', marginTop: '16px' }}>
        <LineupColumn side={m.away} flashes={flashes} />
        <LineupColumn side={m.home} flashes={flashes} />
      </div>

      <div style={{ marginTop: '18px', font: '500 10px/1.5 var(--font-body)', letterSpacing: '.06em', color: 'var(--fg-tertiary)', textTransform: 'uppercase' }}>
        Scores update live (~40s) · Proj &amp; win probability are estimates · Tap any matchup above to open its scoreboard
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
