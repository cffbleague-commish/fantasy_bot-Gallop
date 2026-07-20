// CFFB · Power Rankings — charts (league scatter + weekly performance)

const { useState: useStateC } = React;

// nice tick helper
const niceTicks = (min, max, n) => {
  const span = (max - min) || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  let step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  step *= mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const arr = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) arr.push(+v.toFixed(6));
  return { lo, hi, arr };
};

// ===========================================================================
// SCATTER — Points / Game (X) × All-Play % (Y). Each dot is a team.
// Selected team is ringed; hovering highlights one and dims the rest.
// ===========================================================================
const SVW = 560, SVH = 372, SM = { l: 52, r: 18, t: 18, b: 50 };

const LeagueScatter = ({ rows, selected, onSelect }) => {
  const [hover, setHover] = useStateC(null);
  const xs = rows.map((r) => r.ppg);
  const ys = rows.map((r) => r.allPlayPct);
  const xT = niceTicks(Math.min(...xs) - 2, Math.max(...xs) + 2, 5);
  const yT = niceTicks(Math.max(0, Math.min(...ys) - 5), Math.min(100, Math.max(...ys) + 5), 5);
  const iw = SVW - SM.l - SM.r, ih = SVH - SM.t - SM.b;
  const X = (v) => SM.l + (v - xT.lo) / (xT.hi - xT.lo) * iw;
  const Y = (v) => SM.t + (1 - (v - yT.lo) / (yT.hi - yT.lo)) * ih;

  const focusing = hover != null;
  const hv = hover ? rows.find((r) => r.id === hover) : null;

  return (
    <div className="chart-card">
      <div className="chart-card__head">
        <div>
          <div className="chart-card__eyebrow">League Compare</div>
          <div className="chart-card__title">Scoring × All-Play</div>
          <div className="chart-card__sub">Each dot a team · X = pts/game · Y = all-play % · color = team</div>
        </div>
      </div>
      <div className="scat-wrap">
        <svg className={'chart-svg' + (focusing ? ' is-focusing' : '')} viewBox={`0 0 ${SVW} ${SVH}`} preserveAspectRatio="xMidYMid meet">
          {yT.arr.map((v) => (
            <g key={'y' + v}>
              <line className="c-grid" x1={SM.l} y1={Y(v)} x2={SVW - SM.r} y2={Y(v)} />
              <text className="c-tick" x={SM.l - 9} y={Y(v) + 4} textAnchor="end">{v.toFixed(0)}%</text>
            </g>
          ))}
          {xT.arr.map((v) => (
            <g key={'x' + v}>
              <line className="c-grid" x1={X(v)} y1={SM.t} x2={X(v)} y2={SVH - SM.b} />
              <text className="c-tick" x={X(v)} y={SVH - SM.b + 19} textAnchor="middle">{v.toFixed(0)}</text>
            </g>
          ))}
          {/* league avg reference (vertical) */}
          <line className="c-ref" x1={X(LEAGUE_PPG)} y1={SM.t} x2={X(LEAGUE_PPG)} y2={SVH - SM.b} />
          <text className="c-ref-lbl" x={X(LEAGUE_PPG) + 5} y={SM.t + 12}>LG AVG {LEAGUE_PPG}</text>
          <line className="c-axis" x1={SM.l} y1={SVH - SM.b} x2={SVW - SM.r} y2={SVH - SM.b} />
          <line className="c-axis" x1={SM.l} y1={SM.t} x2={SM.l} y2={SVH - SM.b} />
          <text className="c-axis-title" x={SM.l + iw / 2} y={SVH - 6} textAnchor="middle">Points / Game</text>
          <text className="c-axis-title" textAnchor="middle" transform={`translate(13,${SM.t + ih / 2}) rotate(-90)`}>All-Play %</text>
          {rows.map((r) => {
            const isSel = r.id === selected;
            const isHi = !focusing || hover === r.id;
            return (
              <g key={r.id} className={'scat-dot' + (isHi ? ' is-hi' : '') + (isSel ? ' is-sel' : '')}
                 onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover((h) => (h === r.id ? null : h))}
                 onClick={() => onSelect(r.id)} style={{ cursor: 'pointer' }}>
                <circle cx={X(r.ppg)} cy={Y(r.allPlayPct)} r={13} fill="transparent" />
                <circle className="scat-dot-fill" cx={X(r.ppg)} cy={Y(r.allPlayPct)} r={isSel ? 8 : 6.5}
                        fill={r.bg} stroke={isSel ? '#E8C547' : r.fg} />
              </g>
            );
          })}
        </svg>
        {hv && (
          <div className="scat-tip is-on" style={{ left: (X(hv.ppg) / SVW * 100) + '%', top: (Y(hv.allPlayPct) / SVH * 100) + '%', transform: 'translate(14px,-50%)' }}>
            <div className="scat-tip__head">
              <TeamPill id={hv.id} h={24} />
              <span className="scat-tip__name">{hv.name}</span>
            </div>
            <dl className="scat-tip__rows">
              <div className="scat-tip__row"><dt>Rank</dt><dd>#{hv.rank}</dd></div>
              <div className="scat-tip__row"><dt>Pts / Game</dt><dd>{hv.ppg.toFixed(1)}</dd></div>
              <div className="scat-tip__row"><dt>All-Play %</dt><dd>{hv.allPlayPct.toFixed(1)}%</dd></div>
              <div className="scat-tip__row"><dt>Opp All-Play</dt><dd>{hv.oppAllPlayPct.toFixed(1)}%</dd></div>
              <div className="scat-tip__row"><dt>CFFB Score</dt><dd className="is-gold">{hv.cffb.toFixed(1)}</dd></div>
            </dl>
          </div>
        )}
      </div>
      <div className="chart-foot">
        <span className="chart-foot__key"><span className="chart-foot__sw" style={{ background: 'var(--gold)', borderRadius: 999 }} /> Selected team ringed gold</span>
        <span className="chart-foot__key"><span className="chart-foot__sw chart-foot__sw--line" /> League scoring average</span>
      </div>
    </div>
  );
};

// ===========================================================================
// WEEKLY — selected team's week-by-week Points or All-Play %.
// Points mode: team bars + opponent marker + league-avg line + W/L color.
// All-Play mode: weekly all-play % bars + 50% reference line.
// ===========================================================================
const WVW = 560, WVH = 372, WM = { l: 44, r: 18, t: 18, b: 42 };

const WeeklyChart = ({ r }) => {
  const [mode, setMode] = useStateC('points'); // 'points' | 'allplay'
  const played = r.games.filter((g) => !g.bye);
  const n = played.length;
  const iw = WVW - WM.l - WM.r, ih = WVH - WM.t - WM.b;
  const slot = iw / n;
  const bw = Math.min(30, slot * 0.56);

  let yT, valOf, fmt, refY, refLbl, oppOf;
  if (mode === 'points') {
    const allV = played.flatMap((g) => [g.my, g.ov]);
    yT = niceTicks(Math.max(0, Math.min(...allV) - 8), Math.max(...allV) + 8, 5);
    valOf = (g) => g.my; oppOf = (g) => g.ov;
    fmt = (v) => v.toFixed(0); refY = LEAGUE_PPG; refLbl = 'LG AVG ' + LEAGUE_PPG;
  } else {
    yT = niceTicks(0, 100, 5);
    valOf = (g) => g.ap; oppOf = (g) => g.oppAp;
    fmt = (v) => v.toFixed(0) + '%'; refY = 50; refLbl = '50% — even';
  }
  const Y = (v) => WM.t + (1 - (v - yT.lo) / (yT.hi - yT.lo)) * ih;
  const cx = (i) => WM.l + slot * i + slot / 2;

  return (
    <div className="chart-card">
      <div className="chart-card__head">
        <div>
          <div className="chart-card__eyebrow">Week by Week</div>
          <div className="chart-card__title">{r.name}</div>
          <div className="chart-card__sub">{mode === 'points' ? 'Points scored each week vs opponent' : 'All-play win % each week (vs the field)'}</div>
        </div>
        <div className="modes" role="tablist">
          <button className={'modes__btn' + (mode === 'points' ? ' is-active' : '')} onClick={() => setMode('points')}>Points</button>
          <button className={'modes__btn' + (mode === 'allplay' ? ' is-active' : '')} onClick={() => setMode('allplay')}>All-Play %</button>
        </div>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${WVW} ${WVH}`} preserveAspectRatio="xMidYMid meet">
        {yT.arr.map((v) => (
          <g key={'y' + v}>
            <line className="c-grid" x1={WM.l} y1={Y(v)} x2={WVW - WM.r} y2={Y(v)} />
            <text className="c-tick" x={WM.l - 8} y={Y(v) + 4} textAnchor="end">{fmt(v)}</text>
          </g>
        ))}
        <line className="c-ref" x1={WM.l} y1={Y(refY)} x2={WVW - WM.r} y2={Y(refY)} />
        <text className="c-ref-lbl" x={WVW - WM.r} y={Y(refY) - 5} textAnchor="end">{refLbl}</text>
        <line className="c-axis" x1={WM.l} y1={WVH - WM.b} x2={WVW - WM.r} y2={WVH - WM.b} />
        {played.map((g, i) => {
          const v = valOf(g);
          const x = cx(i), y0 = WVH - WM.b, y1 = Y(v);
          const win = mode === 'points' ? g.win : v >= 50;
          const fill = win ? r.bg : '#2A2A2A';
          const stroke = win ? r.fg : '#4A4A4A';
          return (
            <g key={i}>
              <rect className="c-bar" x={x - bw / 2} y={y1} width={bw} height={Math.max(0, y0 - y1)} rx="2"
                    fill={fill} stroke={stroke} strokeWidth="1" />
              {oppOf && (
                <line className="c-opp" x1={x - bw / 2 - 2} x2={x + bw / 2 + 2} y1={Y(oppOf(g))} y2={Y(oppOf(g))} stroke="#9A9A9A" />
              )}
              <text className="c-bar-lbl" x={x} y={y1 - 6}>{fmt(v)}</text>
              <text className="c-wk-lbl" x={x} y={WVH - WM.b + 16}>{g.week}</text>
            </g>
          );
        })}
        <text className="c-axis-title" x={WM.l + iw / 2} y={WVH - 4} textAnchor="middle">Week</text>
      </svg>
      <div className="chart-foot">
        <span className="chart-foot__key"><span className="chart-foot__sw" style={{ background: r.bg, boxShadow: 'inset 0 0 0 1px ' + r.fg }} /> {mode === 'points' ? 'Win' : 'Above 50%'}</span>
        <span className="chart-foot__key"><span className="chart-foot__sw" style={{ background: '#2A2A2A' }} /> {mode === 'points' ? 'Loss' : 'Below 50%'}</span>
        {oppOf && <span className="chart-foot__key"><span className="chart-foot__sw" style={{ background: '#9A9A9A', height: 2 }} /> Opponent {mode === 'points' ? 'score' : 'all-play'}</span>}
      </div>
    </div>
  );
};

Object.assign(window, { LeagueScatter, WeeklyChart });
