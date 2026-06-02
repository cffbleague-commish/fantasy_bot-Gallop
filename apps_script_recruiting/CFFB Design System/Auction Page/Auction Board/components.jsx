// CFFB · Auction Board — components (sortable/filterable tables build)

const { useState } = React;

// ---- helpers ---------------------------------------------------------------
const initials = (name) => {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] || '');
  return (a + b).toUpperCase();
};
const posTextColor = (pos) => (pos === 'LB' || pos === 'DB' || pos === 'DL' ? '#F5F5F5' : '#0A0A0A');
const POS_FILTER = ['All', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ATH'];
const defDir = (key) => (['bid', 'price', 'copy'].includes(key) ? 'desc' : 'asc');

// ---- Headshot --------------------------------------------------------------
const Shot = ({ name, pos, size = 38 }) => (
  <div className="shot" style={{ width: size, height: size }}>
    <span className="shot__initials" style={{ fontSize: Math.round(size * 0.4) }}>{initials(name)}</span>
    <span className="shot__accent" style={{ background: POS_COLORS[pos] || '#5A5A5A' }} />
  </div>
);

// ---- Position tag ----------------------------------------------------------
const PosTag = ({ pos }) => (
  <span className="pos-tag" style={{ background: POS_COLORS[pos] || '#5A5A5A', color: posTextColor(pos) }}>{pos}</span>
);

// ---- Copy badge ------------------------------------------------------------
const CopyBadge = ({ copy }) => (
  <span className="copy-badge">Copy {copy.n}<span className="copy-badge__of">/{copy.of}</span></span>
);

// ---- Team logo PILL --------------------------------------------------------
const TeamPill = ({ id, h = 26 }) => {
  const t = TEAMS[id] || { bg: '#2A2A2A', fg: '#9A9A9A', abbr: '??', conf: 'ind' };
  if (t.pill) {
    return <span className="pill pill--img" style={{ height: h }}><img src={t.pill} alt={t.name} /></span>;
  }
  const abbr = t.abbr.length > 4 ? t.abbr.slice(0, 4) : t.abbr;
  return (
    <span className="pill pill--fb" style={{ height: h, borderRadius: Math.round(h * 0.22) }} title={t.name}>
      <span className="pill__edge" style={{ width: Math.round(h * 0.62), background: CONF_ACCENT[t.conf] || '#5A5A5A' }} />
      <span className="pill__body" style={{ background: t.bg, color: t.fg, fontSize: Math.max(11, Math.round(h * 0.46)) }}>{abbr}</span>
    </span>
  );
};

// ---- Live indicator + timer ------------------------------------------------
const LiveIndicator = ({ label }) => (
  <span className="live-ind">
    <span className="live-ind__ring"><i><span className="live-ind__dot" /></i></span>
    {label && <span className="live-ind__label">{label}</span>}
  </span>
);

const Timer = ({ base }) => {
  const [s, setS] = useState(base);
  React.useEffect(() => {
    const t = setInterval(() => setS((v) => (v <= 1 ? base + Math.floor(Math.random() * 20) : v - 1)), 1000);
    return () => clearInterval(t);
  }, [base]);
  const mm = Math.floor(s / 60), ss = s % 60;
  return (
    <span className="clock">
      <span className="live-ind__dot" />
      <span className={'clock__val ' + (s <= 10 ? 'is-urgent' : '')}>{mm}:{String(ss).padStart(2, '0')}</span>
    </span>
  );
};

// ---- Conference filter -----------------------------------------------------
const ConfFilter = ({ active, counts, onChange }) => (
  <div className="conf-filter" role="tablist" aria-label="Conference">
    {CONFERENCES.map((c) => (
      <button key={c.id} role="tab" aria-selected={active === c.id}
        className={'conf-tab' + (active === c.id ? ' is-active' : '')} onClick={() => onChange(c.id)}>
        <img className="conf-tab__logo" src={c.logo} alt={c.name} />
        <span className="conf-tab__name">{c.name}</span>
        <span className="conf-tab__count">{counts[c.id] || 0}</span>
      </button>
    ))}
  </div>
);

// ---- Sortable header cell + toolbar ----------------------------------------
const SortTh = ({ col, label, sort, onSort, align }) => {
  const active = sort.key === col;
  return (
    <button className={'th' + (active ? ' is-active' : '') + (align === 'right' ? ' th--r' : '')} onClick={() => onSort(col)}>
      <span>{label}</span>
      <span className="th__arr">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  );
};

const Toolbar = ({ q, setQ, pos, setPos, sort, setSort, sortOpts, count }) => (
  <div className="tbl__toolbar">
    <div className="tbl__search">
      <span className="tbl__search-ic">⌕</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" />
      {q && <button className="tbl__clear" onClick={() => setQ('')}>×</button>}
    </div>
    <div className="tbl__filters">
      <label className="tbl__sel">
        <span>Pos</span>
        <select value={pos} onChange={(e) => setPos(e.target.value)}>
          {POS_FILTER.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="tbl__sel tbl__sel--sort">
        <span>Sort</span>
        <select value={sort.key} onChange={(e) => setSort({ key: e.target.value, dir: defDir(e.target.value) })}>
          {sortOpts.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
        </select>
      </label>
      <span className="tbl__count">{count}</span>
    </div>
  </div>
);

// ---- shared filter/sort hook ----------------------------------------------
const useTable = (defaultSort) => {
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('All');
  const [sort, setSort] = useState(defaultSort);
  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defDir(key) }));
  return { q, setQ, pos, setPos, sort, setSort, onSort };
};

const applyFilter = (lots, q, pos) => lots.filter((l) => {
  const p = PLAYERS[l.player];
  if (pos !== 'All' && p.pos !== pos) return false;
  if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
  return true;
});

// ---- Live row + table ------------------------------------------------------
const LiveRow = ({ lot }) => {
  const p = PLAYERS[lot.player];
  const t = TEAMS[lot.bidder];
  return (
    <div className="lrow">
      <div className="lrow__shot"><Shot name={p.name} pos={p.pos} size={38} /></div>
      <div className="lrow__id">
        <div className="lrow__name">{p.name}</div>
        <div className="lrow__meta">
          <PosTag pos={p.pos} /><CopyBadge copy={lot.copy} /><span className="dim">{p.cls} · {p.stars}★</span>
        </div>
      </div>
      <div className="lrow__bid">
        <span className="lrow__bid-val">${lot.highBid}</span>
      </div>
      <div className="lrow__bidder"><TeamPill id={lot.bidder} h={24} /><span className="lrow__owner">{t.owner}</span></div>
      <div className="lrow__timer"><Timer base={lot.secs} /></div>
    </div>
  );
};

const LIVE_SORT = [
  { k: 'bid', label: 'High bid' }, { k: 'ends', label: 'Ends soonest' },
  { k: 'name', label: 'Player A–Z' }, { k: 'team', label: 'Leader' },
];
const liveVal = (l, key) => {
  const p = PLAYERS[l.player];
  if (key === 'name') return p.name.toLowerCase();
  if (key === 'bid') return l.highBid;
  if (key === 'team') return (TEAMS[l.bidder]?.name || '').toLowerCase();
  return l.secs;
};

const LiveTable = ({ lots }) => {
  const { q, setQ, pos, setPos, sort, setSort, onSort } = useTable({ key: 'bid', dir: 'desc' });
  const dir = sort.dir === 'asc' ? 1 : -1;
  const rows = applyFilter(lots, q, pos).sort((a, b) => {
    const va = liveVal(a, sort.key), vb = liveVal(b, sort.key);
    return va < vb ? -dir : va > vb ? dir : 0;
  });
  return (
    <div className="tbl">
      <Toolbar q={q} setQ={setQ} pos={pos} setPos={setPos} sort={sort} setSort={setSort} sortOpts={LIVE_SORT} count={`${rows.length} lots`} />
      <div className="tbl__scroll">
        <div className="lhead">
          <div />
          <SortTh col="name" label="Player" sort={sort} onSort={onSort} />
          <SortTh col="bid" label="High Bid" align="right" sort={sort} onSort={onSort} />
          <SortTh col="team" label="Leader" sort={sort} onSort={onSort} />
          <SortTh col="ends" label="Ends" align="right" sort={sort} onSort={onSort} />
        </div>
        {rows.length ? rows.map((l) => <LiveRow key={l.id} lot={l} />)
          : <div className="tbl__empty">No lots match your filters.</div>}
      </div>
    </div>
  );
};

// ---- Completed row + table -------------------------------------------------
const DoneRow = ({ lot }) => {
  const p = PLAYERS[lot.player];
  const t = TEAMS[lot.winner];
  return (
    <div className="drow">
      <div className="drow__shot"><Shot name={p.name} pos={p.pos} size={36} /></div>
      <div className="drow__id">
        <div className="drow__name">{p.name}</div>
        <div className="drow__meta"><PosTag pos={p.pos} /><CopyBadge copy={lot.copy} /><span className="dim">{p.cls}</span></div>
      </div>
      <div className="drow__price">${lot.price}</div>
      <div className="drow__winner"><TeamPill id={lot.winner} h={24} /><span className="drow__owner">{t.owner}</span></div>
    </div>
  );
};

const DONE_SORT = [
  { k: 'price', label: 'Price (high→low)' }, { k: 'name', label: 'Player A–Z' }, { k: 'team', label: 'Won by' },
];
const doneVal = (l, key) => {
  const p = PLAYERS[l.player];
  if (key === 'name') return p.name.toLowerCase();
  if (key === 'team') return (TEAMS[l.winner]?.name || '').toLowerCase();
  return l.price;
};

// ---- MetricScatter: Dollars Spent (X) vs Recruit Score (Y) -----------------
// One dot per completed recruit, filled with the winning team's color.
// `highlight` (Set of lot ids | null) brightens matches and dims the rest —
// driven by the Completed search box.
const VW = 720, VH = 384, MG = { l: 52, r: 20, t: 16, b: 46 };

const niceTicks = (min, max, n) => {
  const span = (max - min) || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  let step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  step *= mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const arr = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) arr.push(+v.toFixed(6));
  return { lo, hi, arr };
};

const ScatterChart = ({ lots, highlight }) => {
  const [hover, setHover] = useState(null);
  const focusing = highlight && highlight.size > 0;

  if (!lots.length) return <div className="tbl__empty">No completed sales to plot.</div>;

  const xs = lots.map((l) => l.price);
  const ys = lots.map((l) => PLAYERS[l.player].score);
  const xT = niceTicks(Math.min(...xs), Math.max(...xs), 5);
  const yT = niceTicks(Math.min(...ys), Math.max(...ys), 5);
  const iw = VW - MG.l - MG.r, ih = VH - MG.t - MG.b;
  const X = (v) => MG.l + (v - xT.lo) / (xT.hi - xT.lo) * iw;
  const Y = (v) => MG.t + (1 - (v - yT.lo) / (yT.hi - yT.lo)) * ih;

  const hv = hover ? lots.find((l) => l.id === hover) : null;
  const hvT = hv ? TEAMS[hv.winner] : null;
  const hvP = hv ? PLAYERS[hv.player] : null;

  return (
    <div className="scat">
      <div className="scat__plot">
        <svg className={'scat__svg' + (focusing || hover ? ' is-focusing' : '')} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet">
          {yT.arr.map((v) => (
            <g key={'y' + v}>
              <line className="scat__grid" x1={MG.l} y1={Y(v)} x2={VW - MG.r} y2={Y(v)} />
              <text className="scat__tick" x={MG.l - 9} y={Y(v) + 4} textAnchor="end">{v.toFixed(0)}</text>
            </g>
          ))}
          {xT.arr.map((v) => (
            <g key={'x' + v}>
              <line className="scat__grid" x1={X(v)} y1={MG.t} x2={X(v)} y2={VH - MG.b} />
              <text className="scat__tick" x={X(v)} y={VH - MG.b + 19} textAnchor="middle">${v}</text>
            </g>
          ))}
          <line className="scat__axis" x1={MG.l} y1={VH - MG.b} x2={VW - MG.r} y2={VH - MG.b} />
          <line className="scat__axis" x1={MG.l} y1={MG.t} x2={MG.l} y2={VH - MG.b} />
          <text className="scat__axis-title" x={MG.l + iw / 2} y={VH - 7} textAnchor="middle">Price Paid ($)</text>
          <text className="scat__axis-title" textAnchor="middle" transform={`translate(14,${MG.t + ih / 2}) rotate(-90)`}>Recruit Score</text>
          {lots.map((l) => {
            const t = TEAMS[l.winner], p = PLAYERS[l.player];
            const hi = focusing ? highlight.has(l.id) : true;
            const isHover = hover === l.id;
            return (
              <g key={l.id} className={'scat__dot' + (hi ? ' is-hi' : '') + (isHover ? ' is-hover' : '')}
                 onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover((h) => (h === l.id ? null : h))}>
                <circle cx={X(l.price)} cy={Y(p.score)} r={13} fill="transparent" />
                <circle className="scat__dot-fill" cx={X(l.price)} cy={Y(p.score)} r={isHover ? 8 : 6.5}
                        fill={t.bg} stroke={t.fg} />
              </g>
            );
          })}
        </svg>
        {hv && (
          <div className="scat__tip" style={{ left: (X(hv.price) / VW * 100) + '%', top: (Y(hvP.score) / VH * 100) + '%' }}>
            <span className="scat__tip-accent" style={{ background: hvT.bg }} />
            <div className="scat__tip-head">
              <Shot name={hvP.name} pos={hvP.pos} size={34} />
              <div style={{ minWidth: 0 }}>
                <div className="scat__tip-name">{hvP.name}</div>
                <div className="scat__tip-sub"><PosTag pos={hvP.pos} /><CopyBadge copy={hv.copy} /></div>
              </div>
            </div>
            <dl className="scat__tip-rows">
              <div className="scat__tip-row"><dt>Price Paid</dt><dd className="is-gold">${hv.price}</dd></div>
              <div className="scat__tip-row"><dt>Recruit Score</dt><dd>{hvP.score.toFixed(1)}</dd></div>
              <div className="scat__tip-row"><dt>Won By</dt><dd className="scat__tip-team"><TeamPill id={hv.winner} h={18} /></dd></div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
};

// ---- Completed panel: shared search/sort across table + scatter ------------
const CompletedPanel = ({ lots }) => {
  const { q, setQ, pos, setPos, sort, setSort, onSort } = useTable({ key: 'price', dir: 'desc' });
  const dir = sort.dir === 'asc' ? 1 : -1;
  const filtered = applyFilter(lots, q, pos);
  const rows = [...filtered].sort((a, b) => {
    const va = doneVal(a, sort.key), vb = doneVal(b, sort.key);
    return va < vb ? -dir : va > vb ? dir : 0;
  });
  const isFiltering = q.trim() !== '' || pos !== 'All';
  const highlight = isFiltering ? new Set(filtered.map((l) => l.id)) : null;

  return (
    <div className="cpl">
      <div className="cpl__chart">
        <div className="cpl__chart-head">
          <span className="cpl__chart-title">Spend vs. Recruit Score</span>
          <span className="cpl__chart-sub">{lots.length} signed · color = winning team</span>
        </div>
        <ScatterChart lots={lots} highlight={highlight} />
      </div>
      <div className="tbl cpl__table">
        <Toolbar q={q} setQ={setQ} pos={pos} setPos={setPos} sort={sort} setSort={setSort} sortOpts={DONE_SORT} count={`${rows.length} sold`} />
        <div className="tbl__scroll">
          <div className="dhead">
            <div />
            <SortTh col="name" label="Player" sort={sort} onSort={onSort} />
            <SortTh col="price" label="Price" align="right" sort={sort} onSort={onSort} />
            <SortTh col="team" label="Won By" sort={sort} onSort={onSort} />
          </div>
          {rows.length ? rows.map((l) => <DoneRow key={l.id} lot={l} />)
            : <div className="tbl__empty">No sales match your filters.</div>}
        </div>
      </div>
    </div>
  );
};

// ---- Funds row + table -----------------------------------------------------
const FundsRow = ({ t, totalRemain, maxRemain }) => {
  const remain = t.budget - t.spent;
  const share = (remain / totalRemain) * 100;
  return (
    <div className="frow frow--body">
      <div className="frow__team">
        <TeamPill id={t.id} h={22} />
        <span className="frow__team-id">
          <span className="frow__team-name">{t.name}</span>
          <span className="frow__owner">{t.owner}</span>
        </span>
      </div>
      <div className="frow__spent">
        <div className="meter"><div className="meter__fill" style={{ width: (t.spent / t.budget * 100) + '%' }} /></div>
        <span className="frow__spent-val">${t.spent}<span className="dim"> / {t.budget}</span></span>
      </div>
      <div className="frow__remain"><span className="frow__remain-val">${remain}</span><span className="frow__remain-lbl">left</span></div>
      <div className="frow__share">
        <div className="share"><div className="share__fill" style={{ width: (remain / maxRemain * 100) + '%' }} /></div>
        <span className="frow__share-val">{share.toFixed(1)}%</span>
      </div>
    </div>
  );
};

const FundsTable = ({ teams }) => {
  const totalRemain = teams.reduce((s, t) => s + (t.budget - t.spent), 0) || 1;
  const totalAlloc = teams.reduce((s, t) => s + t.budget, 0);
  const totalSpent = teams.reduce((s, t) => s + t.spent, 0);
  const rows = [...teams].sort((a, b) => (b.budget - b.spent) - (a.budget - a.spent));
  const maxRemain = Math.max(...rows.map((t) => t.budget - t.spent), 1);
  return (
    <div className="funds">
      <div className="frow frow--head">
        <div>Team · Owner</div><div>Spent</div><div>Remaining</div><div>% of Pool</div>
      </div>
      {rows.map((t) => <FundsRow key={t.abbr} t={t} totalRemain={totalRemain} maxRemain={maxRemain} />)}
      <div className="frow frow--total">
        <div className="frow__team frow__team--total">Pool · {teams.length} teams</div>
        <div className="frow__spent">
          <div className="meter"><div className="meter__fill" style={{ width: (totalSpent / totalAlloc * 100) + '%' }} /></div>
          <span className="frow__spent-val">${totalSpent.toLocaleString()}<span className="dim"> / {totalAlloc.toLocaleString()}</span></span>
        </div>
        <div className="frow__remain"><span className="frow__remain-val">${totalRemain.toLocaleString()}</span><span className="frow__remain-lbl">left</span></div>
        <div className="frow__share"><span className="frow__share-val" style={{ marginLeft: 'auto' }}>100%</span></div>
      </div>
    </div>
  );
};

Object.assign(window, { Shot, PosTag, CopyBadge, TeamPill, LiveIndicator, Timer, ConfFilter, LiveTable, ScatterChart, CompletedPanel, FundsTable });
