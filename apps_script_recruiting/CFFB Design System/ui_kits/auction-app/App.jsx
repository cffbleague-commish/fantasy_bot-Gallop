// CFFB UI Kit · App shell
// Top bar + ticker + screen router.

const { useState, useMemo } = React;

const TickerStrip = () => {
  // Repeat enough times to fill width for infinite scroll
  const items = useMemo(() => {
    const base = [
      { code: 'TEX',  pos: 'QB', name: 'Arch Manning',    bid: 112, delta: -14 },
      { code: 'OSU',  pos: 'WR', name: 'Jeremiah Smith',  bid: 94,  delta:  +8 },
      { code: 'ND',   pos: 'RB', name: 'Jeremiyah Love',  bid: 48,  delta:  +6 },
      { code: 'BAMA', pos: 'WR', name: 'Ryan Williams',   bid: 64,  delta:  +6 },
      { code: 'OSU',  pos: 'DB', name: 'Caleb Downs',     bid: 41,  delta:  -3 },
      { code: 'TEX',  pos: 'QB', name: 'Quinn Ewers',     bid: 78,  delta:  +7 },
      { code: 'ORE',  pos: 'QB', name: 'Dante Moore',     bid: 34,  delta:  +4 },
      { code: 'MICH', pos: 'QB', name: 'Bryce Underwood', bid: 38,  delta: -14 },
    ];
    return [...base, ...base];
  }, []);

  return (
    <div className="ticker">
      <div className="ticker__lead">
        <span className="ticker__lead-dot"></span>LIVE · ROUND 4
      </div>
      <div className="ticker__scroll">
        {items.map((it, i) => (
          <React.Fragment key={i}>
            <div className="ticker__item">
              <span className="ticker__pos" style={{ background: POS_COLORS[it.pos] || '#5A5A5A' }}>{it.pos}</span>
              <span>{it.name}</span>
              <span className="ticker__bid">${it.bid}</span>
              <span className={it.delta < 0 ? 'ticker__delta-pos' : 'ticker__delta-neg'}>
                {it.delta < 0 ? '−' : '+'}${Math.abs(it.delta)}
              </span>
            </div>
            {i < items.length - 1 && <span className="ticker__sep">·</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const TopBar = ({ route, onNav }) => (
  <div className="topbar">
    <img className="topbar__logo" src="../../assets/cffb-logo.svg" alt="CFFB" />
    <div className="topbar__league">Saturday Night Lights · 12 teams</div>
    <nav className="topbar__nav">
      {[
        { id: 'auction',  label: 'Live Auction' },
        { id: 'grades',   label: 'Class Grades' },
        { id: 'class',    label: 'My Class' },
      ].map((n) => (
        <button key={n.id}
                className={'topbar__nav-item' + (route === n.id || (route === 'player' && n.id === 'auction') ? ' is-active' : '')}
                onClick={() => onNav(n.id)}>
          {n.label}
        </button>
      ))}
    </nav>
    <div className="topbar__right">
      <div className="topbar__cap">
        <span className="topbar__cap-label">Cap Remaining</span>
        <span className="topbar__cap-val">$213</span>
      </div>
      <div className="topbar__avatar">T</div>
    </div>
  </div>
);

const App = () => {
  const [route, setRoute] = useState('auction');
  const [playerId, setPlayerId] = useState(null);

  let screen;
  if (route === 'auction')      screen = <LiveAuctionScreen onPickPlayer={(id) => { setPlayerId(id); setRoute('player'); }} />;
  else if (route === 'grades')  screen = <ClassGradesScreen />;
  else if (route === 'class')   screen = <MyClassScreen />;
  else if (route === 'player')  screen = <PlayerDetailScreen playerId={playerId} onBack={() => setRoute('auction')} />;

  return (
    <div className="app" data-screen-label={
      route === 'auction' ? '01 Live Auction' :
      route === 'grades'  ? '02 Class Grades' :
      route === 'class'   ? '03 My Class' :
      route === 'player'  ? '04 Player Detail' : route
    }>
      <TopBar route={route} onNav={setRoute} />
      <TickerStrip />
      {screen}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
