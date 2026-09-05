// CFFB · Roster Board — app
const { useState, useEffect } = React;

const SHIELD = '<path d="M2 4 L10 1 L18 4 L18 11 C18 16 10 20 10 20 C10 20 2 16 2 11 Z"/>';
const SHIELD_MED = SHIELD + '<g transform="translate(10 10.5) rotate(-30)"><rect x="-6" y="-2" width="12" height="4" rx="1.4" fill="rgba(209,117,117,0.18)"/><rect x="-6" y="-2" width="3.2" height="4" rx="1.2" fill="rgba(209,117,117,0.5)" stroke="currentColor" stroke-width="1.1"/><rect x="2.8" y="-2" width="3.2" height="4" rx="1.2" fill="rgba(209,117,117,0.5)" stroke="currentColor" stroke-width="1.1"/><circle cx="-1.5" cy="-0.5" r="0.5" fill="currentColor" stroke="none"/><circle cx="1.5" cy="-0.5" r="0.5" fill="currentColor" stroke="none"/><circle cx="-1.5" cy="0.5" r="0.5" fill="currentColor" stroke="none"/><circle cx="1.5" cy="0.5" r="0.5" fill="currentColor" stroke="none"/></g>';
const GLYPHS = {
  heisman: '<path d="M7 3 H17 V8 C17 11 15 13 12 13 C9 13 7 11 7 8 Z"/><path d="M7 5 C4 5 4 9 7 9"/><path d="M17 5 C20 5 20 9 17 9"/><path d="M12 13 V17"/><path d="M8 17 H16"/><path d="M7 20 H17"/><path d="M12 6.5 L12.6 7.7 L13.9 7.9 L13 8.8 L13.2 10.1 L12 9.5 L10.8 10.1 L11 8.8 L10.1 7.9 L11.4 7.7 Z" fill="currentColor" stroke="none"/>',
  obrien: '<path d="M3 18 Q9 4 18 8" stroke-dasharray="0.5 2.5" stroke-width="1.4"/><g transform="translate(17.5 9) rotate(35)"><ellipse rx="5" ry="2.6"/><path d="M-1.8 0 H1.8" stroke-width="1.4"/><path d="M-1 -0.8 V0.8 M0 -0.8 V0.8 M1 -0.8 V0.8" stroke-width="1.2"/></g><path d="M2 17 L4 19 L2 21" stroke-width="1.4"/>',
  walker: '<circle cx="14" cy="4.5" r="2"/><path d="M13 7 L10 13"/><path d="M13 8 L18 8"/><path d="M11.5 9 L8 11"/><g transform="translate(7 11.5) rotate(-20)"><ellipse rx="2.8" ry="1.5"/><path d="M-1 0 H1" stroke-width="1.2"/></g><path d="M10 13 L13 18"/><path d="M10 13 L5 19"/><path d="M2 21 H7 M9 21 H13" stroke-width="1.3"/>',
  biletnikoff: '<path d="M3 4 L8 9" stroke-dasharray="0.5 2.5" stroke-width="1.3"/><g transform="translate(11 11) rotate(-40)"><ellipse rx="4.2" ry="2.2"/><path d="M-1.5 0 H1.5" stroke-width="1.3"/><path d="M-0.6 -0.6 V0.6 M0.5 -0.6 V0.6" stroke-width="1.1"/></g><path d="M7 14 L10 13 L11 15 L9 17 Z"/><path d="M9 13.4 L8 11.5 M10 13 L10 11"/><path d="M17 14 L14 13 L13 15 L15 17 Z"/><path d="M15 13.4 L16 11.5 M14 13 L14 11"/><path d="M7 14 L5 17 M17 14 L19 17"/>',
  allamerican: '<path d="M6 5 Q3 12 6 19"/><path d="M5.2 7 Q3.5 7.5 3 9"/><path d="M4.5 10 Q2.8 10.5 2.3 12"/><path d="M4.5 14 Q2.8 14 2.3 15.5"/><path d="M5.2 17 Q3.5 17.5 3 19"/><path d="M18 5 Q21 12 18 19"/><path d="M18.8 7 Q20.5 7.5 21 9"/><path d="M19.5 10 Q21.2 10.5 21.7 12"/><path d="M19.5 14 Q21.2 14 21.7 15.5"/><path d="M18.8 17 Q20.5 17.5 21 19"/><path d="M12 7 L13.4 10 L16.6 10.3 L14.2 12.4 L14.9 15.6 L12 14 L9.1 15.6 L9.8 12.4 L7.4 10.3 L10.6 10 Z" fill="currentColor" stroke="none"/><path d="M9 20 L12 18 L15 20"/>',
};

const TeamChip = ({ id, size }) => {
  const t = TEAMS[id];
  if (!t) return null;
  const [imgErr, setImgErr] = useState(false);
  if (t.pill && !imgErr) return <img className={'cffb-team cffb-team--' + (size || 'sm')} src={t.pill} alt={t.name} onError={() => setImgErr(true)} />;
  return <span className={'cffb-team-chip' + (size === 'lg' ? ' cffb-team-chip--lg' : size === 'sm' ? ' cffb-team-chip--sm' : '')} style={{ background: t.bg, color: t.fg }}>{t.abbr}</span>;
};

const PosChip = ({ pos }) => <span className={'cffb-pos cffb-pos--' + pos.toLowerCase()}>{pos}</span>;

const Elig = ({ elig }) => {
  // Color-code the class chip via cffb.css (--fr/--so/--jr/--sr/--gr). elig.cls
  // may carry an "R-" redshirt prefix ("R-JR") — strip it for the modifier but
  // keep it in the visible label.
  const base = String(elig.cls).replace(/^R-/, '').toLowerCase();
  return (
    <span className="cffb-elig" title={elig.remainLabel + ' of eligibility'}>
      <span className={'cffb-elig__class cffb-elig__class--' + base}>{elig.cls}</span>
      <span className="cffb-elig__dots" aria-label={elig.remainLabel}>
        {elig.dots.map((d, i) => <span key={i} className={'cffb-elig__dot' + (d === 'used' ? ' is-used' : d === 'rs' ? ' is-rs' : d === 'rs-med' ? ' is-rs-med' : '')} />)}
      </span>
    </span>
  );
};

const RSChip = ({ rs, ir }) => {
  if (!rs) return <span className="rb-none">—</span>;
  const med = rs.type === 'med';
  const active = rs.year === SEASON;
  const warn = ir && med && !active; // on IR with a medical redshirt already used
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <span className={'cffb-rs ' + (med ? 'cffb-rs--med' : 'cffb-rs--trad')} title={(med ? 'Medical' : 'Traditional') + ' redshirt · ' + rs.year + (active ? ' (this season)' : '')}>
        <svg className="cffb-rs__icon" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: med ? SHIELD_MED : SHIELD }} />
        <span className="cffb-rs__txt">{(med ? 'MRS' : 'RS')} ’{String(rs.year).slice(2)}</span>
      </span>
      {warn && <span className="rb-inel" title={'Medical redshirt already used (' + rs.year + ') — this copy is not eligible for another medical redshirt'}>⚠ NO MRS LEFT</span>}
    </span>
  );
};

const Awards = ({ awards }) => {
  if (!awards.length) return <span className="rb-none">—</span>;
  return (
    <span className="cffb-awards cffb-awards--sm">
      {awards.map((a, i) => (
        <span key={i} className={'cffb-award cffb-award--' + a.kind + (a.conf ? ' is-' + a.conf : '')} title={a.name + (a.count > 1 ? ' ×' + a.count : '') + (a.year ? ' ' + a.year : '')}>
          <svg className="cffb-award__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: GLYPHS[a.kind] }} />
          <span className="cffb-award__name">{a.name}</span>
          {a.count > 1
            ? <span className="cffb-award__year">×{a.count}</span>
            : (a.year ? <span className="cffb-award__year">{String(a.year).slice(2)}</span> : null)}
        </span>
      ))}
    </span>
  );
};

const INJ = { P: ['rb-status--ok', '#4A9968', 'PROB'], Q: ['rb-status--q', '#C9A227', 'QUES'], O: ['rb-status--o', '#B84545', 'OUT'] };
const Status = ({ p }) => {
  if (p.elig.redshirtingNow) return <span className="rb-status rb-status--rs" title="Redshirting this season — cannot score">● REDSHIRT</span>;
  if (!p.injury) return <span className="rb-status rb-status--ok" title="No injury designation"><span className="d" style={{ background: '#2D7A4E' }} />ACTIVE</span>;
  const [cls, dot, label] = INJ[p.injury[0]];
  return <span className={'rb-status ' + cls} title={p.injury[1]}><span className="d" style={{ background: dot }} />{label}</span>;
};

const OtherCopy = ({ other, onGo }) => {
  const badge = (txt, title) => <span className="rb-copy-badge" title={title}>{txt}</span>;
  if (other === 'GRAD') return badge('GRAD', 'Copy 2 graduated — out of eligibility');
  if (!other) return badge('FA', 'Copy 2 unowned — free agent');
  const t = TEAMS[other];
  if (!t) return badge('—', 'Other copy');
  return (
    <a className="rb-copy" onClick={() => onGo(other)} title={'View ' + t.name + (t.owner ? ' (' + t.owner + ')' : '') + ' roster'}>
      <TeamChip id={other} size="sm" />
    </a>
  );
};

const PlayerPhoto = ({ p }) => {
  // MFL headshot on top of the initials placeholder; on load error (no photo on
  // file) the img is removed and the colored-bar + initials show through.
  const [err, setErr] = useState(false);
  return (
    <span className="rb-photo" title={p.name}>
      <span className="rb-photo__bar" style={{ background: POS_COLORS[p.pos] }} />
      <span className="rb-photo__init">{p.initials}</span>
      {p.photo && !err && <img src={p.photo} alt="" loading="lazy" onError={() => setErr(true)} />}
    </span>
  );
};

const Row = ({ p, onGo, ir }) => (
  <div className={'rb-cols rb-row' + ((p.elig.redshirtingNow || (p.injury && p.injury[0] === 'O')) ? ' is-dim' : '')}>
    <span className="rb-player">
      <PlayerPhoto p={p} />
      <span className="rb-pname">
        <span className="rb-pname__name">
          {(p.playerId && typeof MFL_PLAYER_LINK === 'function')
            ? <a className="rb-plink" href={MFL_PLAYER_LINK(p.playerId)} target="_blank" rel="noopener noreferrer">{p.name}</a>
            : p.name}
          <span className="rb-mob-status"><Status p={p} /></span>
        </span>
      </span>
    </span>
    <span><PosChip pos={p.pos} /></span>
    <span><Elig elig={p.elig} /></span>
    <span><RSChip rs={p.rs} ir={ir} /></span>
    <span className="rb-cell-awards"><Awards awards={p.awards} /></span>
    <span className="rb-cell-status"><Status p={p} /></span>
    <span className={'rb-pts t-r' + (p.pts ? '' : ' is-zero')}>{p.pts.toFixed(2)}</span>
    <span className="rb-cell-copy"><OtherCopy other={p.other} onGo={onGo} /></span>
  </div>
);

const ConfTabs = ({ team, setTeam }) => {
  const [open, setOpen] = useState(null);
  const [alignRight, setAlignRight] = useState(false);
  useEffect(() => {
    const close = (e) => { if (!e.target.closest('.rb-conftab')) setOpen(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  // Align the menu to whichever tab edge keeps it on-screen (tabs can wrap rows).
  const toggle = (c) => (e) => {
    const btn = e.currentTarget;
    const strip = btn.closest('.rb-tabs');
    setAlignRight(btn.getBoundingClientRect().left + 160 > strip.getBoundingClientRect().right);
    setOpen(open === c ? null : c);
  };
  const activeConf = TEAMS[team].conf;
  return (
    <div className="rb-tabs" role="tablist">
      {CONF_ORDER.map((c) => {
        const teams = TEAM_ORDER.filter((id) => TEAMS[id].conf === c);
        const isActive = c === activeConf;
        return (
          <div key={c} className="rb-conftab">
            <button role="tab" aria-selected={isActive} aria-expanded={open === c} className={'rb-tab' + (isActive ? ' is-active' : '')} style={isActive ? { boxShadow: 'inset 0 -2px 0 ' + CONF_ACCENT[c] } : null} onClick={toggle(c)}>
              {CONF_META[c].logo && <img className="rb-conflogo" src={CONF_META[c].logo} alt="" />}
              <span className="rb-tab__abbr">{CONF_META[c].label}</span>
              {isActive && <span className="rb-tab__cur">{TEAMS[team].abbr}</span>}
              <span className="rb-caret">▾</span>
            </button>
            {open === c && (
              <div className={'rb-menu' + (alignRight ? ' rb-menu--right' : '')} role="listbox">
                {teams.map((id) => (
                  <button key={id} role="option" aria-selected={id === team} className={'rb-menu__item' + (id === team ? ' is-active' : '')} onClick={() => { setTeam(id); setOpen(null); }}>
                    <TeamChip id={id} size="sm" />
                    <span className="rb-menu__abbr">{TEAMS[id].abbr}</span>
                    {id === MY_TEAM && <span className="rb-tab__you">YOU</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const App = () => {
  const [team, setTeam] = useState(() => {
    const saved = localStorage.getItem('cffb-roster-team');
    return TEAMS[saved] ? saved : MY_TEAM;
  });
  useEffect(() => { localStorage.setItem('cffb-roster-team', team); }, [team]);
  const t = TEAMS[team];
  const r = buildRoster(team);
  return (
    <div className="rb-wrap">
      <div className="rb-head">
        <div>
          <div className="rb-head__eyebrow">CFFB · League Rosters</div>
          <div className="rb-head__title">Roster Board</div>
        </div>
        <div className="rb-head__meta"><span className="dot" />Thru Week {THRU_WEEK} · {SEASON}</div>
      </div>
      <ConfTabs team={team} setTeam={setTeam} />
      <div className="rb-team" style={{ borderTopColor: CONF_ACCENT[t.conf] }}>
        <TeamChip id={team} size="lg" />
        <div>
          <div className="rb-team__name">{t.name}{team === MY_TEAM && <span style={{ marginLeft: 10, verticalAlign: 3, font: '700 9px/1 var(--font-body)', letterSpacing: '.16em', color: '#0A0A0A', background: 'var(--gold)', borderRadius: 2, padding: '3px 5px' }}>YOUR TEAM</span>}</div>
          <div className="rb-team__owner">{t.owner} · {t.rec}</div>
        </div>
        <div className="rb-team__kpis">
          <div className="rb-kpi"><span className="rb-kpi__label">Points</span><span className="rb-kpi__val is-gold cffb-num">{r.totalPts.toFixed(2)}</span></div>
          <div className="rb-kpi"><span className="rb-kpi__label">Roster</span><span className="rb-kpi__val cffb-num">{r.count}</span></div>
          <div className="rb-kpi"><span className="rb-kpi__label">Redshirting</span><span className="rb-kpi__val cffb-num">{r.rsCount}</span></div>
          <div className="rb-kpi"><span className="rb-kpi__label">Out</span><span className="rb-kpi__val cffb-num" style={r.outCount ? { color: '#D88787' } : null}>{r.outCount}</span></div>
        </div>
      </div>
      <div className="rb-table">
        <div className="rb-cols rb-thead">
          <span>Player</span><span>Pos</span><span>Eligibility</span><span>Redshirt</span><span className="rb-cell-awards">Awards</span><span>Status</span><span className="t-r">Pts {SEASON}</span><span className="rb-cell-copy">Other Copy</span>
        </div>
        {r.groups.map((g) => (
          <React.Fragment key={g.pos}>
            <div className="rb-group">
              <span className="rb-group__bar" style={{ background: POS_COLORS[g.pos] }} />
              <span className="rb-group__pos">{g.pos}</span>
              <span className="rb-group__n">{g.players.length}</span>
            </div>
            {g.players.map((p) => <Row key={p.pid} p={p} onGo={setTeam} />)}
          </React.Fragment>
        ))}
        {r.taxi.length > 0 && (
          <React.Fragment>
            <div className="rb-group rb-group--squad">
              <span className="rb-group__bar" style={{ background: 'var(--gold)' }} />
              <span className="rb-group__pos">Taxi Squad</span>
              <span className="rb-group__n">{r.taxi.length}</span>
              <span className="rb-group__note">Copies redshirting the {SEASON} season — moving off taxi forfeits the year's redshirt</span>
            </div>
            {r.taxi.map((p) => <Row key={'tx-' + p.pid} p={p} onGo={setTeam} />)}
          </React.Fragment>
        )}
        {r.ir.length > 0 && (
          <React.Fragment>
            <div className="rb-group rb-group--squad rb-group--ir">
              <span className="rb-group__bar" style={{ background: '#B84545' }} />
              <span className="rb-group__pos">Injured Reserve</span>
              <span className="rb-group__n">{r.ir.length}</span>
              <span className="rb-group__note">Medical redshirts are applied here — moving off IR forfeits the year's redshirt</span>
            </div>
            {r.ir.map((p) => <Row key={'ir-' + p.pid} p={p} onGo={setTeam} ir />)}
          </React.Fragment>
        )}
        <div className="rb-foot">
          <span>◎ ring = redshirt year (burned, no eligibility used)</span>
          <span>● filled = play season used</span>
          <span>⚠ NO MRS LEFT — an IR player with a prior medical redshirt cannot take another</span>
          <span>Other Copy — every player exists as two copies; click a team to jump to its roster</span>
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
