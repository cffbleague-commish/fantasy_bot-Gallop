// CFFB · Price Prediction Board — atoms, board rows, detail panel

const { useState: useS } = React;

// ---- helpers ---------------------------------------------------------------
const initials = (name) => {
  const parts = name.trim().replace(/[^A-Za-z .'-]/g, '').split(/\s+/);
  const a = parts[0]?.[0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] || '');
  return (a + b).toUpperCase();
};
const posTextColor = (pos) => (pos === 'LB' || pos === 'DB' || pos === 'DL' || pos === 'RB' ? '#F5F5F5' : '#0A0A0A');
const starTier = (n) => 't' + Math.max(1, Math.min(5, n));

// ---- Headshot (striped placeholder + position accent) ----------------------
const Shot = ({ p, size = 40 }) => (
  <div className="shot" style={{ width: size, height: size }}>
    <span className="shot__initials" style={{ fontSize: Math.round(size * 0.4) }}>{initials(p.name)}</span>
    <span className="shot__accent" style={{ background: POS_COLORS[p.pos] || '#5A5A5A' }} />
  </div>
);

// ---- Position tag ----------------------------------------------------------
const PosTag = ({ pos }) => (
  <span className="pos-tag" style={{ background: POS_COLORS[pos] || '#5A5A5A', color: posTextColor(pos) }}>{pos}</span>
);

// ---- Stars (tier-colored, from DS) -----------------------------------------
const Stars = ({ n, size = 14 }) => (
  <span className="stars" style={{ fontSize: size + 'px' }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <span key={i} className={'stars__s' + (i <= n ? ' is-on ' + starTier(n) : '')}>★</span>
    ))}
  </span>
);

// ---- Compact star chip (mobile shorthand: one star + number) ---------------
const StarShort = ({ n }) => (
  <span className={'starshort ' + starTier(n)}><span className="starshort__ic">★</span>{n}</span>
);

// ---- Team logo (real ESPN logos w/ branded fallback) -----------------------
const TeamLogo = ({ id, size = 22, showName = false }) => {
  const s = SCHOOLS[id] || { name: '—', abbr: '—', bg: '#1C1C1C', fg: '#7A7A7A', espn: null };
  const [failed, setFailed] = useS(false);
  const src = espnLogo(s.espn);
  return (
    <span className="tlogo" title={s.name}>
      <span className="tlogo__badge" style={{ width: size, height: size }}>
        {src && !failed ? (
          <img className="tlogo__img" src={src} alt={s.name} loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <span className="tlogo__fallback" style={{ background: s.bg, color: s.fg, fontSize: Math.max(8, Math.round(size * 0.34)) }}>{s.abbr}</span>
        )}
      </span>
      {showName && <span className="tlogo__name">{s.name}</span>}
    </span>
  );
};

// ---- Live indicator (predictions adjust from the live-auction feed) --------
const LiveDot = () => (
  <span className="live-ind">
    <span className="live-ind__ring"><i><span className="live-ind__dot" /></i></span>
  </span>
);

// ---- Live delta chip — the spot where live bids nudge the projection -------
const LiveDelta = ({ live }) => {
  if (!live || live.delta === 0) return <span className="ldelta ldelta--flat" title="No live movement">±$0</span>;
  const up = live.delta > 0;
  return (
    <span className={'ldelta ' + (up ? 'ldelta--up' : 'ldelta--down')} title={live.note}>
      {up ? '▲' : '▼'} {up ? '+' : '−'}${Math.abs(live.delta)}
    </span>
  );
};

// ---- Methodology modal (how scoring + pricing work) ------------------------
const InfoButton = ({ onClick }) => (
  <button className="infobtn" onClick={onClick} aria-label="How it works">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" strokeLinecap="round" /><circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" /></svg>
    <span>How it works</span>
  </button>
);

const MethodRow = ({ term, children }) => (
  <div className="method__row">
    <div className="method__term">{term}</div>
    <div className="method__desc">{children}</div>
  </div>
);

const Methodology = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="method-overlay" onClick={onClose}>
      <div className="method" role="dialog" aria-modal="true" aria-label="Methodology" onClick={(e) => e.stopPropagation()}>
        <div className="method__head">
          <div>
            <div className="method__eyebrow">CFFB Model</div>
            <h2 className="method__title">How it works</h2>
          </div>
          <button className="method__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="method__body">
          <section className="method__sec">
            <h3 className="method__sec-title"><span className="method__sec-num">01</span> How recruits are scored</h3>
            <MethodRow term="Recruit Score">
              The headline <b>0–100 composite</b>. It blends a prospect’s ESPN scouting grade, national and
              positional rank, physical profile, and projected on-field impact into one number — the single
              best read on overall pedigree, and what the board ranks by.
            </MethodRow>
            <MethodRow term="Star Rating">
              The 5→1 tier derived from the composite — a quick-glance shorthand for blue-chip status
              (★5 = elite, ★4 = high-major, etc.).
            </MethodRow>
            <MethodRow term="Inputs">
              <b>ESPN Grade</b> and <b>ESPN Rank</b> are the raw scouting signals; <b>Pos Rank</b> places the
              player among peers at their position. <b>Draft Pick</b> and <b>ADP</b> reflect where managers
              actually value them in mock and live drafts.
            </MethodRow>
          </section>

          <section className="method__sec">
            <h3 className="method__sec-title"><span className="method__sec-num">02</span> How pricing is projected</h3>
            <MethodRow term="Predicted Price">
              The model’s expected hammer for <b>one copy</b> of a recruit. Driven primarily by the Recruit
              Score, then shaped by scarcity (copies available) and recent auction behavior.
            </MethodRow>
            <MethodRow term="Three scenarios">
              The curve overlays three views: <b style={{ color: '#7BA4C9' }}>Market consensus</b> (adjusts for
              how hyped / contested a player is), <b style={{ color: '#C9A227' }}>Model baseline</b> (pure
              composite-driven), and <b style={{ color: '#5B9D6B' }}>Live-adjusted</b> (the primary line —
              baseline nudged by live auction results).
            </MethodRow>
            <MethodRow term="Probability & band">
              Each scenario is a <b>split-normal distribution</b> — auctions spike high, so the upside tail is
              fatter than the downside. The shaded band is the <b>80% confidence interval</b> (the most likely
              hammer range); floor and ceiling mark the ~90% bounds.
            </MethodRow>
            <MethodRow term="Live adjustment">
              As copies of a recruit hammer during the live auction, the Live-adjusted projection shifts
              (the <span style={{ color: 'var(--delta-pos)' }}>▲</span>/<span style={{ color: 'var(--delta-neg)' }}>▼</span> delta)
              and its band tightens as real prices replace estimates.
            </MethodRow>
          </section>
        </div>

        <div className="method__foot">
          Projections are model estimates, not guarantees — treat the band, not the point, as the read.
        </div>
      </div>
    </div>
  );
};
const YearSelector = ({ active, onChange, counts, total }) => {
  const meta = active === 'all' ? { tag: 'All classes · combined board' } : YEARS.find((y) => y.id === active);
  return (
    <div className="yearbar">
      <span className="yearbar__lbl">Draft Class</span>
      <div className="yearseg" role="tablist" aria-label="Draft class year">
        <button role="tab" aria-selected={active === 'all'}
          className={'yearseg__btn' + (active === 'all' ? ' is-on' : '')} onClick={() => onChange('all')}>
          All
          <span className="yearseg__count">{total}</span>
        </button>
        {YEARS.map((y) => (
          <button key={y.id} role="tab" aria-selected={active === y.id}
            className={'yearseg__btn' + (active === y.id ? ' is-on' : '')} onClick={() => onChange(y.id)}>
            {y.label}
            <span className="yearseg__count">{counts[y.id] || 0}</span>
          </button>
        ))}
      </div>
      <span className="yearbar__tag">{meta.tag}</span>
    </div>
  );
};

// ============================================================================
// BIG BOARD — toolbar (search) + sortable header + rows
// ============================================================================
const SORTS = [
  { k: 'rank',  label: 'Big board rank' },
  { k: 'proj',  label: 'Projected price' },
  { k: 'score', label: 'Composite' },
  { k: 'stars', label: 'Stars' },
  { k: 'name',  label: 'Player A–Z' },
];
const defDir = (k) => (k === 'name' ? 'asc' : k === 'rank' ? 'asc' : 'desc');
const sortVal = (p, k) => {
  if (k === 'name') return p.name.toLowerCase();
  if (k === 'proj') return p.pred.proj;
  if (k === 'score') return p.score;
  if (k === 'stars') return p.stars * 100 + (100 - p.posRank);
  return -p.score; // rank ascending = #1 (top composite) first
};

const SortTh = ({ col, label, sort, onSort, align }) => {
  const on = sort.key === col;
  return (
    <button className={'th' + (on ? ' is-active' : '') + (align === 'right' ? ' th--r' : '')} onClick={() => onSort(col)}>
      <span>{label}</span>
      <span className="th__arr">{on ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  );
};

const BoardRow = ({ p, rank, active, onSelect, showYear }) => (
  <button className={'brow' + (active ? ' is-active' : '')} onClick={() => onSelect(p.id)}>
    <span className="brow__rank">{rank}</span>
    <span className="brow__shot"><Shot p={p} size={42} /></span>
    <span className="brow__id">
      <span className="brow__name">{p.name}</span>
      <span className="brow__meta">
        <PosTag pos={p.pos} />
        <span className="brow__posrank">{posLabel(p)}</span>
        {showYear && <span className="brow__year">’{String(p.y).slice(2)}</span>}
        <TeamLogo id={p.school} size={18} />
        <span className="brow__school">{(SCHOOLS[p.school] || {}).abbr}</span>
        <span className="brow__meta-stars"><StarShort n={p.stars} /></span>
      </span>
    </span>
    <span className="brow__stars"><Stars n={p.stars} size={13} /></span>
    <span className="brow__score">{p.score.toFixed(1)}</span>
    <span className="brow__proj">
      <span className="brow__proj-val">{fmt$(p.pred.proj)}</span>
      <span className="brow__proj-range">{fmt$(p.pred.floor)}–{fmt$(p.pred.ceil)}</span>
    </span>
  </button>
);

const BigBoard = ({ rows, activeId, onSelect, q, setQ, showYear }) => {
  const [sort, setSort] = useS({ key: 'rank', dir: 'asc' });
  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defDir(key) }));

  // rank by composite (canonical big board), then apply chosen sort + search
  const ranked = [...rows].sort((a, b) => b.score - a.score);
  const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));

  const dir = sort.dir === 'asc' ? 1 : -1;
  const filtered = ranked.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    const va = sortVal(a, sort.key), vb = sortVal(b, sort.key);
    return va < vb ? -dir : va > vb ? dir : 0;
  });

  return (
    <div className="tbl board">
      <div className="board__toolbar">
        <div className="board__search">
          <span className="board__search-ic">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prospects" />
          {q && <button className="board__clear" onClick={() => setQ('')}>×</button>}
        </div>
        <label className="board__sel">
          <span>Sort</span>
          <select value={sort.key} onChange={(e) => setSort({ key: e.target.value, dir: defDir(e.target.value) })}>
            {SORTS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
          </select>
        </label>
        <span className="board__count">{sorted.length} prospects</span>
      </div>

      <div className="bhead">
        <span>#</span>
        <span />
        <SortTh col="name" label="Prospect" sort={sort} onSort={onSort} />
        <SortTh col="stars" label="Stars" sort={sort} onSort={onSort} />
        <SortTh col="score" label="Comp" align="right" sort={sort} onSort={onSort} />
        <SortTh col="proj" label="Projected" align="right" sort={sort} onSort={onSort} />
      </div>

      <div className="board__rows">
        {sorted.length ? sorted.map((p) => (
          <BoardRow key={p.id} p={p} rank={rankOf.get(p.id)} active={p.id === activeId} onSelect={onSelect} showYear={showYear} />
        )) : <div className="tbl__empty">No prospects match “{q}”.</div>}
      </div>
    </div>
  );
};

// ============================================================================
// DETAIL PANEL — compact sticky profile pinned above the board
// ============================================================================
const Stat = ({ label, val, accent, hero }) => (
  <div className={'dstat' + (hero ? ' dstat--hero' : '')}>
    <span className="dstat__lbl">{label}</span>
    <span className="dstat__val" style={accent ? { color: accent } : null}>{val}</span>
  </div>
);

const DetailPanel = ({ p }) => {
  if (!p) return null;
  const s = SCHOOLS[p.school] || {};
  const st = p.stats;
  const { proj } = p.pred;
  const primary = p.scenarios.find((x) => x.primary) || p.scenarios[p.scenarios.length - 1];
  const p80lo = Math.max(1, Math.round(primary.proj - 1.2816 * primary.sigLo));
  const p80hi = Math.round(primary.proj + 1.2816 * primary.sigHi);

  return (
    <div className="dpanel">
      {/* ---- photo ---- */}
      <div className="dpanel__photo">
        <div className="dpanel__photo-bar" style={{ background: s.bg || '#2A2A2A' }} />
        <div className="dpanel__photo-empty">
          <svg viewBox="0 0 56 56"><circle cx="28" cy="20" r="9" /><path d="M10 50 C10 38 18 32 28 32 C38 32 46 38 46 50" /></svg>
        </div>
        {p.jersey > 0 && <span className="dpanel__photo-num">{p.jersey}</span>}
        <span className="dpanel__photo-logo"><TeamLogo id={p.school} size={30} /></span>
      </div>

      {/* ---- identity ---- */}
      <div className="dpanel__id">
        <div className="dpanel__tagrow">
          <PosTag pos={p.pos} />
          <span className="dpanel__cls-chip">Class of ’{String(p.y).slice(2)}</span>
        </div>
        <div className="dpanel__name">{p.name}</div>
        <div className="dpanel__starline"><Stars n={p.stars} size={18} /><span className="dpanel__starnum">{p.stars}.0</span></div>
        <div className="dpanel__sub">{s.name} · {p.ht} {p.wt}</div>
      </div>

      {/* ---- stat grid (in line with identity) ---- */}
      <div className="dpanel__stats">
        <Stat label="Recruit Score" val={st.recruitScore.toFixed(1)} accent="var(--gold)" hero />
        <Stat label="ESPN Grade" val={st.espnGrade} />
        <Stat label="ESPN Rank" val={'#' + st.espnRank} />
        <Stat label="Pos Rank" val={posLabel(p)} />
        <Stat label="Draft Pick" val={st.draftPick} />
        <Stat label="ADP" val={st.adp} />
      </div>

      {/* ---- pricing + compact chart ---- */}
      <div className="dpanel__pred">
        <div className="dpanel__pred-row1">
          <span className="dpanel__pred-eyebrow">Predicted Price · per copy</span>
          <div className="dpanel__live-tag"><LiveDot /><span className="dpanel__live-lbl">Live-adjusted</span></div>
        </div>
        <div className="dpanel__pred-row2">
          <div className="dpanel__hero-row">
            <span className="dpanel__pred-hero">{fmt$(proj)}</span>
            <LiveDelta live={p.live} />
          </div>
          <span className="dpanel__band">80% likely <b>{fmt$(p80lo)}–{fmt$(p80hi)}</b></span>
        </div>
        <span className="dpanel__live-note">{p.live ? p.live.note : '—'}</span>
        <ProbCurve p={p} />
      </div>
    </div>
  );
};

Object.assign(window, { Shot, PosTag, Stars, TeamLogo, LiveDot, LiveDelta, YearSelector, BigBoard, DetailPanel, InfoButton, Methodology });
