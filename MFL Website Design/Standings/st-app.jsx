// CFFB · Standings — app
const { useState, useEffect, useMemo, useRef } = React;

const fmtPct = (p) => (p * 100).toFixed(2) + '%';
const fmtPts = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const recOverall = (t) => t.wins + '\u2013' + t.losses + (t.ties ? '\u2013' + t.ties : '');
const recConf = (t) => t.confWins + '\u2013' + t.confLosses;

function useIsMobile() {
  const [m, setM] = useState(typeof matchMedia !== 'undefined' && matchMedia('(max-width: 560px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width: 560px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

function tiebreakNote(t) {
  const tb = t.tiebreak;
  const who = tb.tiedWith.join(', ');
  const base = `Tied at ${tb.confRec} in conference with ${who}.`;
  const h2h = tb.h2hW + '\u2013' + tb.h2hL;
  let how;
  if (tb.decidedBy === 'Head-to-head') how = `Conference seed set by head-to-head \u2014 went ${h2h} against the tied team${tb.tiedWith.length > 1 ? 's' : ''}.`;
  else if (tb.decidedBy === 'All-play %') how = `Head-to-head ${tb.h2hPlayed ? `was even (${h2h})` : 'did not separate them'}; seed set by all-play % (${fmtPct(t.allPlayPct)}).`;
  else if (tb.decidedBy === 'Total points') how = `Head-to-head and all-play were even; seed set by total points (${fmtPts(t.pointsFor)}).`;
  else how = `Separated by national ranking score.`;
  return base + ' ' + how;
}

// Team mark: franchise logo (FranchiseLookup URL from the payload) when present,
// else a deterministic circular chip in the team's own colors (falling back to a
// hashed hue when no colors are supplied — e.g. the standalone sample data).
const PILL_SIZE = { sm: 'cffb-team--sm', md: 'cffb-team--sm', lg: 'cffb-team--md' };

function TeamChip({ name, size, pill, bg, fg }) {
  const [src, setSrc] = React.useState(pill || null);
  React.useEffect(() => { setSrc(pill || null); }, [pill]);
  if (src) return <img className={'cffb-team ' + (PILL_SIZE[size] || 'cffb-team--sm')} src={src} alt={name} onError={() => setSrc(null)} />;
  let background = bg;
  if (!background) {
    const hues = ['#7BAFD4','#990000','#BF5700','#154733','#00274C','#461D7C','#782F40','#F47321','#0051BA','#CC0000','#002E5D','#841617','#BB0000','#013CA6','#C8102E'];
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    background = hues[h % hues.length];
  }
  const abbr = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const cls = 'cffb-team-chip' + (size === 'lg' ? ' cffb-team-chip--lg' : size === 'sm' ? ' cffb-team-chip--sm' : '');
  return <span className={cls} style={{ background, color: fg || '#fff' }}>{abbr}</span>;
}

function RankCell({ rank }) {
  const tier = rank === 1 ? 't1' : rank <= 5 ? 't5' : rank <= 10 ? 't10' : rank <= 25 ? 't25' : 'tout';
  return <span className={'st-natrank ' + tier}>#{rank}</span>;
}

// ── Team detail modal — season results + schedule ────────────────────────────
function TeamModal({ team, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    if (ref.current) ref.current.scrollTop = 0;
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!team) return null;
  const played = team.games.filter((g) => g.result);
  const upcoming = team.games.filter((g) => !g.result && g.oppName && g.oppName !== '—');
  const nextUp = upcoming.length ? Math.min(...upcoming.map((g) => g.week)) : null;

  const GameRow = ({ g }) => {
    const done = !!g.result;
    const win = g.result === 'W', loss = g.result === 'L';
    return (
      <tr className={done ? '' : 'st-sched__future'}>
        <td className="st-sched__wk cffb-num">{g.week}</td>
        <td className="st-sched__rk cffb-num">{g.oppRank > 0 && g.oppRank <= 25
          ? <span className={'st-natrank ' + (g.oppRank === 1 ? 't1' : g.oppRank <= 5 ? 't5' : g.oppRank <= 10 ? 't10' : 't25')}>#{g.oppRank}</span>
          : ''}</td>
        <td>
          <div className="st-sched__opp">
            <TeamChip name={g.oppName} size="sm" pill={g.oppPill} bg={g.oppBg} fg={g.oppFg} />
            <span className="st-sched__oppname">{g.oppName}</span>
            {g.isRivalry && (
              <span className="cffb-rivalry cffb-rivalry--solo" title="Rivalry game">
                <svg className="cffb-rivalry__icon"><use href="#cffb-icon-rivalry" /></svg>
              </span>
            )}
            {g.isConf && <span className="st-sched__tag" title="Conference game">CONF</span>}
          </div>
        </td>
        <td className="st-sched__res">
          {done
            ? <span className={'st-wl ' + (win ? 'st-wl--w' : loss ? 'st-wl--l' : 'st-wl--t')}>{g.result}</span>
            : <span className="st-wl st-wl--upc">{g.week === nextUp ? 'NEXT' : '—'}</span>}
        </td>
        <td className="st-sched__score cffb-num">
          {done
            ? <span><b className={win ? 'st-sc--win' : ''}>{fmtPts(g.teamScore)}</b> <span className="st-sc--sep">{'\u2013'}</span> {fmtPts(g.oppScore)}</span>
            : <span className="cffb-tertiary">—</span>}
        </td>
      </tr>
    );
  };

  return (
    <div className="st-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="st-modal__panel" ref={ref}>
        <button className="st-modal__x" onClick={onClose} aria-label="Close">×</button>
        <div className="st-modal__head">
          <TeamChip name={team.name} size="lg" pill={team.pill} bg={team.bg} fg={team.fg} />
          <div className="st-modal__id">
            <div className="st-modal__conf">
              <span className="cffb-label">Nat #{team.natRank} · Conf #{team.confRank}</span>
            </div>
            <h2 className="st-modal__name">{team.name}</h2>
          </div>
        </div>

        <div className="st-modal__kpis">
          {[
            ['Overall', recOverall(team)],
            ['Conf', recConf(team)],
            ['All-Play', fmtPct(team.allPlayPct)],
            ['Points For', fmtPts(team.pointsFor)],
          ].map(([l, v]) => (
            <div className="st-mk" key={l}>
              <span className="cffb-label">{l}</span>
              <span className="st-mk__v cffb-num">{v}</span>
            </div>
          ))}
        </div>

        {team.tiebreak && (
          <div className="st-tie">
            <span className="st-tie__badge">H2H</span>
            <div className="st-tie__txt">
              <span className="st-tie__lead">Conference Tiebreaker †</span>
              <span>{tiebreakNote(team)}</span>
            </div>
          </div>
        )}

        <div className="st-modal__section">
          <span className="cffb-eyebrow">Season Results &amp; Schedule</span>
        </div>
        <div className="cffb-table-wrap st-sched-wrap">
          <table className="cffb-table st-sched">
            <thead>
              <tr>
                <th style={{ width: 44 }}>Wk</th>
                <th style={{ width: 48 }} title="Opponent national rank (top 25)">Rk</th>
                <th>Opponent</th>
                <th style={{ width: 70 }}>Result</th>
                <th className="cffb-table__num" style={{ width: 140 }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {team.games.slice().sort((a, b) => a.week - b.week).map((g) => <GameRow key={g.week} g={g} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Standings table ──────────────────────────────────────────────────────────
function StandingsTable({ rows, view, onPick }) {
  const confView = view !== 'national';
  return (
    <div className="cffb-table-wrap">
      <table className="cffb-table st-table">
        <thead>
          <tr>
            {confView && <th style={{ width: 58 }} title="Conference Rank">Conf</th>}
            <th style={{ width: 64 }} title="National Rank">Nat</th>
            <th>Team</th>
            {!confView && <th style={{ width: 96 }}>Conf</th>}
            <th className="cffb-table__num" style={{ width: 92 }} title="Overall Record">Overall</th>
            <th className="cffb-table__num" style={{ width: 92 }} title="Conference Record">Conf Rec</th>
            <th className="cffb-table__num" style={{ width: 108 }} title="All-Play Percentage">All-Play%</th>
            <th className="cffb-table__num" style={{ width: 112 }} title="Total Points Scored">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const hero = t.natRank === 1;
            return (
              <tr key={t.id} className={'st-row' + (hero ? ' st-row--hero' : '') + (t.confRank <= 2 ? ' st-row--ccg' : '') + (t.confRank === 2 ? ' st-row--ccgline' : '')} onClick={() => onPick(t)} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onPick(t); }}>
                {confView && (
                  <td className={'st-confrank cffb-num' + (t.confRank <= 2 ? ' st-confrank--ccg' : '')}>
                    {t.tiebreak && <sup className="st-confrank__tb" title={'Conference tiebreaker vs ' + t.tiebreak.tiedWith.join(', ') + ' \u2014 decided by ' + t.tiebreak.decidedBy.toLowerCase()}>†</sup>}
                    {t.confRank}
                    {t.confRank <= 2 && <span className="st-ccg" title="Projected conference championship">CCG</span>}
                  </td>
                )}
                <td><RankCell rank={t.natRank} /></td>
                <td>
                  <div className="st-team">
                    <TeamChip name={t.name} size="md" pill={t.pill} bg={t.bg} fg={t.fg} />
                    <span className="st-team__name">{t.name}</span>
                  </div>
                </td>
                {!confView && <td><span className={'cffb-conf cffb-conf--' + t.confSlug}>{t.conf}</span></td>}
                <td className="cffb-table__num st-rec">{recOverall(t)}</td>
                <td className="cffb-table__num st-rec cffb-muted">{recConf(t)}</td>
                <td className="cffb-table__num">
                  <span className={t.isApLeader ? 'st-leader' : ''}>
                    {t.isApLeader && <span className="st-leader__star" title="All-Play leader">★</span>}
                    {fmtPct(t.allPlayPct)}
                  </span>
                </td>
                <td className="cffb-table__num">
                  <span className={t.isPtsLeader ? 'st-leader' : ''}>
                    {t.isPtsLeader && <span className="st-leader__star" title="Points leader">★</span>}
                    {fmtPts(t.pointsFor)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Mobile card list ─────────────────────────────────────────────────────────
function MobileList({ rows, onPick }) {
  const tierOf = (r) => r === 1 ? 't1' : r <= 5 ? 't5' : r <= 10 ? 't10' : r <= 25 ? 't25' : 'tout';
  return (
    <div className="st-mlist">
      {rows.map((t) => {
        const hero = t.natRank === 1;
        return (
          <button key={t.id} className={'st-mcard' + (hero ? ' st-mcard--hero' : '') + (t.confRank <= 2 ? ' st-mcard--ccg' : '')} onClick={() => onPick(t)}>
            <div className={'st-mcard__confrank cffb-num' + (t.confRank <= 2 ? ' st-confrank--ccg' : '')}>
              {t.tiebreak && <sup className="st-confrank__tb" title={'Tiebreaker \u2014 ' + t.tiebreak.decidedBy.toLowerCase()}>†</sup>}
              {t.confRank}
              {t.confRank <= 2 && <span className="st-ccg">CCG</span>}
            </div>
            <TeamChip name={t.name} size="md" pill={t.pill} bg={t.bg} fg={t.fg} />
            <div className="st-mcard__main">
              <div className="st-mcard__top">
                <span className="st-mcard__name">{t.name}</span>
                <span className={'st-natrank ' + tierOf(t.natRank)}>#{t.natRank}</span>
              </div>
              <div className="st-mcard__stats cffb-num">
                <span><b>{recOverall(t)}</b> OVR</span>
                <span><b>{recConf(t)}</b> CONF</span>
                <span className={t.isApLeader ? 'st-leader' : ''}>{t.isApLeader && <span className="st-leader__star">★</span>}<b>{fmtPct(t.allPlayPct)}</b> AP</span>
                <span className={t.isPtsLeader ? 'st-leader' : ''}>{t.isPtsLeader && <span className="st-leader__star">★</span>}<b>{fmtPts(t.pointsFor)}</b> PF</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
const CONF_LOGO_FILE = { b1g: 'b1g', pac: 'pac12' };
const confLogo = (name) => { const s = confSlug(name); return '../assets/conferences/' + (CONF_LOGO_FILE[s] || s) + '.png'; };

function App() {
  const [model, setModel] = useState(null);
  const [view, setView] = useState(null); // active conference name
  const [sel, setSel] = useState(null);
  const [err, setErr] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    loadStandings().then((m) => { setModel(m); setView(m.conferences[0] || null); }).catch(() => setErr(true));
  }, []);

  const counts = useMemo(() => {
    const c = {};
    if (model) model.teams.forEach((t) => { c[t.conf] = (c[t.conf] || 0) + 1; });
    return c;
  }, [model]);

  const rows = useMemo(() => {
    if (!model || !view) return [];
    return model.teams.filter((t) => t.conf === view).slice().sort((a, b) => a.confRank - b.confRank);
  }, [model, view]);

  if (err) return <div className="st-page"><p className="cffb-muted">Couldn’t load standings.</p></div>;
  if (!model) return <div className="st-page"><div className="st-loading"><span className="cffb-live__dot" /> Loading standings…</div></div>;

  return (
    <div className="st-page">
      <header className="st-head">
        <div className="st-head__title">
          <span className="cffb-eyebrow">{model.year || '2025'} Season · Through Week {model.weeksPlayed}</span>
          <h1 className="st-head__h1">League Standings</h1>
        </div>
        <div className="st-head__meta cffb-label">
          {model.teams.length} teams · {model.conferences.length} conferences
        </div>
      </header>

      <nav className="st-conffilter" role="tablist" aria-label="Conference">
        {model.conferences.map((c) => (
          <button key={c} role="tab" aria-selected={view === c}
            className={'st-conftab' + (view === c ? ' is-active' : '')} onClick={() => setView(c)}>
            <img className="st-conftab__logo" src={(model.confLogos && model.confLogos[c]) || confLogo(c)} alt=""
              onError={(e) => { e.target.style.display = 'none'; }} />
            <span className="st-conftab__name">{c}</span>
            <span className="st-conftab__count cffb-num">{counts[c] || 0}</span>
          </button>
        ))}
      </nav>

      {isMobile
        ? <MobileList rows={rows} onPick={setSel} />
        : <StandingsTable rows={rows} view={view} onPick={setSel} />}

      <p className="st-legend cffb-body-sm">
        <span className="st-leader__star">★</span> league leader · <span className="st-ccg st-ccg--inline">CCG</span> projected conference championship (top 2) · <span className="st-confrank__tb">†</span> conference tiebreaker · click any team for season results &amp; schedule
        {model.source && model.source !== 'live' && <span className="st-legend__src"> · showing sample data — paste your sheet URL in <code>st-data.jsx</code></span>}
      </p>

      {sel && <TeamModal team={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
