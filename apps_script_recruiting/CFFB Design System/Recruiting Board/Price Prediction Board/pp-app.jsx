// CFFB · Price Prediction Board — app composition

const { useState: useApp, useMemo: useAppMemo } = React;

const App = () => {
  const [year, setYear] = useApp(2026);
  const [q, setQ] = useApp('');
  const [activeId, setActiveId] = useApp(null);
  const [view, setView] = useApp('desktop'); // 'desktop' | 'mobile'
  const [info, setInfo] = useApp(false);

  // counts per year for the selector badges
  const counts = useAppMemo(() => {
    const m = {};
    PROSPECTS.forEach((p) => { m[p.y] = (m[p.y] || 0) + 1; });
    return m;
  }, []);

  const rows = useAppMemo(() => year === 'all' ? PROSPECTS : PROSPECTS.filter((p) => p.y === year), [year]);

  // default selection = #1 (top composite) of the active year
  const ranked = useAppMemo(() => [...rows].sort((a, b) => b.score - a.score), [rows]);
  const selected = useAppMemo(() => {
    const inYear = ranked.find((p) => p.id === activeId);
    return inYear || ranked[0] || null;
  }, [ranked, activeId]);

  const onYear = (y) => { setYear(y); setActiveId(null); setQ(''); };

  return (
    <React.Fragment>
    <div className={'stage stage--' + view}>
    <div className="frame">
      {/* ---- Top bar ---- */}
      <div className="topbar">
        <div className="topbar__brand">
          <span className="topbar__h1">Price Prediction</span>
        </div>
        <div className="topbar__spacer" />
        <InfoButton onClick={() => setInfo(true)} />
        <div className="topbar__feed">
          <LiveDot />
          <div className="topbar__feed-txt">
            <span className="topbar__feed-lbl">Model feed</span>
            <span className="topbar__feed-val">Live · synced 0:14 ago</span>
          </div>
        </div>
      </div>

      {/* ---- Year selector ---- */}
      <YearSelector active={year} onChange={onYear} counts={counts} total={PROSPECTS.length} />

      {/* ---- Sticky detail panel ---- */}
      <div className="dpanel-wrap">
        <DetailPanel p={selected} />
      </div>

      {/* ---- Big board ---- */}
      <div className="page">
        <div className="board-head">
          <span className="board-head__title">{year === 'all' ? 'All Classes' : year} Big Board</span>
          <span className="board-head__meta">{rows.length} prospects · ranked by composite · projections per copy</span>
          <span className="board-head__hint">Tap a prospect to load the prediction above</span>
        </div>
        <BigBoard rows={rows} activeId={selected ? selected.id : null} onSelect={setActiveId} q={q} setQ={setQ} showYear={year === 'all'} />
      </div>
    </div>
    </div>

    <Methodology open={info} onClose={() => setInfo(false)} />

    {/* ---- Desktop / Mobile preview toggle ---- */}
    <div className="viewtoggle" role="group" aria-label="Preview size">
      <button className={'viewtoggle__btn' + (view === 'desktop' ? ' is-on' : '')} onClick={() => setView('desktop')}>
        <svg className="viewtoggle__ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></svg>
        Desktop
      </button>
      <button className={'viewtoggle__btn' + (view === 'mobile' ? ' is-on' : '')} onClick={() => setView('mobile')}>
        <svg className="viewtoggle__ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
        Mobile
      </button>
    </div>
    </React.Fragment>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
