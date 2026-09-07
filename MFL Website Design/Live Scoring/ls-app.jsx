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

// ── Player row (starters + bench share the same 6-column grid) ────────────────
const GRID = '36px 34px minmax(0,1fr) 118px 52px 44px';

const PlayerRow = ({ p, flash, bench }) => {
  const fxColor = flash ? (flash.dir === 'up' ? '#57B87F' : '#D66A6A') : '';
  const dim = p.st === 'FINAL' && !flash;
  return (
    <div
      className="ls-row"
      style={{
        display: 'grid', gridTemplateColumns: GRID, gap: '10px', alignItems: 'center',
        padding: bench ? '8px 18px' : '9px 18px',
        borderBottom: '1px solid rgba(42,42,42,' + (bench ? '.4' : '.55') + ')',
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
        {side.starters.map((p) => <PlayerRow key={p.pid} p={p} flash={fl(p)} />)}
        {side.bench.length > 0 && (
          <div>
            <button
              onClick={() => setOpenBench((o) => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 18px', background: 'var(--bg-surface-elev)', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ font: '700 9px/1 var(--font-body)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--fg-tertiary)' }}>{openBench ? '▾' : '▸'} Bench</span>
              <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span className="cffb-num" style={{ font: '600 10px/1 var(--font-body)', color: 'var(--fg-tertiary)' }}>{fmt(benchPts)} pts</span>
            </button>
            {openBench && side.bench.map((p) => <PlayerRow key={p.pid} p={p} flash={fl(p)} bench />)}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Featured scoreboard ───────────────────────────────────────────────────────
const SideBlock = ({ side, prob, home, leading }) => (
  <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flexWrap: 'wrap', flexDirection: home ? 'row-reverse' : 'row' }}>
    <span style={{ flex: 'none', display: 'flex', alignItems: 'center' }}><Pill side={side} size={64} /></span>
    <div style={{ minWidth: 0, textAlign: home ? 'right' : 'left' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '26px', lineHeight: 1, textTransform: 'uppercase' }}>{side.name}</div>
      <div style={{ font: '600 9px/1 var(--font-body)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginTop: '9px' }}>
        <span style={{ color: '#57B87F' }}>{side.playing} playing</span> · {side.left} to play · {side.done} final
      </div>
    </div>
    <div style={{ [home ? 'marginRight' : 'marginLeft']: 'auto', textAlign: home ? 'left' : 'right' }}>
      <div className="cffb-num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '58px', lineHeight: 0.9, color: leading ? 'var(--fg-primary)' : 'var(--fg-secondary)' }}>{fmt(side.pts)}</div>
      <div style={{ font: '600 10px/1 var(--font-body)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginTop: '7px' }}>Proj <span className="cffb-num" style={{ color: 'var(--fg-secondary)' }}>{fmt(side.proj)}</span></div>
    </div>
  </div>
);

const Scoreboard = ({ m }) => {
  const awayProb = 100 - m.homeProb;
  const awayLead = m.away.pts >= m.home.pts;
  return (
    <div style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '28px 28px 24px', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--gold-gradient)' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 24px', alignItems: 'center' }}>
        <SideBlock side={m.away} prob={awayProb} leading={awayLead} />
        <div style={{ flex: '0 0 auto', textAlign: 'center', padding: '0 6px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--fg-tertiary)', letterSpacing: '.08em' }}>VS</div>
        </div>
        <SideBlock side={m.home} prob={m.homeProb} home leading={!awayLead} />
      </div>
      <div style={{ marginTop: '24px', paddingTop: '18px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
          <span className="cffb-num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px' }}>{awayProb}%</span>
          <span style={{ font: '600 9px/1 var(--font-body)', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--fg-tertiary)' }} title="Estimated from projected margin — not MFL's official win probability">Win Probability<span style={{ color: 'var(--fg-tertiary)', opacity: 0.7 }}> · est</span></span>
          <span className="cffb-num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px' }}>{m.homeProb}%</span>
        </div>
        <div style={{ display: 'flex', height: '8px', borderRadius: 'var(--r-pill)', overflow: 'hidden', background: 'var(--bg-surface-elev)' }}>
          <span style={{ height: '100%', transition: 'width var(--dur-fast) var(--ease-out)', width: awayProb + '%', background: m.away.color }} />
          <span style={{ flex: 1, height: '100%', background: m.home.color }} />
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

const defaultMatchupIdx = (matchups) => {
  const mine = (typeof MY_FID !== 'undefined') ? MY_FID : '';
  const i = matchups.findIndex((m) => m.away.fid === mine || m.home.fid === mine);
  return i >= 0 ? i : 0;
};

const App = () => {
  const seed = (typeof LS_PAYLOAD !== 'undefined' && LS_PAYLOAD) ? LS_PAYLOAD : { week: '', slate: '', matchups: [], flashes: {} };
  const [data, setData] = useState(seed);
  const [idx, setIdx] = useState(() => defaultMatchupIdx(seed.matchups));
  const [flashes, setFlashes] = useState({});
  const pickedRef = useRef(false); // once the user taps a matchup, stop auto-defaulting

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
  const sel = Math.min(idx, matchups.length - 1);
  const m = matchups[sel];
  const anyLive = matchups.some((g) => (g.away.playing + g.home.playing) > 0);
  const pick = (i) => { pickedRef.current = true; setIdx(i); };

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

      {/* Around the league */}
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'repeat(2,auto)', gridAutoColumns: '150px', gap: '6px', margin: '20px 0 24px', overflowX: 'auto', paddingBottom: '6px' }} className="ls-strip">
        {matchups.map((g, i) => <StripCard key={i} m={g} i={i} active={i === sel} onSelect={() => pick(i)} />)}
      </div>

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
