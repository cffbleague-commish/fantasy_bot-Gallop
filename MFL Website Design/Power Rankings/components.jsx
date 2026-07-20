// CFFB · Power Rankings — components (pill, conf filter, ranking table, detail)

const { useState } = React;

// ---- Team logo pill --------------------------------------------------------
const TeamPill = ({ id, h = 26 }) => {
  const t = TEAMS[id] || { bg: '#2A2A2A', fg: '#9A9A9A', abbr: '??', conf: 'sec' };
  if (t.pill) {
    return <span className="pill pill--img" style={{ height: h }}><img src={t.pill} alt={t.name} /></span>;
  }
  const abbr = t.abbr.length > 4 ? t.abbr.slice(0, 4) : t.abbr;
  return (
    <span className="pill pill--fb" style={{ height: h, borderRadius: Math.round(h * 0.22) }} title={t.name}>
      <span className="pill__edge" style={{ width: Math.round(h * 0.6), background: CONF_ACCENT[t.conf] || '#5A5A5A' }} />
      <span className="pill__body" style={{ background: t.bg, color: t.fg, fontSize: Math.max(11, Math.round(h * 0.46)) }}>{abbr}</span>
    </span>
  );
};

// ---- Rank movement indicator ----------------------------------------------
const Move = ({ move }) => {
  if (move > 0) return <span className="r-move r-move--up">▲{move}</span>;
  if (move < 0) return <span className="r-move r-move--down">▼{-move}</span>;
  return <span className="r-move r-move--flat">—</span>;
};

// ---- Conference filter -----------------------------------------------------
const ConfFilter = ({ active, onChange }) => (
  <div className="conf-filter" role="tablist" aria-label="Conference">
    {CONFERENCES.map((c) => (
      <button key={c.id} role="tab" aria-selected={active === c.id}
        className={'conf-tab' + (active === c.id ? ' is-active' : '')} onClick={() => onChange(c.id)}>
        {c.logo
          ? <img className="conf-tab__logo" src={c.logo} alt={c.name} />
          : <span className="conf-tab__all">★</span>}
        <span className="conf-tab__name">{c.name}</span>
        <span className="conf-tab__count">{CONF_COUNTS[c.id] || 0}</span>
      </button>
    ))}
  </div>
);

// ---- Rank prestige tier (color ramp) --------------------------------------
const rankTier = (n) => (n === 1 ? 't1' : n <= 5 ? 't5' : n <= 10 ? 't10' : n <= 25 ? 't25' : 'tout');
const tierColor = (n) => (n === 1 ? '#E8C547' : n <= 5 ? '#C9A227' : n <= 10 ? '#3B82C4' : n <= 25 ? '#7BA4C9' : '#9A9A9A');

// ---- Ranking row + table ---------------------------------------------------
const RankRow = ({ r, selected, onSelect }) => (
  <button
    className={'rrow' + (selected ? ' is-sel' : '') + (r.rank === 1 ? ' is-top1' : '')}
    onClick={() => onSelect(r.id)}
  >
    <div className="r-rank">
      <span className={'r-rank__n ' + rankTier(r.rank)}>{r.rank}</span>
      <Move move={r.move} />
    </div>
    <div className="r-team">
      <TeamPill id={r.id} h={30} />
    </div>
    <div className="r-c-spacer"></div>
    <div className="r-cell r-c-overall">
      <div className="r-rec">{r.W}–{r.L}</div>
      <div className="r-rec__sub">OVERALL</div>
    </div>
    <div className="r-cell r-c-conf">
      <div className="r-rec">{r.cW}–{r.cL}</div>
      <div className="r-rec__sub">CONF</div>
    </div>
    <div className="r-num r-c-ap">{r.allPlayPct.toFixed(1)}%</div>
    <div className="r-num r-num--dim r-c-oppap">{r.oppAllPlayPct.toFixed(1)}%</div>
    <div className="r-score">
      <span className="r-score__val">{r.cffb.toFixed(1)}</span>
    </div>
  </button>
);

const RankingTable = ({ rows, selected, onSelect, confName }) => (
  <section className="section">
    <div className="section__head">
      <span className="section__title">The Ladder</span>
      <span className="section__meta">{rows.length} teams · {confName} · sorted by CFFB Score</span>
      <span className="section__spacer" />
      <span className="section__meta">Scroll for all {rows.length}</span>
    </div>
    <div className="rtbl">
      <div className="rhead">
        <span>Rank</span>
        <span>Team</span>
        <span className="r-c-spacer"></span>
        <span className="r-c-overall">Overall</span>
        <span className="r-c-conf">Conf</span>
        <span className="r-r r-c-ap">All-Play</span>
        <span className="r-r r-c-oppap">Opp AP</span>
        <span className="r-r">CFFB</span>
      </div>
      <div className="rscroll">
        {rows.map((r) => (
          <RankRow key={r.id} r={r} selected={selected === r.id} onSelect={onSelect} />
        ))}
      </div>
    </div>
  </section>
);

// ---- Detail panel ----------------------------------------------------------
const SchedRow = ({ g, teamConf }) => {
  if (g.bye) {
    return (
      <div className="srow">
        <span className="srow__wk">Wk {g.week}</span>
        <span className="srow__res srow__res--bye">—</span>
        <span className="srow__bye">Bye week</span>
        <span />
      </div>
    );
  }
  if (g.upcoming) {
    const opp = g.opp && TEAMS[g.opp];
    return (
      <div className="srow srow--up">
        <span className="srow__wk">Wk {g.week}</span>
        <span className="srow__res srow__res--up">vs</span>
        <span className="srow__opp">
          {opp ? <TeamPill id={g.opp} h={20} /> : null}
          <span className="srow__opp-name">{opp ? opp.name : 'Bye'}</span>
        </span>
        <span className="srow__score"><span className="srow__opp-pre">upcoming</span></span>
      </div>
    );
  }
  const opp = TEAMS[g.opp];
  return (
    <div className="srow">
      <span className="srow__wk">Wk {g.week}</span>
      <span className={'srow__res srow__res--' + (g.win ? 'w' : 'l')}>{g.win ? 'W' : 'L'}</span>
      <span className="srow__opp">
        {opp ? <TeamPill id={g.opp} h={20} /> : null}
        <span className="srow__opp-name">{opp ? opp.name : 'Unknown'}</span>
      </span>
      <span className="srow__score">
        <span className="srow__score-val">{g.my.toFixed(1)} – {g.ov.toFixed(1)}</span>
        <span className="srow__score-ap">{g.ap.toFixed(0)}% AP · opp {g.oppAp.toFixed(0)}%</span>
      </span>
    </div>
  );
};

const StreakVal = ({ streak }) => {
  const cls = streak[0] === 'W' ? ' is-pos' : streak[0] === 'L' ? ' is-neg' : '';
  return <div className={'stat__val' + cls}>{streak}</div>;
};

const DetailPanel = ({ r }) => {
  const rows = [...r.games, ...r.upcoming.map((u) => ({ ...u, upcoming: true }))];
  return (
    <section className="section detail">
      <div className="detail__hero">
        <div className="detail__top">
          <TeamPill id={r.id} h={40} />
          <div className="detail__id">
            <div className="detail__owner">
              <span className="r-team__conf">{CONF_NAME[r.conf]}</span>
              <span>·</span><span>{r.owner}</span>
            </div>
          </div>
          <div className="detail__figs">
            <div className="detail__fig">
              <div className="detail__fig-lbl">Rank</div>
              <div className="detail__fig-row">
                <div className="detail__fig-val" style={{ color: tierColor(r.rank) }}>{r.rank}</div>
                <Move move={r.move} />
              </div>
            </div>
            <div className="detail__fig">
              <div className="detail__fig-lbl">CFFB</div>
              <div className="detail__fig-val" style={{ color: 'var(--gold-light)' }}>{r.cffb.toFixed(1)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="detail__stats">
        <div className="stat"><div className="stat__lbl">Overall</div><div className="stat__val">{r.W}–{r.L}</div></div>
        <div className="stat"><div className="stat__lbl">Conference</div><div className="stat__val">{r.cW}–{r.cL}</div></div>
        <div className="stat"><div className="stat__lbl">Streak</div><StreakVal streak={r.streak} /></div>
        <div className="stat"><div className="stat__lbl">All-Play %</div><div className="stat__val">{r.allPlayPct.toFixed(1)}<small>%</small></div></div>
        <div className="stat"><div className="stat__lbl">Opp All-Play</div><div className="stat__val">{r.oppAllPlayPct.toFixed(1)}<small>%</small></div></div>
        <div className="stat"><div className="stat__lbl">Pts / Game</div><div className="stat__val">{r.ppg.toFixed(1)}</div></div>
      </div>

      <div className="sched">
        <div className="sched__head">
          <span className="sched__title">Schedule · Results</span>
          <span className="section__spacer" />
          <span className="section__meta">Through Wk {WEEKS_PLAYED}</span>
        </div>
        <div className="sched__list">
          {rows.map((g, i) => <SchedRow key={i} g={g} teamConf={r.conf} />)}
        </div>
      </div>
    </section>
  );
};

Object.assign(window, { TeamPill, Move, ConfFilter, RankingTable, DetailPanel });
