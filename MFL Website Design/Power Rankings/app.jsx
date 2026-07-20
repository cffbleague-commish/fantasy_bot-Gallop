// CFFB · Power Rankings — app composition

const { useState: useStateA, useMemo } = React;

const App = () => {
  const [conf, setConf] = useStateA('all');
  const [selected, setSelected] = useStateA(STANDINGS[0].id);

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
    <div className="frame">
      <div className="topbar">
        <h1 className="topbar__h1">Power Rankings</h1>
        <span className="topbar__spacer" />
        <div className="topbar__week">
          <span className="topbar__week-lbl">{(window.CFFB_SEASON || 2025) + ' Season'}</span>
          <span className="topbar__week-val">Through Week {WEEKS_PLAYED}</span>
        </div>
      </div>

      <div className="page">
        <div className="page-head">
          <span className="page-head__sub">
            {conf === 'all'
              ? <React.Fragment>All <strong>{STANDINGS.length}</strong> managers, ranked by <strong>CFFB Score</strong> — all-play %, head-to-head record and scoring, weighted. Top 25 shown first; scroll the ladder for the full field.</React.Fragment>
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
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
