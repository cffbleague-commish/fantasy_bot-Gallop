// CFFB · Copy Tracker — main component
// Search a recruit → profile → per-conference copy summary → expand a copy's
// bid-history timeline. Layout / accent / density are Tweakable.

const { useState, useMemo, useRef, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "rows",
  "accent": "conf",
  "density": "spacious",
  "showOwners": true
}/*EDITMODE-END*/;

const accentFor = (confId, accent) => (accent === 'gold' ? '#C9A227' : (CONF_ACCENT[confId] || '#C9A227'));

// ============================================================ SEARCH
const SearchBar = ({ value, onPick }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? TRACKED.filter((p) => p.name.toLowerCase().includes(s)) : TRACKED;
    return list.slice(0, 8);
  }, [q]);

  const pick = (p) => { onPick(p.id); setQ(''); setOpen(false); };
  const onKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(results.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' && results[hi]) { pick(results[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="ct-search" ref={wrap}>
      <div className={'ct-search__field' + (open ? ' is-open' : '')}>
        <span className="ct-search__ic">⌕</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search a recruit to track copies…"
        />
        {q && <button className="ct-search__clear" onClick={() => setQ('')}>×</button>}
      </div>
      {open && (
        <div className="ct-search__menu" role="listbox">
          {results.length ? results.map((p, i) => (
            <button key={p.id} role="option" aria-selected={i === hi}
              className={'ct-opt' + (i === hi ? ' is-hi' : '') + (p.id === value ? ' is-cur' : '')}
              onMouseEnter={() => setHi(i)} onClick={() => pick(p)}>
              <Shot name={p.name} pos={p.pos} size={34} />
              <span className="ct-opt__id">
                <span className="ct-opt__name">{p.name}</span>
                <span className="ct-opt__meta"><PosTag pos={p.pos} /><span className="ct-opt__rank">{p.pos}{p.posRank}</span><Stars n={p.stars} size={12} /></span>
              </span>
              <span className="ct-opt__roll">
                <span className="ct-opt__roll-n"><b>{p.roll.sold}</b><span>sold</span></span>
                <span className="ct-opt__roll-n"><b>{p.roll.live + p.roll.open}</b><span>open</span></span>
              </span>
            </button>
          )) : <div className="ct-opt-empty">No tracked recruits match “{q}”.</div>}
        </div>
      )}
    </div>
  );
};

// ============================================================ PROFILE
const Fact = ({ label, short, children, hero }) => (
  <div className="ct-fact">
    <div className="ct-fact__label">
      <span className="ct-fact__label-full">{label}</span>
      <span className="ct-fact__label-short">{short || label}</span>
    </div>
    <div className={'ct-fact__val' + (hero ? ' is-hero' : '')}>{children}</div>
  </div>
);

const CopiesMeter = ({ roll }) => {
  const seg = (n) => (roll.total ? (n / roll.total) * 100 : 0);
  return (
    <div className="ct-meter">
      <div className="ct-meter__head">
        <span className="ct-meter__title">Copies Claimed</span>
        <span className="ct-meter__count"><b>{roll.sold}</b> of {roll.total} sold · {roll.live} live · {roll.open} open</span>
      </div>
      <div className="ct-meter__bar">
        <span className="ct-meter__seg is-sold" style={{ width: seg(roll.sold) + '%' }} />
        <span className="ct-meter__seg is-live" style={{ width: seg(roll.live) + '%' }} />
        <span className="ct-meter__seg is-open" style={{ width: seg(roll.open) + '%' }} />
      </div>
      <div className="ct-meter__legend">
        <span><i className="is-sold" />Sold</span>
        <span><i className="is-live" />In process</span>
        <span><i className="is-open" />Available</span>
      </div>
    </div>
  );
};

const Profile = ({ pid }) => {
  const p = PLAYERS[pid];
  const { roll, confs } = COPY_LEDGER[pid];
  return (
    <div className="ct-profile">
      <PortraitSlot name={p.name} pos={p.pos} cls={p.cls} />
      <div className="ct-profile__id">
        <div className="ct-profile__tags">
          <PosTag pos={p.pos} />
          <span className="ct-profile__pr">{p.pos} #{p.posRank}</span>
          <span className="ct-profile__offered">Offered in {confs.length} conferences</span>
        </div>
        <div className="ct-profile__name">{p.name}</div>
        <div className="ct-profile__sub">
          <Stars n={p.stars} size={18} />
          <span className="ct-profile__cls">{p.cls === 'Fr' ? 'Freshman' : p.cls === 'So' ? 'Sophomore' : p.cls === 'Jr' ? 'Junior' : 'Senior'}</span>
        </div>
        <div className="ct-profile__facts">
          <Fact label="Recruit Score" short="Score" hero>{p.score.toFixed(1)}</Fact>
          <Fact label="Pos Rank" short="Rank">{p.pos}{p.posRank}</Fact>
          <Fact label="Avg Sold" short="Avg">{roll.avg != null ? '$' + roll.avg : '—'}</Fact>
          <Fact label="High Sold" short="High">{roll.high != null ? '$' + roll.high : '—'}</Fact>
        </div>
      </div>
      <div className="ct-profile__meter"><CopiesMeter roll={roll} /></div>
    </div>
  );
};

// ============================================================ TIMELINE
const labelFor = (copy, entry, isLast) => {
  if (isLast) return copy.status === 'sold' ? 'WON' : 'LEADING';
  return entry.nomination ? 'NOM' : 'OUTBID';
};

const BidTimeline = ({ copy, accentColor }) => {
  if (!copy.bids.length) {
    return (
      <div className="ct-timeline ct-timeline--empty">
        <span className="ct-timeline__none">Not yet nominated — no bid history. This copy is still on the board.</span>
      </div>
    );
  }
  return (
    <div className="ct-timeline">
      <div className="ct-timeline__head">
        <span className="ct-timeline__title">Bid History</span>
        <span className="ct-timeline__sub">{copy.bids.length} bids · earliest first</span>
      </div>
      <ol className="ct-timeline__list" style={{ '--rail': accentColor }}>
        {copy.bids.map((b, i) => {
          const isLast = i === copy.bids.length - 1;
          const lbl = labelFor(copy, b, isLast);
          return (
            <li key={i} className={'ct-tl' + (isLast ? ' is-last' : '') + (b.nomination ? ' is-nom' : '') + (b.note ? ' has-note' : '')}>
              <span className="ct-tl__rail">
                <span className="ct-tl__dot" style={isLast ? { background: accentColor, borderColor: accentColor } : null} />
              </span>
              <div className="ct-tl__body">
                <div className="ct-tl__main">
                  <span className="ct-tl__time">
                    <span className="ct-tl__clock">{b.ts}</span>
                    <span className="ct-tl__rel">{b.rel}</span>
                  </span>
                  <span className="ct-tl__team">
                    <TeamPill id={b.team} h={24} />
                    <span className="ct-tl__owner">{(TEAMS[b.team] || {}).owner}</span>
                  </span>
                  <span className="ct-tl__bid">
                    <span className="ct-tl__amt">${b.amount}</span>
                    <Delta value={b.delta} />
                  </span>
                  <span className={'ct-tl__tag ct-tl-tag--' + lbl.toLowerCase()}>{lbl}</span>
                </div>
                {b.note && (
                  <div className="ct-tl__note">
                    <span className="ct-tl__note-ic" aria-hidden="true">↑</span>
                    <span className="ct-tl__note-label">Pushed by</span>
                    {b.by && <TeamPill id={b.by} h={18} />}
                    {b.by && <span className="ct-tl__note-owner">{(TEAMS[b.by] || {}).owner}</span>}
                    <span className="ct-tl__note-text">{b.note}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

// ============================================================ COPY UNITS
// One conference-copy summary line (rows layout).
const CopyRow = ({ copy, accentColor, open, onToggle, showOwners }) => {
  const m = STATUS_META[copy.status];
  const leaderTeam = copy.leader;
  return (
    <div className={'ct-copyrow' + (open ? ' is-open' : '')}>
      <button className="ct-copyrow__head" onClick={onToggle} aria-expanded={open}>
        <span className="ct-copyrow__n">Copy {copy.n}</span>
        <StatusChip status={copy.status} />
        <span className="ct-copyrow__bid">
          {copy.maxBid != null ? <span className="ct-copyrow__amt">${copy.maxBid}</span> : <span className="ct-copyrow__dash">—</span>}
          {copy.maxBid != null && <span className="ct-copyrow__lbl">{copy.status === 'sold' ? 'hammer' : 'high bid'}</span>}
        </span>
        <span className="ct-copyrow__leader">
          {leaderTeam ? (
            <React.Fragment>
              <TeamPill id={leaderTeam} h={22} />
              {showOwners && <span className="ct-copyrow__owner">{(TEAMS[leaderTeam] || {}).owner}</span>}
            </React.Fragment>
          ) : <span className="ct-copyrow__dash">No bids yet</span>}
        </span>
        <span className="ct-copyrow__chev">{copy.bids.length ? (open ? '▾' : '▸') : ''}</span>
      </button>
      {open && <BidTimeline copy={copy} accentColor={accentColor} />}
    </div>
  );
};

// ============================================================ SUMMARY LAYOUTS
const ConfRollChips = ({ copies }) => {
  const c = { sold: 0, live: 0, open: 0 };
  copies.forEach((cp) => { c[cp.status] += 1; });
  return (
    <span className="ct-confroll">
      {c.sold > 0 && <span className="ct-confroll__chip is-sold">{c.sold} sold</span>}
      {c.live > 0 && <span className="ct-confroll__chip is-live">{c.live} live</span>}
      {c.open > 0 && <span className="ct-confroll__chip is-open">{c.open} open</span>}
    </span>
  );
};

// --- ROWS (default) ---
const RowsSummary = ({ confs, expanded, setExpanded, accent, showOwners }) => (
  <div className="ct-rows">
    {confs.map(({ conf, copies }) => {
      const ac = accentFor(conf, accent);
      return (
        <section className="ct-confgroup" key={conf} style={{ '--accent': ac }}>
          <header className="ct-confgroup__head">
            <span className="ct-confgroup__edge" />
            <ConfBadge id={conf} size={24} />
            <span className="ct-confgroup__count">{copies.length} copies</span>
            <ConfRollChips copies={copies} />
          </header>
          <div className="ct-confgroup__body">
            {copies.map((cp) => (
              <CopyRow key={cp.id} copy={cp} accentColor={ac} showOwners={showOwners}
                open={expanded === cp.id} onToggle={() => setExpanded(expanded === cp.id ? null : cp.id)} />
            ))}
          </div>
        </section>
      );
    })}
  </div>
);

// --- CARDS ---
const CopyCell = ({ copy, accentColor, active, onClick, showOwners }) => (
  <button className={'ct-cell ct-cell--' + copy.status + (active ? ' is-active' : '')} onClick={onClick} style={{ '--accent': accentColor }}>
    <span className="ct-cell__top">
      <span className="ct-cell__n">Copy {copy.n}</span>
      <StatusChip status={copy.status} size="sm" />
    </span>
    <span className="ct-cell__amt">{copy.maxBid != null ? '$' + copy.maxBid : '—'}</span>
    <span className="ct-cell__leader">
      {copy.leader ? <React.Fragment><TeamPill id={copy.leader} h={20} />{showOwners && <span className="ct-cell__owner">{(TEAMS[copy.leader] || {}).owner}</span>}</React.Fragment>
        : <span className="ct-cell__dash">Available</span>}
    </span>
  </button>
);

const CardsSummary = ({ confs, expanded, setExpanded, accent, showOwners }) => {
  const expandedCopy = useMemo(() => {
    for (const c of confs) for (const cp of c.copies) if (cp.id === expanded) return { cp, ac: accentFor(c.conf, accent) };
    return null;
  }, [confs, expanded, accent]);
  return (
    <div className="ct-cards-wrap">
      <div className="ct-cards">
        {confs.map(({ conf, copies }) => {
          const ac = accentFor(conf, accent);
          return (
            <div className="ct-card" key={conf} style={{ '--accent': ac }}>
              <div className="ct-card__head"><ConfBadge id={conf} size={22} /><ConfRollChips copies={copies} /></div>
              <div className="ct-card__cells">
                {copies.map((cp) => (
                  <CopyCell key={cp.id} copy={cp} accentColor={ac} showOwners={showOwners}
                    active={expanded === cp.id} onClick={() => setExpanded(expanded === cp.id ? null : cp.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {expandedCopy && (
        <div className="ct-cards-detail" style={{ '--accent': expandedCopy.ac }}>
          <div className="ct-cards-detail__head">
            <ConfBadge id={expandedCopy.cp.conf} size={20} />
            <span className="ct-cards-detail__copy">Copy {expandedCopy.cp.n}</span>
            <StatusChip status={expandedCopy.cp.status} />
            <button className="ct-cards-detail__close" onClick={() => setExpanded(null)}>×</button>
          </div>
          <BidTimeline copy={expandedCopy.cp} accentColor={expandedCopy.ac} />
        </div>
      )}
    </div>
  );
};

// --- DIALS ---
const Dial = ({ copies, accentColor }) => {
  const total = copies.length;
  const sold = copies.filter((c) => c.status === 'sold').length;
  const live = copies.filter((c) => c.status === 'live').length;
  const R = 26, C = 2 * Math.PI * R;
  const soldLen = (sold / total) * C, liveLen = (live / total) * C;
  return (
    <svg className="ct-dial" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={R} className="ct-dial__track" />
      <circle cx="32" cy="32" r={R} className="ct-dial__live" stroke="#2D7A4E"
        strokeDasharray={`${liveLen} ${C}`} strokeDashoffset={-soldLen} />
      <circle cx="32" cy="32" r={R} className="ct-dial__sold" stroke={accentColor}
        strokeDasharray={`${soldLen} ${C}`} strokeDashoffset={0} />
      <text x="32" y="30" className="ct-dial__num">{sold}</text>
      <text x="32" y="44" className="ct-dial__den">/{total}</text>
    </svg>
  );
};

const DialsSummary = ({ confs, expanded, setExpanded, accent, showOwners }) => (
  <div className="ct-dials">
    {confs.map(({ conf, copies }) => {
      const ac = accentFor(conf, accent);
      const anyOpen = copies.some((cp) => cp.id === expanded);
      return (
        <section className={'ct-dialtile' + (anyOpen ? ' is-open' : '')} key={conf} style={{ '--accent': ac }}>
          <div className="ct-dialtile__top">
            <Dial copies={copies} accentColor={ac} />
            <div className="ct-dialtile__id">
              <ConfBadge id={conf} size={22} />
              <ConfRollChips copies={copies} />
            </div>
          </div>
          <div className="ct-dialtile__copies">
            {copies.map((cp) => (
              <button key={cp.id} className={'ct-dialcopy ct-dialcopy--' + cp.status + (expanded === cp.id ? ' is-active' : '')}
                onClick={() => setExpanded(expanded === cp.id ? null : cp.id)} style={{ '--accent': ac }}>
                <span className="ct-dialcopy__n">Copy {cp.n}</span>
                <StatusChip status={cp.status} size="sm" />
                <span className="ct-dialcopy__amt">{cp.maxBid != null ? '$' + cp.maxBid : '—'}</span>
                {cp.leader && <TeamPill id={cp.leader} h={18} />}
              </button>
            ))}
          </div>
          {anyOpen && (
            <BidTimeline copy={copies.find((cp) => cp.id === expanded)} accentColor={ac} />
          )}
        </section>
      );
    })}
  </div>
);

// ============================================================ APP
// default-open the most interesting copy for a recruit: first live, else first with bids.
const firstInteresting = (pid) => {
  const { confs } = COPY_LEDGER[pid];
  for (const c of confs) for (const cp of c.copies) if (cp.status === 'live') return cp.id;
  for (const c of confs) for (const cp of c.copies) if (cp.bids.length) return cp.id;
  return null;
};

// floating Desktop / Mobile preview toggle (mirrors the Auction Board)
const ViewToggle = ({ view, setView }) => (
  <div className="ct-viewtoggle" role="group" aria-label="Preview size">
    <button className={'ct-viewtoggle__btn' + (view === 'desktop' ? ' is-on' : '')} onClick={() => setView('desktop')}>
      <svg className="ct-viewtoggle__ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></svg>
      Desktop
    </button>
    <button className={'ct-viewtoggle__btn' + (view === 'mobile' ? ' is-on' : '')} onClick={() => setView('mobile')}>
      <svg className="ct-viewtoggle__ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
      Mobile
    </button>
  </div>
);

const App = () => {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [pid, setPid] = useState('arch');
  const [expanded, setExpanded] = useState(() => firstInteresting('arch'));
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('ct-view') || 'desktop'; } catch (e) { return 'desktop'; }
  });
  useEffect(() => { try { localStorage.setItem('ct-view', view); } catch (e) {} }, [view]);

  // re-open the lead copy when the recruit changes (layout change keeps selection)
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setExpanded(firstInteresting(pid));
  }, [pid]);

  const { confs } = COPY_LEDGER[pid];
  const Summary = t.layout === 'cards' ? CardsSummary : t.layout === 'dials' ? DialsSummary : RowsSummary;

  return (
    <React.Fragment>
      <div className={'ct-stage ct-stage--' + view}>
        <div className="ct-frame">
          <div className={'ct-root ct--' + t.density}>
            {/* placement context: this panel sits below the live board */}
            <div className="ct-context">
              <span className="ct-context__crumb">Live Auction</span>
              <span className="ct-context__sep">/</span>
              <span className="ct-context__here">Copy Tracker</span>
            </div>

            <div className="ct-panel">
              <header className="ct-panel__head">
                <div className="ct-panel__title">
                  <h2 className="ct-panel__h2">Copy Tracker</h2>
                  <p className="ct-panel__desc">Track every copy of a recruit across all six conference rooms.</p>
                </div>
                <SearchBar value={pid} onPick={setPid} />
              </header>

              <Profile pid={pid} />

              <div className="ct-summary">
                <div className="ct-summary__head">
                  <span className="ct-summary__title">Copies by Conference</span>
                  <span className="ct-summary__hint">Select a copy to open its bid timeline</span>
                </div>
                <Summary confs={confs} expanded={expanded} setExpanded={setExpanded} accent={t.accent} showOwners={t.showOwners} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ViewToggle view={view} setView={setView} />

      <TweaksPanel>
        <TweakSection label="Summary" />
        <TweakRadio label="Layout" value={t.layout} options={['rows', 'cards', 'dials']} onChange={(v) => setTweak('layout', v)} />
        <TweakRadio label="Accent" value={t.accent} options={['conf', 'gold']} onChange={(v) => setTweak('accent', v)} />
        <TweakToggle label="Show owner handles" value={t.showOwners} onChange={(v) => setTweak('showOwners', v)} />
        <TweakSection label="Timeline" />
        <TweakRadio label="Density" value={t.density} options={['compact', 'spacious']} onChange={(v) => setTweak('density', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
