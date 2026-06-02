// CFFB · Auction Board — app composition

const { useState, useMemo } = React;

const App = () => {
  const [conf, setConf] = useState('sec');
  const [view, setView] = useState('desktop'); // 'desktop' | 'mobile'

  // counts of live lots per conference (for filter badges)
  const liveCounts = useMemo(() => {
    const m = {};
    LIVE_LOTS.forEach((l) => { m[l.conf] = (m[l.conf] || 0) + 1; });
    return m;
  }, []);

  const confMeta = CONFERENCES.find((c) => c.id === conf);
  const teams = useMemo(
    () => Object.entries(TEAMS).filter(([, t]) => t.conf === conf).map(([id, t]) => ({ id, ...t })),
    [conf]
  );
  const live = useMemo(() => LIVE_LOTS.filter((l) => l.conf === conf), [conf]);
  const done = useMemo(() => COMPLETED.filter((c) => c.conf === conf), [conf]);

  const totalRemain = teams.reduce((s, t) => s + (t.budget - t.spent), 0);
  const totalBudget = teams.reduce((s, t) => s + t.budget, 0);

  return (
    <React.Fragment>
      <div className={'stage stage--' + view}>
        <div className="frame">
          {/* ---- Top bar ---- */}
          <div className="topbar">
            <div className="topbar__title">
              <h1 className="topbar__h1">Auction Board</h1>
              <LiveIndicator label="Live" />
            </div>
            <div className="topbar__spacer" />
            <div className="topbar__pool">
              <span className="topbar__pool-label">{confMeta.name} Pool Left</span>
              <span className="topbar__pool-val cffb-gold-grad-text">${totalRemain.toLocaleString()}</span>
            </div>
          </div>

          <div className="page">
            {/* ---- Header ---- */}
            <div className="page-head">
              <div className="page-head__sub">
                Bidding open across <strong>{confMeta.name}</strong> · {live.length} lots on the block · {done.length} sold
              </div>
            </div>

            {/* ---- Conference filter ---- */}
            <ConfFilter active={conf} counts={liveCounts} onChange={setConf} />

            {/* ---- Top: On the Block + Team Funds side by side ---- */}
            <div className="top">
              <section className="section top__live">
                <div className="section__head">
                  <span className="section__title">On the Block</span>
                  <span className="section__meta">{confMeta.name} · {live.length} live lots</span>
                </div>
                {live.length ? (
                  <LiveTable lots={live} />
                ) : (
                  <div className="empty">No live lots in {confMeta.name} right now.</div>
                )}
              </section>

              <section className="section top__funds">
                <div className="section__head">
                  <span className="section__title">Team Funds</span>
                  <span className="section__meta">${totalRemain.toLocaleString()} of ${totalBudget.toLocaleString()} left</span>
                </div>
                <div className="funds-wrap">
                  <FundsTable teams={teams} />
                </div>
              </section>
            </div>

            {/* ---- Completed: scatter + table ---- */}
            <section className="section">
              <div className="section__head">
                <span className="section__title">Completed</span>
                <span className="section__meta">{confMeta.name} · {done.length} players sold</span>
                <span className="section__spacer" />
                <span className="section__meta">Search highlights the chart</span>
              </div>
              {done.length ? (
                <CompletedPanel lots={done} />
              ) : (
                <div className="empty">No completed auctions in {confMeta.name} yet.</div>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* ---- Desktop / Mobile preview toggle ---- */}
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
