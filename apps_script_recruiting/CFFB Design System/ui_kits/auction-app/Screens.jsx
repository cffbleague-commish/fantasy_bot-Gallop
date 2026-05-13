// CFFB UI Kit · Screens
// Composes primitives into the four core surfaces.

const { useState } = React;

// ---------------------------------------------------------------
// Live Auction
// ---------------------------------------------------------------
const LiveAuctionScreen = ({ onPickPlayer }) => {
  const [selectedId, setSelectedId] = useState('p1');
  const onClock = PLAYERS[0];
  const board = PLAYERS.slice(1, 9);
  const team = TEAMS[onClock.team];
  return (
    <div className="page">
      <div className="page-title">
        <h1 className="page-title__h1">Live Auction</h1>
        <span className="page-title__sub">Round 4 · 18 of 24 nominations remaining</span>
      </div>

      <div className="cols-3">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* On the clock hero */}
          <div className="otc">
            <div className="otc__head">
              <LiveIndicator label="ON THE CLOCK" />
              <span style={{ color: '#9A9A9A', marginLeft: 8 }}>Tyler · Seat 4</span>
              <span className="otc__head-timer">0:08</span>
            </div>
            <div className="otc__body">
              <div className="otc__team" style={{ background: team.bg, color: team.fg }}>{onClock.team}</div>
              <div className="otc__id">
                <div className="otc__name">{onClock.name}</div>
                <div className="otc__tags">
                  <span className="otc__tag-pos" style={{ background: POS_COLORS[onClock.pos] }}>{onClock.pos}</span>
                  <ConfTag conf={onClock.conf} />
                  <span className="otc__meta">{team.name} · {onClock.cls} · {onClock.ht} {onClock.wt} · #{onClock.num}</span>
                  <Stars count={onClock.stars} size={16} />
                </div>
              </div>
              <div className="otc__bid-col">
                <div className="otc__bid-label">Current Bid</div>
                <div className="otc__bid">${onClock.bid}</div>
                <div className="otc__from">from <strong style={{color:'#F5F5F5'}}>Tyler</strong> · fair value ${onClock.proj}</div>
              </div>
            </div>
            <div className="otc__actions">
              <button className="otc__btn otc__btn--gold">Bid +$1 · $113</button>
              <button className="otc__btn otc__btn--primary">Bid +$5 · $117</button>
              <button className="otc__btn otc__btn--secondary">Auto-Max $145</button>
              <button className="otc__btn otc__btn--ghost">Pass</button>
            </div>
          </div>

          {/* Bid Board */}
          <div className="bid-board">
            <div className="bid-board__head">
              <div></div><div></div><div>Player</div><div>Bid</div><div>Fair Value</div><div>Δ</div>
            </div>
            {board.map((p) => {
              const delta = p.bid - p.proj;
              return (
                <div key={p.id}
                     className={'bid-row' + (selectedId === p.id ? ' is-selected' : '')}
                     onClick={() => { setSelectedId(p.id); onPickPlayer && onPickPlayer(p.id); }}>
                  <TeamChip code={p.team} size="md" />
                  <PosTag pos={p.pos} />
                  <div>
                    <div className="bid-row__name">{p.name}</div>
                    <div className="bid-row__meta">{TEAMS[p.team]?.name} · {p.cls} · {p.pos} #{p.posRank}</div>
                  </div>
                  <div className="bid-row__num bid-row__bid">${p.bid}</div>
                  <div className="bid-row__num bid-row__proj">${p.proj}</div>
                  <div className={'bid-row__delta ' + (delta < 0 ? 'bid-row__delta--pos' : delta > 0 ? 'bid-row__delta--neg' : 'bid-row__delta--flat')}>
                    {delta === 0 ? '±$0' : (delta > 0 ? '+' : '−') + '$' + Math.abs(delta)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right rail */}
        <div className="rail">
          <div className="kpi-grid">
            <KpiTile label="Cap Remaining"     value="$213" sub="−$14 vs plan" subTone="neg" hero />
            <KpiTile label="Class Rank"        value="#1"   sub="of 12 · league" />
            <KpiTile label="5★ Commits"        value="3"    sub="League avg 1.4" />
            <KpiTile label="Total Value"       value="$487" sub="+$72 vs proj" subTone="pos" />
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Live Activity</span>
              <span className="panel__meta">8 events</span>
            </div>
            <div className="feed">
              {ACTIVITY.map((e, i) => (
                <div key={i} className="feed__item">
                  <span className="feed__time">{e.t}</span>
                  <span><span className="feed__who">{e.who}</span> <span className="feed__what">{e.what}</span></span>
                  {e.bid && <span className="feed__bid">${e.bid}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Your Cap</span>
              <span className="panel__meta">$213 / $700</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ height: 8, background: '#1C1C1C', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: '70%', height: '100%', background: 'linear-gradient(90deg, #C9A227, #E8C547)' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9A9A9A', fontVariantNumeric: 'tabular-nums' }}>
                <span>Spent · $487</span>
                <span>Slots filled · 22 / 25</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// Class Grades
// ---------------------------------------------------------------
const ClassGradesScreen = () => (
  <div className="page">
    <div className="page-title">
      <h1 className="page-title__h1">Class Grades</h1>
      <span className="page-title__sub">Live grading · refreshed every bid · 12 teams</span>
    </div>

    <div className="cols-3">
      <div className="lb">
        <div className="lb__row lb__row--head">
          <div>Rank</div><div>Grade</div><div>Team · Owner</div>
          <div style={{ textAlign: 'right' }}>Spend</div>
          <div>Composition</div>
          <div style={{ textAlign: 'right' }}>Value</div>
          <div style={{ textAlign: 'right' }}>Cap Left</div>
        </div>
        {LEAGUE_TEAMS.map((t) => (
          <div key={t.rank} className="lb__row">
            <div className={'lb__rank ' + (t.rank <= 3 ? 'lb__rank--top' : '')}>#{t.rank}</div>
            <GradeBadge grade={t.grade} />
            <div>
              <div className="lb__team-name">{t.name}</div>
              <div className="lb__owner">{t.owner}</div>
            </div>
            <div className="lb__num">${t.spend}</div>
            <CompositionBar commits={t.commits} />
            <div className={'lb__num ' + (t.value > 0 ? 'lb__num--pos' : t.value < 0 ? 'lb__num--neg' : '')}>
              {t.value > 0 ? '+' : t.value < 0 ? '−' : '±'}${Math.abs(t.value)}
            </div>
            <div className="lb__num" style={{ color: '#9A9A9A' }}>${t.cap}</div>
          </div>
        ))}
      </div>

      <div className="rail">
        <div className="kpi-grid">
          <KpiTile label="League Spend"     value="$5,459" sub="of $8,400 cap" hero />
          <KpiTile label="Avg Class Grade"  value="B"      sub="median across league" />
          <KpiTile label="5★ Players"       value="11"     sub="of 12 commits" />
          <KpiTile label="Bids Tonight"     value="287"    sub="across 24 rounds" />
        </div>
        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">Grade Distribution</span>
            <span className="panel__meta">12 teams</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[{ g: 'A', n: 3, color: 'linear-gradient(135deg, #E8C547, #C9A227, #8B6F1F)' },
              { g: 'B', n: 5, color: '#2D7A4E' },
              { g: 'C', n: 2, color: '#C9A227' },
              { g: 'D', n: 2, color: '#B84545' }].map((b) => (
              <div key={b.g} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'Saira Condensed', fontWeight: 700, fontSize: 16, width: 20, color: '#F5F5F5' }}>{b.g}</span>
                <div style={{ flex: 1, height: 14, background: '#1C1C1C', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: (b.n / 12 * 100) + '%', height: '100%', background: b.color }}></div>
                </div>
                <span style={{ fontFamily: 'Saira Condensed', fontWeight: 700, fontSize: 16, color: '#F5F5F5', minWidth: 24, textAlign: 'right' }}>{b.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------
// Player Detail
// ---------------------------------------------------------------
const PlayerDetailScreen = ({ playerId, onBack }) => {
  const p = PLAYERS.find((x) => x.id === playerId) || PLAYERS[0];
  const team = TEAMS[p.team];
  const delta = p.bid - p.proj;
  // Simple bid distribution histogram
  const hist = [4, 8, 14, 22, 28, 22, 14, 8, 4];
  const lo = p.proj - 40, hi = p.proj + 40;
  return (
    <div className="page">
      <div className="page-title" style={{ alignItems: 'center' }}>
        <button onClick={onBack} style={{ background: '#1C1C1C', color: '#F5F5F5', border: '1px solid #2A2A2A', borderRadius: 4, padding: '6px 12px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}>
          ← Back
        </button>
        <h1 className="page-title__h1" style={{ fontSize: 28 }}>Player Detail</h1>
      </div>

      <div className="cols-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Hero card */}
          <div className="otc">
            <div className="otc__body" style={{ marginTop: 0 }}>
              <div className="otc__team" style={{ background: team.bg, color: team.fg }}>{p.team}</div>
              <div className="otc__id">
                <div className="otc__name">{p.name}</div>
                <div className="otc__tags">
                  <span className="otc__tag-pos" style={{ background: POS_COLORS[p.pos] }}>{p.pos}</span>
                  <ConfTag conf={p.conf} />
                  <span className="otc__meta">{team.name} · {p.cls} · {p.ht} {p.wt}</span>
                </div>
              </div>
              <div className="otc__bid-col">
                <div className="otc__bid-label">Current Bid</div>
                <div className="otc__bid">${p.bid}</div>
                <div className="otc__from">fair value <strong style={{ color: '#F5F5F5' }}>${p.proj}</strong></div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid #2A2A2A' }}>
              <div><div className="kpi__label">Pos Rank</div><div className="kpi__val">#{p.posRank}</div></div>
              <div><div className="kpi__label">Stars</div><div style={{ marginTop: 6 }}><Stars count={p.stars} size={20} /></div></div>
              <div><div className="kpi__label">Delta</div><div className={'kpi__val ' + (delta < 0 ? 'kpi__sub--pos' : 'kpi__sub--neg')}>
                {delta < 0 ? '−' : '+'}${Math.abs(delta)}
              </div></div>
              <div><div className="kpi__label">Last 3y Avg</div><div className="kpi__val">${p.proj - 4}</div></div>
            </div>
          </div>

          {/* Bid distribution */}
          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Historical Bid Distribution · 3yr</span>
              <span className="panel__meta">{lo} — ${hi}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, position: 'relative' }}>
              {hist.map((v, i) => (
                <div key={i} style={{ flex: 1, height: (v / Math.max(...hist) * 100) + '%', background: i === 4 ? 'linear-gradient(180deg, #E8C547, #C9A227)' : '#2A2A2A', borderRadius: '2px 2px 0 0' }}></div>
              ))}
              {/* Current bid marker */}
              <div style={{ position: 'absolute', left: ((p.bid - lo) / (hi - lo) * 100) + '%', top: 0, bottom: 0, width: 2, background: '#B84545', boxShadow: '0 0 8px rgba(184,69,69,0.6)' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#9A9A9A', fontVariantNumeric: 'tabular-nums' }}>
              <span>${lo}</span>
              <span>median ${p.proj}</span>
              <span>current ${p.bid}</span>
              <span>${hi}</span>
            </div>
          </div>
        </div>

        <div className="rail">
          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Recruiting Profile</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <ProfileRow label="Composite Rating" val="0.9842" />
              <ProfileRow label="National Rank" val="#3" />
              <ProfileRow label="Position Rank" val={`#${p.posRank} ${p.pos}`} />
              <ProfileRow label="State Rank" val="#1 TX" />
              <ProfileRow label="Top Offers" val="34" />
              <ProfileRow label="247 / On3 / Rivals" val="5 / 5 / 5" />
            </div>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Similar Players</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PLAYERS.filter((x) => x.pos === p.pos && x.id !== p.id).slice(0, 3).map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <TeamChip code={s.team} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Saira Condensed', fontWeight: 700, fontSize: 15, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#9A9A9A' }}>{TEAMS[s.team]?.name} · {s.cls}</div>
                  </div>
                  <div style={{ fontFamily: 'Saira Condensed', fontWeight: 700, color: '#E8C547', fontVariantNumeric: 'tabular-nums' }}>${s.bid}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProfileRow = ({ label, val }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid #1C1C1C' }}>
    <span style={{ color: '#9A9A9A' }}>{label}</span>
    <span style={{ fontFamily: 'Inter', fontWeight: 600, color: '#F5F5F5', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
  </div>
);

// ---------------------------------------------------------------
// My Class
// ---------------------------------------------------------------
const MyClassScreen = () => {
  const roster = PLAYERS.slice(0, 8);
  return (
    <div className="page">
      <div className="page-title">
        <h1 className="page-title__h1">My Class · '26</h1>
        <span className="page-title__sub">Burnt Orange Cartel · 22 commits · cap $487 / $700</span>
      </div>

      <div className="cols-3">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Class Summary</span>
              <span className="panel__meta">vs league</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 18, alignItems: 'center' }}>
              <GradeBadge grade="A+" size="lg" />
              <div>
                <div style={{ fontFamily: 'Saira Condensed', fontWeight: 700, fontSize: 28, textTransform: 'uppercase', lineHeight: 1, letterSpacing: '-0.01em' }}>Burnt Orange Cartel</div>
                <div style={{ fontSize: 13, color: '#9A9A9A', marginTop: 4 }}>@tyler · class of 2026 · 22 of 25 slots</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="kpi__label">Class Rank</div>
                <div className="kpi__val kpi__val--hero" style={{ fontSize: 40 }}>#1</div>
                <div style={{ fontSize: 11, color: '#9A9A9A', fontVariantNumeric: 'tabular-nums' }}>of 12 league</div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <CompositionBar commits={{ 5: 3, 4: 7, 3: 8, 2: 4 }} />
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#9A9A9A', fontVariantNumeric: 'tabular-nums' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#C9A227', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }}></span>5★ · 3</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#3B82C4', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }}></span>4★ · 7</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#7BA4C9', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }}></span>3★ · 8</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#6A6A6A', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }}></span>2★ · 4</span>
              </div>
            </div>
          </div>

          <div className="bid-board">
            <div className="bid-board__head"><div></div><div></div><div>Player</div><div>Paid</div><div>Fair Value</div><div>Δ</div></div>
            {roster.map((p) => {
              const delta = p.bid - p.proj;
              return (
                <div key={p.id} className="bid-row">
                  <TeamChip code={p.team} size="md" />
                  <PosTag pos={p.pos} />
                  <div>
                    <div className="bid-row__name">{p.name}</div>
                    <div className="bid-row__meta">{TEAMS[p.team]?.name} · {p.cls} · {p.pos} #{p.posRank}</div>
                  </div>
                  <div className="bid-row__num bid-row__bid">${p.bid}</div>
                  <div className="bid-row__num bid-row__proj">${p.proj}</div>
                  <div className={'bid-row__delta ' + (delta < 0 ? 'bid-row__delta--pos' : delta > 0 ? 'bid-row__delta--neg' : 'bid-row__delta--flat')}>
                    {delta === 0 ? '±$0' : (delta > 0 ? '+' : '−') + '$' + Math.abs(delta)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rail">
          <div className="kpi-grid">
            <KpiTile label="Total Spend"  value="$487" sub="of $700 cap" hero />
            <KpiTile label="Value Earned" value="+$72" sub="vs fair value" subTone="pos" />
            <KpiTile label="5★ Commits"   value="3" sub="league avg 1.4" />
            <KpiTile label="Cap / Slot"   value="$22" sub="3 slots left" />
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Position Breakdown</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[{ pos: 'QB', n: 3, spend: 152 }, { pos: 'RB', n: 4, spend: 86 }, { pos: 'WR', n: 5, spend: 124 }, { pos: 'TE', n: 2, spend: 28 }, { pos: 'OL', n: 4, spend: 52 }, { pos: 'DL', n: 4, spend: 45 }].map((row) => (
                <div key={row.pos} style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 10, alignItems: 'center' }}>
                  <span className="otc__tag-pos" style={{ background: POS_COLORS[row.pos], color: '#0A0A0A', fontSize: 11, padding: '3px 6px', textAlign: 'center' }}>{row.pos}</span>
                  <div style={{ height: 8, background: '#1C1C1C', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: (row.spend / 160 * 100) + '%', height: '100%', background: POS_COLORS[row.pos] }}></div>
                  </div>
                  <span style={{ fontFamily: 'Saira Condensed', fontWeight: 700, fontSize: 15, color: '#F5F5F5', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' }}>${row.spend} · {row.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { LiveAuctionScreen, ClassGradesScreen, PlayerDetailScreen, MyClassScreen });
