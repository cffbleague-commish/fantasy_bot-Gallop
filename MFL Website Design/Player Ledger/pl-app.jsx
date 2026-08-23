// CFFB · Player Ledger — main component.
// Search a player → profile (eligibility + redshirt + awards) → every copy's
// owner and the full multi-year transaction ledger. Layout / accent / profile
// prominence / density are Tweakable. Responsive desktop ↔ mobile.

const { useState, useMemo, useRef, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "rows",
  "profile": "hero",
  "accent": "conf",
  "showOwners": true,
  "density": "spacious"
}/*EDITMODE-END*/;

const accentFor = (confId, accent) => (accent === 'gold' ? '#C9A227' : (CONF_ACCENT[confId] || '#C9A227'));
const plInitials = (name) => {
  const p = String(name).trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : (p[0]?.[1] || ''))).toUpperCase();
};
const CLASS_LONG = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior', GR: 'Graduate' };

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
    const list = s ? ROSTER.filter((p) => p.name.toLowerCase().includes(s)) : ROSTER;
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
    <div className="pl-search" ref={wrap}>
      <div className={'pl-search__field' + (open ? ' is-open' : '')}>
        <span className="pl-search__ic">⌕</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search a player to trace ownership…"
        />
        {q && <button className="pl-search__clear" onClick={() => setQ('')}>×</button>}
      </div>
      {open && (
        <div className="pl-search__menu" role="listbox">
          {results.length ? results.map((p, i) => (
            <button key={p.id} role="option" aria-selected={i === hi}
              className={'pl-opt' + (i === hi ? ' is-hi' : '') + (p.id === value ? ' is-cur' : '')}
              onMouseEnter={() => setHi(i)} onClick={() => pick(p)}>
              <span className="pl-opt__shot" style={{ '--accent': POS_COLORS[p.pos] || '#5A5A5A' }}>{plInitials(p.name)}</span>
              <span className="pl-opt__id">
                <span className="pl-opt__name">{p.name}</span>
                <span className="pl-opt__meta"><PosChip pos={p.pos} /><span className="pl-opt__sub">{p.college} · {p.pos}{p.posRank}</span></span>
              </span>
              <span className="pl-opt__roll">
                <span className="pl-opt__roll-n"><b>{p.roll.rostered + p.roll.redshirting}</b><span>held</span></span>
                <span className="pl-opt__roll-n"><b>{p.roll.total}</b><span>copies</span></span>
              </span>
            </button>
          )) : <div className="pl-opt-empty">No players match “{q}”.</div>}
        </div>
      )}
    </div>
  );
};

// ============================================================ PROFILE bits
// The initials/silhouette placeholder always renders; the MFL headshot (when a
// photo URL is present) lays over it and, on error, falls back to MFL's
// "no photo" asset, then hides itself so the placeholder shows through.
const Portrait = ({ p, size = 'lg' }) => (
  <div className={'pl-portrait pl-portrait--' + size}>
    <span className="pl-portrait__bar" style={{ background: POS_COLORS[p.pos] || '#5A5A5A' }} />
    <svg className="pl-portrait__sil" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="28" cy="20" r="9" /><path d="M10 50 C10 38 18 32 28 32 C38 32 46 38 46 50" />
    </svg>
    <span className="pl-portrait__initials">{plInitials(p.name)}</span>
    {p.photo && (
      <img className="pl-portrait__photo" loading="lazy" src={p.photo} alt={p.name}
        onError={(e) => {
          const img = e.currentTarget;
          const noPhoto = (typeof NO_PHOTO !== 'undefined') ? NO_PHOTO : '';
          if (noPhoto && !img.dataset.fb) { img.dataset.fb = '1'; img.src = noPhoto; }
          else { img.style.display = 'none'; }
        }} />
    )}
  </div>
);

const CopiesMeter = ({ roll }) => {
  const seg = (n) => (roll.total ? (n / roll.total) * 100 : 0);
  const grad = roll.graduated || 0;
  const decl = roll.declared || 0;
  const out = grad + decl;
  return (
    <div className="pl-meter">
      <div className="pl-meter__head">
        <span className="pl-meter__title">Copies In Play</span>
        <span className="pl-meter__count">
          {out > 0
            ? <React.Fragment><b>{roll.rostered + roll.redshirting}</b> active · {out} retired · {roll.fa} free</React.Fragment>
            : <React.Fragment><b>{roll.rostered}</b> rostered · {roll.redshirting} RS · {roll.fa} free</React.Fragment>}
        </span>
      </div>
      <div className="pl-meter__bar">
        <span className="pl-meter__seg is-rostered" style={{ width: seg(roll.rostered) + '%' }} />
        <span className="pl-meter__seg is-redshirting" style={{ width: seg(roll.redshirting) + '%' }} />
        <span className="pl-meter__seg is-declared" style={{ width: seg(decl) + '%' }} />
        <span className="pl-meter__seg is-graduated" style={{ width: seg(grad) + '%' }} />
        <span className="pl-meter__seg is-fa" style={{ width: seg(roll.fa) + '%' }} />
      </div>
      <div className="pl-meter__legend">
        <span><i className="is-rostered" />Rostered</span>
        <span><i className="is-redshirting" />Redshirting</span>
        {decl > 0 && <span><i className="is-declared" />Declared</span>}
        {grad > 0 && <span><i className="is-graduated" />Graduated</span>}
        <span><i className="is-fa" />Free agent</span>
      </div>
    </div>
  );
};

const Stat = ({ label, children, hero }) => (
  <div className="pl-stat">
    <div className="pl-stat__label">{label}</div>
    <div className={'pl-stat__val' + (hero ? ' is-hero' : '')}>{children}</div>
  </div>
);

// One devy-draft selection line (year · conference · round/pick · drafting team).
const DraftLine = ({ d }) => (
  <span className="pl-draftline">
    <span className="pl-draftline__pick cffb-num">R{d.round}·P{d.pick}</span>
    <span className="pl-draftline__yr">{d.year} {(CONF_NAME[d.conf] || d.conf)} devy draft</span>
    <TeamOwner id={d.fid} showOwner={false} mark="sm" />
  </span>
);

// --- Hero profile (player-level: bio + awards + devy draft. Eligibility is per-copy.) ---
// Bio fields (ht/wt/home) exist only in the demo's mock data; live rows carry
// nflTeam / rookie class / awards / draft / an MFL profile deep link instead —
// every extra is rendered conditionally so both data shapes look right.
const ProfileHero = ({ p, roll, accentColor }) => (
  <div className="pl-hero" style={{ '--accent': accentColor }}>
    <Portrait p={p} size="lg" />
    <div className="pl-hero__id">
      <div className="pl-hero__tags">
        <PosChip pos={p.pos} />
        {(p.nflTeam || p.college) && <span className="pl-hero__college">{p.nflTeam || p.college}</span>}
        {p.entered && <span className="pl-hero__year">Rookie class {p.entered}</span>}
      </div>
      <div className="pl-hero__namerow">
        <h2 className="pl-hero__name">{p.name}</h2>
        {p.profileUrl && <a className="pl-hero__mfl" href={p.profileUrl} target="_blank" rel="noopener noreferrer">MFL profile ↗</a>}
      </div>
      {(p.ht || p.home) && <div className="pl-hero__meta">{p.ht} {p.wt} {p.home ? '· ' + p.home : ''}</div>}
      {p.draft && p.draft.length > 0 && (
        <div className="pl-hero__draft">
          <span className="pl-hero__draftlbl">Devy Draft</span>
          {p.draft.map((d, i) => <DraftLine key={i} d={d} />)}
        </div>
      )}
    </div>
    <div className="pl-hero__rail">
      <CopiesMeter roll={roll} />
    </div>
  </div>
);

// --- Compact profile ---
const ProfileCompact = ({ p, roll, accentColor }) => (
  <div className="pl-compact" style={{ '--accent': accentColor }}>
    <Portrait p={p} size="sm" />
    <div className="pl-compact__id">
      <div className="pl-compact__namerow">
        <PosChip pos={p.pos} />
        <span className="pl-compact__name">{p.name}</span>
        <span className="pl-compact__college">{p.college}</span>
      </div>
    </div>
    <div className="pl-compact__roll">
      <Stat label="Rostered" hero>{roll.rostered}</Stat>
      <Stat label="Moves">{roll.txns}</Stat>
    </div>
  </div>
);

// ============================================================ TRANSACTION TIMELINE
const TXN_LABEL = { won: 'WON', rs: 'REDSHIRT', 'rs-med': 'MEDICAL RS', award: 'HONOR', graduate: 'GRADUATED', drop: 'RELEASED' };
// Small gold marker shown on a copy that earned a player award while held.
const HonorsStar = ({ n }) => (
  <span className="pl-honors" title={`${n} player ${n === 1 ? 'award' : 'awards'} earned while held`}>★{n > 1 ? n : ''}</span>
);
const TransactionTimeline = ({ copy, accentColor, showOwners }) => (
  <div className="pl-tl">
    <div className="pl-tl__head">
      <span className="pl-tl__title">Transaction Ledger</span>
      <span className="pl-tl__sub">{copy.ledger.length} events · earliest first</span>
    </div>
    <ol className="pl-tl__list" style={{ '--rail': accentColor }}>
      {copy.ledger.map((e, i) => {
        const last = i === copy.ledger.length - 1;
        return (
          <li key={i} className={'pl-tlitem pl-tlitem--' + e.tag + (last ? ' is-last' : '')}>
            <span className="pl-tlitem__rail">
              <span className="pl-tlitem__dot" style={{ background: TXN_META[e.tag].color, borderColor: TXN_META[e.tag].color }} />
            </span>
            <div className="pl-tlitem__body">
              <div className="pl-tlitem__main">
                <span className="pl-tlitem__season cffb-num">{e.season}</span>
                <span className="pl-tlitem__owner">
                  {e.type === 'graduate' && !e.team
                    ? <span className="pl-tlitem__retired">Class of {e.season} · unrostered</span>
                    : <TeamOwner id={e.team} showOwner={showOwners} mark="sm" />}
                </span>
                <span className="pl-tlitem__detail">
                  {e.type === 'auction' && <Money n={e.price} />}
                  {e.type === 'redshirt' && <RedshirtChip rsType={e.rsType} size="sm" />}
                  {e.type === 'award' && <Awards awards={[e.award]} size="sm" />}
                </span>
                {e.type !== 'award' && <span className={'pl-tag pl-tag--' + e.tag}>{TXN_LABEL[e.tag]}</span>}
              </div>
              {e.note && <div className="pl-tlitem__note">{e.note}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  </div>
);

// ============================================================ ROWS LAYOUT
const CopyRow = ({ copy, accentColor, open, onToggle, showOwners }) => (
  <div className={'pl-row' + (open ? ' is-open' : '')} style={{ '--accent': accentColor }}>
    <button className="pl-row__head" onClick={onToggle} aria-expanded={open}>
      <span className="pl-row__n">Copy {copy.n}{copy.honors > 0 && <HonorsStar n={copy.honors} />}</span>
      <StatusChip status={copy.status} />
      <span className="pl-row__owner">
        <TeamOwner id={copy.owner} showOwner={showOwners} mark="sm" emptyLabel={copy.status === 'declared' ? 'Declared' : copy.graduated ? 'Graduated' : 'Free agent'} />
      </span>
      <span className="pl-row__elig"><CopyEligInline elig={copy.elig} /></span>
      <span className="pl-row__acq">
        {copy.acquired
          ? <React.Fragment><Money n={copy.acquired.price} /><span className="pl-row__since">since {copy.acquired.season}</span></React.Fragment>
          : <span className="pl-row__dash">on the wire</span>}
      </span>
      <span className="pl-row__chev">{open ? '▾' : '▸'}</span>
    </button>
    {open && <TransactionTimeline copy={copy} accentColor={accentColor} showOwners={showOwners} />}
  </div>
);

// Per-conference status summary chips.
const ConfRollChips = ({ copies }) => {
  const c = { active: 0, retired: 0, fa: 0 };
  copies.forEach((cp) => {
    if (cp.status === 'graduated' || cp.status === 'declared') c.retired += 1;
    else if (cp.status === 'fa') c.fa += 1;
    else c.active += 1;
  });
  return (
    <span className="pl-confroll">
      {c.active > 0 && <span className="pl-confroll__chip is-active">{c.active} active</span>}
      {c.retired > 0 && <span className="pl-confroll__chip is-retired">{c.retired} retired</span>}
      {c.fa > 0 && <span className="pl-confroll__chip is-fa">{c.fa} free</span>}
    </span>
  );
};

const RowsLayout = ({ confs, expanded, setExpanded, accent, showOwners }) => (
  <div className="pl-rows">
    {confs.map(({ conf, copies }) => {
      const ac = accentFor(conf, accent);
      return (
        <section className="pl-confgroup" key={conf} style={{ '--accent': ac }}>
          <header className="pl-confgroup__head">
            <span className="pl-confgroup__edge" />
            <ConfBadge id={conf} size={22} />
            <span className="pl-confgroup__count">{copies.length} copies reserved</span>
            <ConfRollChips copies={copies} />
          </header>
          <div className="pl-confgroup__body">
            {copies.map((c) => (
              <CopyRow key={c.id} copy={c} accentColor={ac} showOwners={showOwners}
                open={expanded === c.id} onToggle={() => setExpanded(expanded === c.id ? null : c.id)} />
            ))}
          </div>
        </section>
      );
    })}
  </div>
);

// ============================================================ SHARED DETAIL
const CopyDetail = ({ copy, accentColor, showOwners, onClose }) => (
  <div className="pl-detail" style={{ '--accent': accentColor }}>
    <div className="pl-detail__head">
      <span className="pl-detail__copy">Copy {copy.n}</span>
      <StatusChip status={copy.status} />
      <span className="pl-detail__elig"><EligDots elig={copy.elig} /></span>
      <span className="pl-detail__owner"><TeamOwner id={copy.owner} showOwner={showOwners} mark="sm" emptyLabel={copy.status === 'declared' ? 'Declared' : copy.graduated ? 'Graduated' : 'Free agent'} /></span>
      <button className="pl-detail__close" onClick={onClose}>×</button>
    </div>
    <TransactionTimeline copy={copy} accentColor={accentColor} showOwners={showOwners} />
  </div>
);

// ============================================================ CARDS LAYOUT
const CopyCard = ({ copy, accentColor, active, onClick, showOwners }) => (
  <button className={'pl-card pl-card--' + copy.status + (active ? ' is-active' : '')}
    style={{ '--accent': accentColor }} onClick={onClick}>
    <span className="pl-card__top">
      <span className="pl-card__n">Copy {copy.n}{copy.honors > 0 && <HonorsStar n={copy.honors} />}</span>
      <StatusChip status={copy.status} size="sm" />
    </span>
    <span className="pl-card__owner">
      <TeamOwner id={copy.owner} showOwner={showOwners} mark="md" stacked emptyLabel={copy.status === 'declared' ? 'Declared' : copy.graduated ? 'Graduated' : 'Free agent'} />
    </span>
    <span className="pl-card__elig"><CopyEligInline elig={copy.elig} /></span>
    <span className="pl-card__foot">
      {copy.acquired
        ? <React.Fragment><Money n={copy.acquired.price} /><span className="pl-card__since">since {copy.acquired.season}</span></React.Fragment>
        : <span className="pl-card__dash">on the wire</span>}
      <span className="pl-card__moves">{copy.ledger.length} {copy.ledger.length === 1 ? 'move' : 'moves'}</span>
    </span>
  </button>
);

const CardsLayout = ({ confs, expanded, setExpanded, accent, showOwners }) => {
  const selEntry = useMemo(() => {
    for (const g of confs) for (const c of g.copies) if (c.id === expanded) return { c, conf: g.conf };
    return null;
  }, [confs, expanded]);
  return (
    <div className="pl-cards-wrap">
      {confs.map(({ conf, copies }) => {
        const ac = accentFor(conf, accent);
        return (
          <section className="pl-confgroup" key={conf} style={{ '--accent': ac }}>
            <header className="pl-confgroup__head">
              <span className="pl-confgroup__edge" />
              <ConfBadge id={conf} size={22} />
              <span className="pl-confgroup__count">{copies.length} copies reserved</span>
              <ConfRollChips copies={copies} />
            </header>
            <div className="pl-cards">
              {copies.map((c) => (
                <CopyCard key={c.id} copy={c} accentColor={ac} showOwners={showOwners}
                  active={expanded === c.id} onClick={() => setExpanded(expanded === c.id ? null : c.id)} />
              ))}
            </div>
          </section>
        );
      })}
      {selEntry && <CopyDetail copy={selEntry.c} accentColor={accentFor(selEntry.conf, accent)} showOwners={showOwners} onClose={() => setExpanded(null)} />}
    </div>
  );
};

// ============================================================ TIMELINE (SWIMLANE) LAYOUT
// Each copy is a horizontal lane across the season axis. Ownership renders as a
// team-colored bar; transactions render as nodes. Click a lane to expand its ledger.
const buildAxis = (copies) => {
  let min = CURRENT_SEASON, max = CURRENT_SEASON;
  copies.forEach((c) => c.ledger.forEach((e) => { min = Math.min(min, e.season); max = Math.max(max, e.season); }));
  const years = [];
  for (let y = min; y <= max; y++) years.push(y);
  return years;
};
// Ownership segments per copy: [{team, startIdx, endFrac(left edge of end)}].
const ownershipSegments = (copy, years) => {
  const N = years.length, idxOf = (y) => years.indexOf(y);
  const segs = [];
  let owner = null, startIdx = null;
  copy.ledger.forEach((e) => {
    if (e.type === 'auction') {
      if (owner != null) segs.push({ team: owner, startIdx, endIdx: idxOf(e.season), held: false });
      owner = e.team; startIdx = idxOf(e.season);
    } else if (e.type === 'drop') {
      segs.push({ team: owner, startIdx, endIdx: idxOf(e.season), held: false });
      owner = null; startIdx = null;
    } else if (e.type === 'graduate') {
      if (owner != null) segs.push({ team: owner, startIdx, endIdx: idxOf(e.season), held: false });
      owner = null; startIdx = null;
    }
  });
  if (owner != null) segs.push({ team: owner, startIdx, endIdx: N - 1, held: true });
  return segs.map((s) => {
    const left = (s.startIdx / N) * 100;
    const right = s.held ? 100 : (s.endIdx / N) * 100;
    return { ...s, left, width: Math.max(right - left, 100 / N / 2) };
  });
};

const Swimlane = ({ copy, years, accentColor, active, onClick, showOwners }) => {
  const N = years.length;
  const segs = ownershipSegments(copy, years);
  // group events by season index for collision spreading
  const byIdx = {};
  copy.ledger.forEach((e) => { const k = years.indexOf(e.season); (byIdx[k] = byIdx[k] || []).push(e); });
  return (
    <div className={'pl-lane' + (active ? ' is-active' : '')} style={{ '--accent': accentColor }}>
      <button className="pl-lane__head" onClick={onClick}>
        <span className="pl-lane__n">Copy {copy.n}{copy.honors > 0 && <HonorsStar n={copy.honors} />}</span>
        <StatusChip status={copy.status} size="sm" />
        <span className="pl-lane__elig"><CopyEligInline elig={copy.elig} showClass={false} /></span>
        <span className="pl-lane__owner"><TeamOwner id={copy.owner} showOwner={showOwners} mark="sm" emptyLabel={copy.status === 'declared' ? 'Declared' : copy.graduated ? 'Graduated' : 'Free agent'} /></span>
      </button>
      <div className="pl-lane__track">
        <div className="pl-lane__grid">
          {years.map((y) => <span key={y} className="pl-lane__col" />)}
        </div>
        {segs.map((s, i) => (
          <span key={i} className={'pl-lane__bar' + (s.held ? ' is-held' : '')}
            style={{ left: s.left + '%', width: s.width + '%', background: (TEAMS[s.team] || {}).bg || '#3A3A3A' }}
            title={(TEAMS[s.team] || {}).name} />
        ))}
        {copy.ledger.map((e, i) => {
          const k = years.indexOf(e.season);
          const group = byIdx[k]; const j = group.indexOf(e);
          const frac = (k + (j + 1) / (group.length + 1)) / N * 100;
          return (
            <span key={i} className={'pl-node pl-node--' + e.tag} style={{ left: frac + '%', '--c': TXN_META[e.tag].color }}
              title={`${e.season} · ${TXN_LABEL[e.tag]}${e.price ? ' $' + e.price : ''}${e.award ? ' · ' + e.award.name : ''}`}>
              {e.tag === 'award' ? <span className="pl-node__star">★</span>
                : e.tag === 'graduate' ? <span className="pl-node__cap" />
                : <span className="pl-node__dot" />}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const TimelineLayout = ({ confs, expanded, setExpanded, accent, showOwners }) => {
  const allCopies = useMemo(() => confs.flatMap((g) => g.copies), [confs]);
  const years = useMemo(() => buildAxis(allCopies), [allCopies]);
  const selEntry = useMemo(() => {
    for (const g of confs) for (const c of g.copies) if (c.id === expanded) return { c, conf: g.conf };
    return null;
  }, [confs, expanded]);
  return (
    <div className="pl-timeline">
      <div className="pl-axis" style={{ gridTemplateColumns: `var(--lane-label) 1fr` }}>
        <span />
        <div className="pl-axis__years">
          {years.map((y) => <span key={y} className={'pl-axis__yr cffb-num' + (y === CURRENT_SEASON ? ' is-now' : '')}>{y}</span>)}
        </div>
      </div>
      {confs.map(({ conf, copies }) => {
        const ac = accentFor(conf, accent);
        return (
          <section className="pl-lanegroup" key={conf} style={{ '--accent': ac }}>
            <header className="pl-lanegroup__head">
              <ConfBadge id={conf} size={20} />
              <ConfRollChips copies={copies} />
            </header>
            <div className="pl-lanes">
              {copies.map((c) => (
                <Swimlane key={c.id} copy={c} years={years} accentColor={ac} showOwners={showOwners}
                  active={expanded === c.id} onClick={() => setExpanded(expanded === c.id ? null : c.id)} />
              ))}
            </div>
          </section>
        );
      })}
      {selEntry && <CopyDetail copy={selEntry.c} accentColor={accentFor(selEntry.conf, accent)} showOwners={showOwners} onClose={() => setExpanded(null)} />}
    </div>
  );
};

// ============================================================ VIEW TOGGLE
const ViewToggle = ({ view, setView }) => (
  <div className="pl-viewtoggle" role="group" aria-label="Preview size">
    <button className={'pl-viewtoggle__btn' + (view === 'desktop' ? ' is-on' : '')} onClick={() => setView('desktop')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></svg>
      Desktop
    </button>
    <button className={'pl-viewtoggle__btn' + (view === 'mobile' ? ' is-on' : '')} onClick={() => setView('mobile')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
      Mobile
    </button>
  </div>
);

// ============================================================ APP
const firstHeld = (entry) => {
  const copies = (entry && entry.copies) || [];
  return (copies.find((c) => c.status !== 'fa') || copies[0] || {}).id || null;
};

// Live build ships pl-data-live.jsx (async loaders); the demo ships the mock
// pl-data.jsx (synchronous LEDGER/ROSTER). Detect which and drive both.
const HAS_LIVE = typeof loadLedgerIndex === 'function';

const App = () => {
  const [t] = useTweaks(TWEAK_DEFAULTS);
  const [ready, setReady] = useState(!HAS_LIVE);
  const [err, setErr] = useState(null);
  const [pid, setPid] = useState(() => HAS_LIVE ? null : ((ROSTER[0] && ROSTER[0].id) || null));
  const [entry, setEntry] = useState(null);      // LEDGER[pid] once available
  const [loadingP, setLoadingP] = useState(false);
  const [expanded, setExpanded] = useState(null);

  // Load the search index once (live only; mock is ready immediately).
  useEffect(() => {
    if (!HAS_LIVE) return;
    let alive = true;
    loadLedgerIndex()
      .then((roster) => { if (!alive) return; setReady(true); if (roster.length) setPid(roster[0].id); })
      .catch((e) => { if (alive) setErr(String((e && e.message) || e)); });
    return () => { alive = false; };
  }, []);

  // Load the selected player's ledger.
  useEffect(() => {
    if (!pid) return;
    let alive = true;
    if (HAS_LIVE) {
      setLoadingP(true); setEntry(null);
      loadPlayerLedger(pid)
        .then((en) => { if (!alive) return; setEntry(en); setExpanded(firstHeld(en)); setLoadingP(false); })
        .catch((e) => { if (!alive) return; setErr(String((e && e.message) || e)); setLoadingP(false); });
    } else {
      const en = LEDGER[pid];
      setEntry(en); setExpanded(firstHeld(en));
    }
    return () => { alive = false; };
  }, [pid]);

  // Single responsive stage — the frame is a CSS container (container-type:
  // inline-size), so the layout adapts to its own rendered width via the
  // @container queries in ledger.css. No manual desktop/mobile toggle.
  const shell = (children) => (
    <div className="pl-stage">
      <div className="pl-frame">
        <div className={'pl-root pl--' + t.density + ' pl--layout-' + t.layout}>
          <div className="pl-context">
            <span className="pl-context__crumb">League</span>
            <span className="pl-context__sep">/</span>
            <span className="pl-context__here">Player Ledger</span>
          </div>

          <div className="pl-panel">
            <header className="pl-panel__head">
              <div className="pl-panel__title">
                <h1 className="pl-panel__h1">Player Ledger</h1>
                <p className="pl-panel__desc">Trace every copy of a player — who owns it now, and how it changed hands.</p>
              </div>
              {ready && <SearchBar value={pid} onPick={setPid} />}
            </header>
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  if (err) return shell(<div className="pl-note pl-note--err">Couldn’t load the Player Ledger. {err}</div>);
  if (!ready) return shell(<div className="pl-note">Loading players…</div>);

  const p = ROSTER.find((r) => r.id === pid);
  if (!p) return shell(<div className="pl-note">No players available yet.</div>);

  const roll = (entry && entry.roll) || p.roll;
  const detailReady = entry && !loadingP;
  const accentColor = accentFor(p.conf, t.accent);
  const Layout = t.layout === 'cards' ? CardsLayout : t.layout === 'timeline' ? TimelineLayout : RowsLayout;

  return shell(
    <React.Fragment>
      {t.profile === 'hero'
        ? <ProfileHero p={p} roll={roll} accentColor={accentColor} />
        : <ProfileCompact p={p} roll={roll} accentColor={accentColor} />}

      <div className="pl-ledger">
        <div className="pl-ledger__head">
          <span className="pl-ledger__title">Copies &amp; Ownership</span>
          <span className="pl-ledger__hint">Select a copy to open its transaction ledger</span>
        </div>
        {detailReady
          ? <Layout confs={entry.confs} expanded={expanded} setExpanded={setExpanded}
              accent={t.accent} showOwners={t.showOwners} />
          : <div className="pl-note">Loading ledger…</div>}
      </div>
    </React.Fragment>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
