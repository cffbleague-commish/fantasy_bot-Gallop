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
  // Prefer the franchise ICON (small pill); if it fails to load, fall back to the
  // LOGO, then to the text chip — so a broken image never leaves a blank cell.
  const srcs = [t.pill, t.pill2].filter(Boolean);
  const [step, setStep] = useState(0);
  const src = srcs[step];
  if (src) return <img className={'cffb-team cffb-team--' + (size || 'sm')} src={src} alt={t.name} onError={() => setStep((s) => s + 1)} />;
  return <span className={'cffb-team-chip' + (size === 'lg' ? ' cffb-team-chip--lg' : size === 'sm' ? ' cffb-team-chip--sm' : '')} style={{ background: t.bg, color: t.fg }}>{t.abbr}</span>;
};

const PosChip = ({ pos }) => <span className={'cffb-pos cffb-pos--' + pos.toLowerCase()}>{pos}</span>;

const Elig = ({ elig }) => {
  // No matching contract copy for this franchise → show a dash, not a fake class.
  if (!elig || !elig.cls) return <span className="rb-none" title={elig && elig.remainLabel}>—</span>;
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

// rs is an ARRAY of {type,year} — a player may carry both a traditional and a
// medical redshirt (e.g. r23m24), so render one chip per redshirt.
const RSChip = ({ rs, ir }) => {
  if (!rs || !rs.length) return <span className="rb-none">—</span>;
  const priorMedYear = (rs.find((r) => r.type === 'med' && r.year !== SEASON) || {}).year;
  const warn = ir && priorMedYear != null; // on IR with a medical redshirt already used
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      {rs.map((r, i) => {
        const med = r.type === 'med';
        const active = r.year === SEASON;
        return (
          <span key={i} className={'cffb-rs ' + (med ? 'cffb-rs--med' : 'cffb-rs--trad')} title={(med ? 'Medical' : 'Traditional') + ' redshirt · ' + r.year + (active ? ' (this season)' : '')}>
            <svg className="cffb-rs__icon" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: med ? SHIELD_MED : SHIELD }} />
            <span className="cffb-rs__txt">{(med ? 'MRS' : 'RS')} ’{String(r.year).slice(2)}</span>
          </span>
        );
      })}
      {warn && <span className="rb-inel" title={'Medical redshirt already used (' + priorMedYear + ') — this copy is not eligible for another medical redshirt'}>⚠ NO MRS LEFT</span>}
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
          {p.contractUnverified && <span className="rb-flag" title="Contract copy couldn't be matched to this team by abbreviation — eligibility/redshirt/awards shown may be inaccurate or awaiting an update">⚠</span>}
          <span className="rb-mob-status"><Status p={p} /></span>
        </span>
        {(p.team || p.bye) && (
          <span className="rb-pname__sub">
            {[p.team, p.bye ? 'Bye ' + p.bye : ''].filter(Boolean).join(' · ')}
          </span>
        )}
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

// ── Manage Roster (Taxi / IR) ────────────────────────────────────────────────
// Only rendered for the signed-in owner's own team. Drives MFL's real taxi/IR
// forms via the data-layer helpers: eligibility is exactly what MFL renders, and
// each action is a confirmed single-player delta, re-verified by re-reading the
// roster feed afterward. All identifiers below come from the live data layer;
// guarded so the sample/demo build (no write layer) never references them.
const MBtn = ({ tone, onClick, children, disabled }) => (
  <button className={'rb-mbtn' + (tone ? ' rb-mbtn--' + tone : '')} onClick={onClick} disabled={disabled}>{children}</button>
);
const MngRow = ({ p, children }) => (
  <div className="rb-mng__row">
    <PlayerPhoto p={p} />
    <div className="rb-mng__id">
      <div className="rb-mng__name">{p.name}</div>
      <div className="rb-mng__sub">{[p.pos, p.team, p.bye ? 'Bye ' + p.bye : ''].filter(Boolean).join(' · ')}</div>
    </div>
    <div className="rb-mng__acts">{children}</div>
  </div>
);
const BUCKET_LABEL = { ROSTER: 'Active Roster', TAXI_SQUAD: 'Taxi Squad', INJURED_RESERVE: 'Injured Reserve' };
const ManageModal = ({ team, targetFid, commish, onClose, onChanged }) => {
  const [actions, setActions] = useState(null);  // { taxi, ir } once loaded
  const [loadErr, setLoadErr] = useState(false); // false | error message string
  const [busy, setBusy] = useState(null);        // pid mid-submit
  const [pending, setPending] = useState(null);  // { kind, pid, name, text, warn }
  const [result, setResult] = useState(null);    // { ok, name, bucket, err }

  const load = async () => {
    setActions(null); setLoadErr(false);
    try {
      const a = await rbLoadActions(targetFid, commish);
      // Safety: confirm MFL scoped the form to the intended franchise before we
      // ever offer an action — otherwise a commish request could target the
      // wrong team. Block rather than risk moving the wrong player.
      const gotFid = (a.taxi && a.taxi.fid) || (a.ir && a.ir.fid) || null;
      if (gotFid && targetFid && gotFid !== targetFid) {
        setLoadErr('MFL returned a different franchise (' + gotFid + ' ≠ ' + targetFid + '); actions blocked to avoid changing the wrong team.');
        return;
      }
      setActions(a);
      if (!a.taxi && !a.ir) setLoadErr('Couldn’t load MFL eligibility (are you signed in?).');
    } catch (e) { setLoadErr('Couldn’t load MFL eligibility (are you signed in?).'); }
  };
  useEffect(() => { load(); }, []);

  const r = buildRoster(team);
  const active = r.groups.reduce((acc, g) => acc.concat(g.players), []);
  const moveFor = (kind, pid) => actions && actions[kind] && actions[kind].moves[pid];
  // Drop is offered only when MFL scoped the add_drop form to THIS franchise
  // (a regular owner's own team, or the commish where add_drop honors the id).
  const canDrop = !!(actions && actions.drop && actions.drop.fid && actions.drop.fid === targetFid);
  const dropBtn = (p) => canDrop && (
    <MBtn tone="drop" disabled={busy === p.pid}
      onClick={ask('drop', p.pid, p.name,
        'Drop ' + p.name + '? This releases the player to free agency.',
        'This cannot be undone — the player leaves your roster and any redshirt / eligibility on this copy is forfeited.')}>Drop</MBtn>
  );

  const confirmMove = async () => {
    const { kind, pid, name } = pending;
    setPending(null); setBusy(pid); setResult(null);
    try {
      let res;
      if (kind === 'drop') res = await rbSubmitDrop(actions.drop, pid);
      else { const a = actions[kind], mv = a.moves[pid]; res = await rbSubmitMove(a.actionUrl, a.hidden, mv.name, pid); }
      await rbReloadRosters();
      const bucket = rbStatusOf(team, pid);
      // A drop is confirmed only if the player actually left the roster feed
      // (MFL returns 200 even when it rejects, so trust the re-read, not res.ok).
      const ok = kind === 'drop' ? !bucket : res.ok;
      setResult({ ok, name, bucket, dropped: kind === 'drop' });
      setActions(await rbLoadActions(targetFid, commish));
      onChanged();
    } catch (e) {
      setResult({ ok: false, name, err: e && e.message, dropped: pending.kind === 'drop' });
    } finally { setBusy(null); }
  };

  const ask = (kind, pid, name, text, warn) => () => setPending({ kind, pid, name, text, warn });

  return (
    <div className="rb-modal" role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target.classList.contains('rb-modal')) onClose(); }}>
      <div className="rb-modal__box">
        <div className="rb-modal__head">
          <div>
            <div className="rb-modal__eyebrow">Manage Roster</div>
            <div className="rb-modal__title">{TEAMS[team].name}</div>
          </div>
          <button className="rb-modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="rb-modal__note">{commish && <b>Acting as commissioner on {TEAMS[team].name}. </b>}Moves run against MFL live and take effect immediately. Only actions MFL currently permits appear here — MFL enforces every eligibility and lock rule.</div>
        <div className="rb-modal__note rb-modal__note--rs">◎ A player must remain on the Taxi Squad or Injured Reserve through the end of the {SEASON} season to earn that redshirt — activating them back to the active roster before season's end forfeits it.</div>

        {actions === null && !loadErr && <div className="rb-mng__load">Loading eligibility from MFL…</div>}
        {loadErr && <div className="rb-mng__load rb-mng__load--err">{loadErr} <MBtn onClick={load}>Retry</MBtn></div>}

        {result && (
          <div className={'rb-mng__result ' + (result.ok ? 'is-ok' : 'is-err')}>
            {result.ok
              ? (result.dropped
                  ? <span>✓ {result.name} — dropped. The player is released to free agency.</span>
                  : <span>✓ {result.name} — now on {BUCKET_LABEL[result.bucket] || 'the updated roster'}.</span>)
              : <span>⚠ {result.name} — MFL didn't confirm the {result.dropped ? 'drop' : 'move'}{result.err ? ' (' + result.err + ')' : ''}. Verify in MFL before retrying.</span>}
          </div>
        )}

        {pending && (
          <div className="rb-mng__confirm">
            <div className="rb-mng__confirm-txt">{pending.text}{pending.warn && <span className="rb-mng__warn">{pending.warn}</span>}</div>
            <div className="rb-mng__confirm-btns">
              <MBtn tone="go" onClick={confirmMove}>Confirm</MBtn>
              <MBtn onClick={() => setPending(null)}>Cancel</MBtn>
            </div>
          </div>
        )}

        {actions && (
          <div className="rb-mng__body">
            <div className="rb-mng__sec">
              <div className="rb-mng__sechead">Active Roster <span>{active.length}</span></div>
              {active.map((p) => {
                const canTaxi = (() => { const mv = moveFor('taxi', p.pid); return mv && mv.dir === 'out'; })();
                const canIR = (() => { const mv = moveFor('ir', p.pid); return mv && mv.dir === 'out'; })();
                // A player who already carries a medical redshirt cannot earn a
                // second one, so IR grants no redshirt benefit — flag it. (p.rs is
                // a list, and a prior medical redshirt is one from an earlier year.)
                const priorMed = p.rs && p.rs.find((x) => x.type === 'med' && x.year !== SEASON);
                const usedMed = !!priorMed;
                return (
                  <MngRow key={p.pid} p={p}>
                    {canTaxi && <MBtn tone="taxi" disabled={busy === p.pid}
                      onClick={ask('taxi', p.pid, p.name, 'Send ' + p.name + ' to the Taxi Squad?', 'Uses a ' + SEASON + ' redshirt (must stay on taxi through season end) — the player can’t score while on taxi.')}>→ Taxi</MBtn>}
                    {canIR && <MBtn tone="ir" disabled={busy === p.pid}
                      onClick={ask('ir', p.pid, p.name, 'Place ' + p.name + ' on Injured Reserve?',
                        usedMed
                          ? '⚠ ' + p.name + ' already has a medical redshirt (' + priorMed.year + '). Placing on IR will NOT grant another redshirt.'
                          : 'Applies a ' + SEASON + ' medical redshirt (must stay on IR through season end).')}>→ IR</MBtn>}
                    {canIR && usedMed && <span className="rb-mng__nors" title={'Already used a medical redshirt (' + priorMed.year + ') — going on IR will not earn another'}>no new RS</span>}
                    {dropBtn(p)}
                    {!canTaxi && !canIR && !canDrop && <span className="rb-mng__none" title="MFL offers no move for this player right now">—</span>}
                  </MngRow>
                );
              })}
            </div>

            {r.taxi.length > 0 && (
              <div className="rb-mng__sec">
                <div className="rb-mng__sechead">Taxi Squad <span>{r.taxi.length}</span></div>
                {r.taxi.map((p) => {
                  const mv = moveFor('taxi', p.pid); const canAct = mv && mv.dir === 'in';
                  return (
                    <MngRow key={'tx' + p.pid} p={p}>
                      {canAct
                        ? <MBtn tone="go" disabled={busy === p.pid}
                            onClick={ask('taxi', p.pid, p.name, 'Activate ' + p.name + ' from the Taxi Squad to your active roster?', 'Forfeits the ' + SEASON + ' redshirt.')}>Activate →</MBtn>
                        : <span className="rb-mng__none" title="MFL isn't allowing this move right now (locked or roster full)">locked</span>}
                      {dropBtn(p)}
                    </MngRow>
                  );
                })}
              </div>
            )}

            {r.ir.length > 0 && (
              <div className="rb-mng__sec">
                <div className="rb-mng__sechead">Injured Reserve <span>{r.ir.length}</span></div>
                {r.ir.map((p) => {
                  const mv = moveFor('ir', p.pid); const canAct = mv && mv.dir === 'in';
                  return (
                    <MngRow key={'ir' + p.pid} p={p}>
                      {canAct
                        ? <MBtn tone="go" disabled={busy === p.pid}
                            onClick={ask('ir', p.pid, p.name, 'Activate ' + p.name + ' from Injured Reserve to your active roster?', 'Forfeits the ' + SEASON + ' medical redshirt.')}>Activate →</MBtn>
                        : <span className="rb-mng__none" title="MFL isn't allowing this move right now (locked or roster full)">locked</span>}
                      {dropBtn(p)}
                    </MngRow>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Set Lineup (starters per slot, per week) ──────────────────────────────────
// Renders MFL's real lineup form for a chosen week: one togglable list per slot
// with the min/max MFL enforces, live per-player weekly detail (opponent + proj),
// and a running starter count. Save replays MFL's checkbox POST, then re-reads the
// form to reflect MFL's truth. Future weeks stay editable until each locks.
const LINEUP_MAX_WEEK = 18;
const fmtLock = (expires) => {
  if (!expires) return '';
  const secs = expires - Math.floor(Date.now() / 1000);
  if (secs <= 0) return 'Locked';
  const h = Math.floor(secs / 3600), d = Math.floor(h / 24);
  if (d >= 1) return 'Locks in ' + d + 'd ' + (h % 24) + 'h';
  if (h >= 1) return 'Locks in ' + h + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
  return 'Locks in ' + Math.floor(secs / 60) + 'm';
};
const LineupModal = ({ team, targetFid, commish, onClose }) => {
  const [week, setWeek] = useState(null);      // null → fetch current, then adopt MFL's week
  const [form, setForm] = useState(null);
  const [sel, setSel] = useState({});          // slot -> [pid,...] chosen starters
  const [tb, setTb] = useState(null);          // tiebreaker pid
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  const initFrom = (f) => {
    const s = {};
    (f.order || []).forEach((slot) => { s[slot] = (f.slots[slot] || []).filter((x) => x.checked).map((x) => x.pid); });
    setSel(s); setTb(f.tiebreaker || null);
  };
  const load = async (wk) => {
    setForm(null); setLoadErr(false); setSaveResult(null);
    try {
      const f = await rbFetchLineup(wk, targetFid, commish);
      if (!f) { setLoadErr('Couldn’t read the lineup form from MFL.'); return; }
      if (f.fid && targetFid && f.fid !== targetFid) {
        setLoadErr('MFL returned a different franchise (' + f.fid + ' ≠ ' + targetFid + '); lineup blocked to avoid changing the wrong team.'); return;
      }
      setForm(f); setWeek(f.week); initFrom(f);
    } catch (e) { setLoadErr('Couldn’t load the lineup (are you signed in?).'); }
  };
  useEffect(() => { load(null); }, []);        // initial → current editable week

  const total = form ? Object.keys(sel).reduce((n, slot) => n + (sel[slot] || []).length, 0) : 0;
  const slotOk = (slot) => { const n = (sel[slot] || []).length; const rq = form.req[slot] || { min: 0, max: 99 }; return n >= rq.min && n <= rq.max; };
  const valid = !!form && form.order.every(slotOk)
    && (!form.minStarters || total >= form.minStarters) && (!form.maxStarters || total <= form.maxStarters);
  const locked = !!(form && form.expires && Math.floor(Date.now() / 1000) > form.expires);

  const toggle = (slot, pid) => {
    if (locked || busy) return;
    setSel((cur) => {
      const arr = cur[slot] || [];
      if (arr.indexOf(pid) >= 0) return Object.assign({}, cur, { [slot]: arr.filter((x) => x !== pid) });
      const tot = Object.keys(cur).reduce((n, s) => n + (cur[s] || []).length, 0);
      const rq = (form.req[slot]) || { max: 99 };
      if (arr.length >= rq.max) return cur;                         // this slot is full
      if (form.maxStarters && tot >= form.maxStarters) return cur;  // total starters full
      return Object.assign({}, cur, { [slot]: arr.concat(pid) });
    });
  };
  const save = async () => {
    setBusy(true); setSaveResult(null);
    try {
      const res = await rbSubmitLineup(form, sel, tb);
      const fresh = await rbFetchLineup(week, targetFid, commish);  // re-read = MFL truth
      if (fresh) { setForm(fresh); initFrom(fresh); }
      setSaveResult({ ok: res.ok });
    } catch (e) { setSaveResult({ ok: false, err: e && e.message }); }
    finally { setBusy(false); }
  };

  const startWk = week || (form && form.week) || 1;
  const weekOpts = [];
  for (let w = startWk; w <= LINEUP_MAX_WEEK; w++) weekOpts.push(w);
  const selectedPids = form ? form.order.reduce((acc, slot) => acc.concat(sel[slot] || []), []) : [];

  return (
    <div className="rb-modal" role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target.classList.contains('rb-modal')) onClose(); }}>
      <div className="rb-modal__box rb-modal__box--wide">
        <div className="rb-modal__head">
          <div>
            <div className="rb-modal__eyebrow">Set Lineup</div>
            <div className="rb-modal__title">{TEAMS[team].name}</div>
          </div>
          <button className="rb-modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="rb-modal__note">
          {commish && <b>Acting as commissioner on {TEAMS[team].name}. </b>}
          Pick your starters and Save — this posts to MFL live. Future weeks stay editable until each locks at kickoff.
        </div>

        <div className="rb-lu__bar">
          <label className="rb-lu__wk">Week&nbsp;
            <select value={week || ''} disabled={!form || busy} onChange={(e) => { const w = parseInt(e.target.value, 10); setWeek(w); load(w); }}>
              {weekOpts.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          {form && <span className={'rb-lu__lock' + (locked ? ' is-locked' : '')}>{locked ? '🔒 Locked' : fmtLock(form.expires)}</span>}
          {form && <span className={'rb-lu__count' + (valid ? ' is-ok' : '')}>{total} / {form.maxStarters || '?'} starters</span>}
        </div>

        {form === null && !loadErr && <div className="rb-mng__load">Loading week {week || ''} from MFL…</div>}
        {loadErr && <div className="rb-mng__load rb-mng__load--err">{loadErr} <MBtn onClick={() => load(week)}>Retry</MBtn></div>}
        {saveResult && (
          <div className={'rb-mng__result ' + (saveResult.ok ? 'is-ok' : 'is-err')}>
            {saveResult.ok
              ? <span>✓ Lineup saved for Week {week}.</span>
              : <span>⚠ MFL didn't confirm the save{saveResult.err ? ' (' + saveResult.err + ')' : ''}. Verify in MFL.</span>}
          </div>
        )}

        {form && (
          <div className="rb-mng__body">
            {form.order.map((slot) => {
              const rq = form.req[slot] || { min: 0, max: 0 };
              const n = (sel[slot] || []).length;
              const label = rq.min === rq.max ? ('Start ' + rq.min) : ('Start ' + rq.min + '–' + rq.max);
              return (
                <div className="rb-mng__sec" key={slot}>
                  <div className="rb-mng__sechead">
                    {slot} <span>{label}</span>
                    <span className={'rb-lu__slotn' + (n >= rq.min && n <= rq.max ? ' is-ok' : '')}>{n} picked</span>
                  </div>
                  {(form.slots[slot] || []).map((rowp) => {
                    const p = PLAYERS_BY_ID[rowp.pid] || { name: rowp.pid, pos: '', team: '' };
                    const on = (sel[slot] || []).indexOf(rowp.pid) >= 0;
                    const inj = p.injury ? p.injury[0] : null;
                    return (
                      <button key={rowp.pid} type="button"
                        className={'rb-lu__row' + (on ? ' is-on' : '')}
                        disabled={locked || busy}
                        onClick={() => toggle(slot, rowp.pid)}>
                        <span className={'rb-lu__check' + (on ? ' is-on' : '')}>{on ? '✓' : ''}</span>
                        <span className="rb-lu__pname">
                          {displayName(p.name)}
                          <span className="rb-lu__pmeta">{[p.pos, p.team].filter(Boolean).join(' · ')}{rowp.opp ? ' · ' + rowp.opp : ''}</span>
                        </span>
                        {inj && <span className={'rb-lu__inj rb-lu__inj--' + inj.toLowerCase()}>{inj}</span>}
                        <span className="rb-lu__proj">{rowp.proj != null ? rowp.proj.toFixed(1) : '—'}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            <div className="rb-lu__foot">
              <label className="rb-lu__tb">Tie-breaker&nbsp;
                <select value={tb || ''} disabled={locked || busy} onChange={(e) => setTb(e.target.value || null)}>
                  <option value="">(none)</option>
                  {selectedPids.map((pid) => { const p = PLAYERS_BY_ID[pid] || { name: pid }; return <option key={pid} value={pid}>{displayName(p.name)}</option>; })}
                </select>
              </label>
              <MBtn tone="go" disabled={!valid || locked || busy} onClick={save}>{busy ? 'Saving…' : 'Save Lineup'}</MBtn>
            </div>
            {!valid && !locked && <div className="rb-lu__hint">Pick within each slot’s range and exactly {form.maxStarters || form.minStarters} starters to enable Save.</div>}
          </div>
        )}
      </div>
    </div>
  );
};

const App = () => {
  // Always default to the signed-in franchise on load/refresh. Tab switches
  // navigate within the session (React state) but are intentionally NOT
  // persisted, so a refresh returns to your own team.
  const [team, setTeam] = useState(() => (TEAMS[MY_TEAM] ? MY_TEAM : TEAM_ORDER[0]));
  const [manage, setManage] = useState(false);
  const [lineup, setLineup] = useState(false);
  const [, setRev] = useState(0); // bump to re-render after a roster move rewrites module state
  const t = TEAMS[team];
  const r = buildRoster(team);
  // Writes: a regular owner may manage only their OWN team; the commissioner
  // ('0000') may manage whichever team is being viewed (MFL lets the commish act
  // on any franchise). Demo builds without MY_FID are excluded.
  const isCommish = typeof MY_FID !== 'undefined' && MY_FID === '0000';
  const canManage = typeof MY_FID !== 'undefined' && !!MY_FID && !!TEAMS[team]
    && (isCommish || team === MY_TEAM);
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
        <div className="rb-team__aside">
          <div className="rb-team__kpis">
            <div className="rb-kpi"><span className="rb-kpi__label">Points</span><span className="rb-kpi__val is-gold cffb-num">{r.totalPts.toFixed(2)}</span></div>
            <div className="rb-kpi"><span className="rb-kpi__label">Roster</span><span className="rb-kpi__val cffb-num">{r.count}</span></div>
            <div className="rb-kpi"><span className="rb-kpi__label">Redshirting</span><span className="rb-kpi__val cffb-num">{r.rsCount}</span></div>
            <div className="rb-kpi"><span className="rb-kpi__label">Out</span><span className="rb-kpi__val cffb-num" style={r.outCount ? { color: '#D88787' } : null}>{r.outCount}</span></div>
          </div>
          {canManage && <div className="rb-team__btns">
            <button className="rb-manage-btn" onClick={() => setManage(true)} title="Move players to/from Taxi Squad or Injured Reserve, or drop them">⚙ Manage Roster</button>
            <button className="rb-manage-btn rb-manage-btn--alt" onClick={() => setLineup(true)} title="Set your starting lineup for this or a future week">📋 Set Lineup</button>
          </div>}
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
      {manage && canManage && <ManageModal team={team} targetFid={TEAMS[team].fid} commish={isCommish} onClose={() => setManage(false)} onChanged={() => setRev((v) => v + 1)} />}
      {lineup && canManage && <LineupModal team={team} targetFid={TEAMS[team].fid} commish={isCommish} onClose={() => setLineup(false)} />}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
