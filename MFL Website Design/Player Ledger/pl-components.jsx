// CFFB · Player Ledger — React atoms.
// Thin wrappers over the cffb.css vocabulary (redshirt chips, eligibility dots,
// award badges, position + team chips) so the ledger app can compose them.

// ---- Position chip --------------------------------------------------------
const KNOWN_POS = { qb: 1, rb: 1, wr: 1, te: 1, ol: 1, lb: 1, db: 1, k: 1 };
const PosChip = ({ pos }) => {
  const lc = String(pos).toLowerCase();
  const known = KNOWN_POS[lc];
  return (
    <span className={'cffb-pos' + (known ? ' cffb-pos--' + lc : '')}
      style={known ? null : { background: (POS_COLORS[pos] || '#5A5A5A'), color: '#0A0A0A' }}>
      {pos}
    </span>
  );
};

// ---- Recruiting stars -----------------------------------------------------
const Stars = ({ n }) => (
  <span className={'cffb-stars cffb-stars--t' + n}>
    {[1, 2, 3, 4, 5].map((i) => (
      <span key={i} className={'cffb-star' + (i <= n ? '' : ' cffb-star--off')}>★</span>
    ))}
  </span>
);

// ---- Redshirt shield chip (cffb-rs) ---------------------------------------
// rsType: 'trad' | 'med'. solo = icon only (tight rows).
const RedshirtChip = ({ rsType = 'trad', size = 'sm', solo = false, title }) => {
  const med = rsType === 'med';
  const cls = ['cffb-rs', med ? 'cffb-rs--med' : 'cffb-rs--trad', 'cffb-rs--' + size,
    solo ? 'cffb-rs--solo' : ''].filter(Boolean).join(' ');
  return (
    <span className={cls} title={title || (med ? 'Medical Redshirt' : 'Traditional Redshirt')}>
      <svg className="cffb-rs__icon"><use href={med ? '#cffb-icon-rs-med' : '#cffb-icon-rs-trad'} /></svg>
      {!solo && <span className="cffb-rs__txt">{med ? 'MRS' : 'RS'}</span>}
    </span>
  );
};

// ---- Compact per-copy eligibility: class chip + dots + RS shield ----------
// Each COPY carries its own eligibility clock, so this renders inline on copies.
const CopyEligInline = ({ elig, showClass = true }) => {
  if (!elig) return null;
  const title = `${elig.cls} · ${elig.remain}` + (elig.hasRS ? ` · ${elig.rsType === 'med' ? 'medical ' : ''}redshirt ${elig.rsYear || ''}`.trim() : '');
  return (
    <span className="pl-celig" title={title}>
      {showClass && <span className={'cffb-elig__class cffb-elig__class--' + String(elig.cls).toLowerCase()}>{elig.cls}</span>}
      <span className="cffb-elig__dots">
        {elig.dots.map((d, i) => <span key={i} className={'cffb-elig__dot ' + ELIG_DOT_CLASS[d]} />)}
      </span>
      {elig.hasRS && <RedshirtChip rsType={elig.rsType === 'med' ? 'med' : 'trad'} size="xs" solo
        title={`${elig.rsType === 'med' ? 'Medical ' : 'Traditional '}Redshirt ${elig.rsYear || ''}`.trim()} />}
    </span>
  );
};

// ---- Eligibility dots (cffb-elig) -----------------------------------------
const ELIG_DOT_CLASS = { used: 'is-used', rs: 'is-rs', 'rs-med': 'is-rs-med', open: '' };
const EligDots = ({ elig, compact = false }) => {
  if (!elig) return null;
  const clsLc = String(elig.cls).toLowerCase();
  return (
    <span className={'cffb-elig' + (compact ? ' cffb-elig--compact' : '')}>
      <span className={'cffb-elig__class cffb-elig__class--' + clsLc}>{elig.cls}</span>
      <span className="cffb-elig__dots" aria-label={elig.remain + ' eligibility'}>
        {elig.dots.map((d, i) => (
          <span key={i} className={'cffb-elig__dot ' + ELIG_DOT_CLASS[d]} />
        ))}
      </span>
      {elig.remain && <span className="cffb-elig__remain">{elig.remain}</span>}
    </span>
  );
};

// ---- Award badges (cffb-award) --------------------------------------------
const AWARD_GLYPH = {
  heisman: '#cffb-icon-award-heisman',
  obrien: '#cffb-icon-award-obrien',
  walker: '#cffb-icon-award-walker',
  biletnikoff: '#cffb-icon-award-biletnikoff',
  allamerican: '#cffb-icon-award-allamerican',
};
const Awards = ({ awards, size }) => {
  if (!awards || !awards.length) return null;
  return (
    <div className={'cffb-awards' + (size === 'sm' ? ' cffb-awards--sm' : '')}>
      {awards.map((a, i) => {
        const cls = ['cffb-award', 'cffb-award--' + a.kind,
          a.kind === 'allamerican' && a.conf ? 'is-' + a.conf : ''].filter(Boolean).join(' ');
        return (
          <span key={i} className={cls}>
            <svg className="cffb-award__glyph"><use href={AWARD_GLYPH[a.kind]} /></svg>
            <span className="cffb-award__name">{a.name}</span>
            {a.year && <span className="cffb-award__year">{a.year}</span>}
          </span>
        );
      })}
    </div>
  );
};

// ---- Conference badge (logo + name) ---------------------------------------
const ConfBadge = ({ id, size = 22, showName = true }) => (
  <span className="pl-conf">
    {CONF_LOGO[id] && <img className="pl-conf__logo" src={CONF_LOGO[id]} alt={CONF_NAME[id] || id} style={{ width: size, height: size }} />}
    {showName && <span className="pl-conf__name">{CONF_NAME[id] || id}</span>}
  </span>
);

// ---- Team ownership mark ---------------------------------------------------
// Ripped-paper banner PNG when available, else the circular abbr fallback.
const plAbbr = (id) => {
  const t = TEAMS[id] || {};
  const a = t.abbr || id || '??';
  return a.length > 4 ? a.slice(0, 4) : a;
};
const TeamMark = ({ id, size = 'sm' }) => {
  const t = TEAMS[id] || { bg: '#2A2A2A', fg: '#9A9A9A' };
  if (t.pill) {
    return <img className={'cffb-team cffb-team--' + size} src={t.pill} alt={t.name || id} />;
  }
  const chipSize = size === 'lg' ? '' : (size === 'md' ? '' : ' cffb-team-chip--sm');
  return (
    <span className={'cffb-team-chip' + chipSize} style={{ background: t.bg, color: t.fg }} title={t.name || id}>
      {plAbbr(id)}
    </span>
  );
};

// Owner = team mark + manager handle. The unit that says "who holds this copy".
const TeamOwner = ({ id, showOwner = true, mark = 'sm', stacked = false, emptyLabel = 'Free agent' }) => {
  if (!id) {
    return (
      <span className="pl-owner pl-owner--fa">
        <span className="pl-owner__fa">{emptyLabel}</span>
      </span>
    );
  }
  const t = TEAMS[id] || {};
  return (
    <span className={'pl-owner' + (stacked ? ' pl-owner--stacked' : '')}>
      <TeamMark id={id} size={mark} />
      <span className="pl-owner__id">
        <span className="pl-owner__team">{t.name || id}</span>
        {showOwner && t.owner && <span className="pl-owner__handle">{t.owner}</span>}
      </span>
    </span>
  );
};

// ---- Status chip (Rostered / Redshirting / Free Agent) --------------------
const StatusChip = ({ status, size = 'md' }) => {
  const m = STATUS_META[status] || STATUS_META.fa;
  return (
    <span className={'pl-status pl-status--' + status + ' pl-status--' + size}>
      <span className="pl-status__dot" style={{ background: m.color }} />
      <span className="pl-status__label">{m.label}</span>
    </span>
  );
};

// ---- Money ----------------------------------------------------------------
const Money = ({ n, hero = false }) => (
  <span className={'pl-money cffb-num' + (hero ? ' pl-money--hero' : '')}>${n}</span>
);

Object.assign(window, {
  PosChip, Stars, RedshirtChip, EligDots, CopyEligInline, Awards, ConfBadge, TeamMark, TeamOwner, StatusChip, Money,
});
