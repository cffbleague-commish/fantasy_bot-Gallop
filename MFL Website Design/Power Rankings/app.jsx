// CFFB · Power Rankings — app composition

const { useState: useStateA, useMemo } = React;

const App = () => {
  const [conf, setConf] = useStateA('all');
  const [selected, setSelected] = useStateA(STANDINGS[0].id);
  const [view, setView] = useStateA('desktop'); // 'desktop' | 'mobile'

  const confName = (CONFERENCES.find((c) => c.id === conf) || {}).name;

  // Filtered + re-ranked within the active conference view.
  const rows = useMemo(() => {
    const base = conf === 'all' ? STANDINGS : STANDINGS.filter((r) => r.conf === conf);
    return base; // already sorted by CFFB Score; rank shown is league rank
  }, [conf]);

  // Keep a valid selection inside the current filter.
  const selRow = rows.find((r) => r.id === selected) || rows[0];
  const selId = selRow ? selRow.id : null;

  const onConf = (c) => {
    setConf(c);
    const base = c === 'all' ? STANDINGS : STANDINGS.filter((r) => r.conf === c);
    if (!base.some((r) => r.id === selected)) setSelected(base[0].id);
  };

  return (
    <React.Fragment>
    <div className={'stage stage--' + view}>
    <div className="frame">
      {/* ---- Top bar ---- */}
      <div className="topbar">
        <h1 className="topbar__h1">Power Rankings</h1>
        <span className="topbar__spacer" />
        <div className="topbar__week">
          <span className="topbar__week-lbl">2026 Season</span>
          <span className="topbar__week-val">Through Week {WEEKS_PLAYED}</span>
        </div>
      </div>

      <div className="page">
        <div className="page-head">
          <span className="page-head__sub">
            {conf === 'all'
              ? <React.Fragment>All <strong>100</strong> managers, ranked by <strong>CFFB Score</strong> — all-play %, head-to-head record and scoring, weighted. Top 25 shown first; scroll the ladder for the full field.</React.Fragment>
              : <React.Fragment>Showing <strong>{confName}</strong> — {rows.length} teams, league rank preserved. Click any team for its weekly results.</React.Fragment>}
          </span>
        </div>

        <ConfFilter active={conf} onChange={onConf} />

        <div className="layout">
          <RankingTable rows={rows} selected={selId} onSelect={setSelected} confName={confName} />
          {selRow && <DetailPanel r={selRow} />}
        </div>

        <div className="charts">
          <LeagueScatter rows={rows} selected={selId} onSelect={setSelected} />
          {selRow && <WeeklyChart r={selRow} />}
        </div>
      </div>
    </div>
    </div>

    <div className="viewtoggle" role="group" aria-label="Preview size">
      <button className={'viewtoggle__btn' + (view === 'desktop' ? ' is-on' : '')} onClick={() => setView('desktop')}>
        <svg className="viewtoggle__ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>
        Desktop
      </button>
      <button className={'viewtoggle__btn' + (view === 'mobile' ? ' is-on' : '')} onClick={() => setView('mobile')}>
        <svg className="viewtoggle__ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>
        Mobile
      </button>
    </div>
    </React.Fragment>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
