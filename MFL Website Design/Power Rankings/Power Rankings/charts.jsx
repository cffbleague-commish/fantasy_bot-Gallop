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

// ===========================================================================
// RANK TRAIL — the selected team's discrete week-by-week ladder movement.
//   'trail' : bump line of league rank over the season (rank 1 = top).
//   'move'  : diverging columns — spots CLIMBED (up/green) or DROPPED
//             (down/red) each week vs the prior week.
// ===========================================================================
const RTVW = 1120, RTVH = 288, RTM = { l: 48, r: 22, t: 24, b: 40 };
const _lum = (hex) => { const c = hex.replace('#', ''); const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

const RankTrail = ({ r }) => {
  const [mode, setMode] = useStateC('trail'); // 'trail' | 'shift'
  const hist = r.rankHist || [];
  const moves = r.moves || [];
  const n = hist.length;
  const iw = RTVW - RTM.l - RTM.r, ih = RTVH - RTM.t - RTM.b;
  const slot = iw / n;
  const cx = (i) => RTM.l + slot * i + slot / 2;
  const lineCol = _lum(r.bg) < 0.3 ? r.fg : r.bg;

  const best = Math.min(...hist), worst = Math.max(...hist);
  const start = hist[0];
  // cumulative shift vs the season-opening rank (+ = net spots climbed since Wk 1)
  const cum = hist.map((rk) => start - rk);
  const net = cum[n - 1];

  // --- trail geometry (fixed full 1–100 ladder range · rank 1 at the top) ---
  const lo = 1, hi = 100;
  const Yr = (rank) => RTM.t + (rank - lo) / (hi - lo) * ih;
  const rTicks = [1, 20, 40, 60, 80, 100];
  // step-before path: hold rank until the week mark, then jump — reads as discrete weeks
  let trailD = `M ${cx(0)} ${Yr(hist[0])}`;
  for (let i = 1; i < n; i++) trailD += ` L ${cx(i)} ${Yr(hist[i - 1])} L ${cx(i)} ${Yr(hist[i])}`;

  // --- cumulative-shift geometry (stepped area around the season-start baseline) ---
  const cMax = Math.max(1, ...cum.map((v) => Math.abs(v)));
  const zeroY = RTM.t + ih / 2;
  const half = ih / 2 - 10;
  const Yc = (v) => zeroY - (v / cMax) * half;
  const cStep = Math.max(1, Math.ceil(cMax / 2));
  const cTicks = [];
  for (let v = -cMax; v <= cMax; v += cStep) cTicks.push(v);
  if (cTicks.indexOf(0) < 0) cTicks.push(0);
  // stepped line + closed area down to the zero baseline
  let cumLineD = `M ${cx(0)} ${Yc(cum[0])}`;
  for (let i = 1; i < n; i++) cumLineD += ` L ${cx(i)} ${Yc(cum[i - 1])} L ${cx(i)} ${Yc(cum[i])}`;
  const cumAreaD = `M ${cx(0)} ${zeroY} L ${cx(0)} ${Yc(cum[0])}` +
    cum.slice(1).map((v, k) => ` L ${cx(k + 1)} ${Yc(cum[k])} L ${cx(k + 1)} ${Yc(v)}`).join('') +
    ` L ${cx(n - 1)} ${zeroY} Z`;

  return (
    <div className="chart-card chart-card--wide">
      <div className="chart-card__head">
        <div>
          <div className="chart-card__eyebrow">Ladder Movement</div>
          <div className="chart-card__title">Rank Trail — {r.name}</div>
          <div className="chart-card__sub">{mode === 'trail' ? 'League rank after each week · rank 1 at the top' : 'Cumulative spots climbed or dropped since the Week 1 ranking'}</div>
        </div>
        <div className="rt-head-right">
          <div className="rt-summary">
            <span className="rt-sum"><span className="rt-sum__lbl">Best</span><span className="rt-sum__val">#{best}</span></span>
            <span className="rt-sum"><span className="rt-sum__lbl">Worst</span><span className="rt-sum__val">#{worst}</span></span>
            <span className="rt-sum"><span className="rt-sum__lbl">Season Shift</span><span className={'rt-sum__val ' + (net > 0 ? 'is-pos' : net < 0 ? 'is-neg' : 'is-flat')}>{net > 0 ? '▲' + net : net < 0 ? '▼' + (-net) : '—'}</span></span>
          </div>
          <div className="modes" role="tablist">
            <button className={'modes__btn' + (mode === 'trail' ? ' is-active' : '')} onClick={() => setMode('trail')}>Trail</button>
            <button className={'modes__btn' + (mode === 'shift' ? ' is-active' : '')} onClick={() => setMode('shift')}>Cumulative Shift</button>
          </div>
        </div>
      </div>

      <svg className="chart-svg" viewBox={`0 0 ${RTVW} ${RTVH}`} preserveAspectRatio="xMidYMid meet">
        {mode === 'trail' ? (
          <React.Fragment>
            {rTicks.map((v) => (
              <g key={'r' + v}>
                <line className="c-grid" x1={RTM.l} y1={Yr(v)} x2={RTVW - RTM.r} y2={Yr(v)} />
                <text className="c-tick" x={RTM.l - 9} y={Yr(v) + 4} textAnchor="end">#{v}</text>
              </g>
            ))}
            <path className="rt-line" d={trailD} stroke={lineCol} />
            {hist.map((rk, i) => {
              const mv = moves[i];
              return (
                <g key={i}>
                  {i > 0 && mv !== 0 && (
                    <text className={'rt-mv ' + (mv > 0 ? 'is-pos' : 'is-neg')} x={cx(i)} y={Yr(rk) - 14} textAnchor="middle">{mv > 0 ? '▲' + mv : '▼' + (-mv)}</text>
                  )}
                  <circle className="rt-dot" cx={cx(i)} cy={Yr(rk)} r={i === n - 1 ? 6.5 : 5} fill={r.bg} stroke={r.fg} />
                  <text className="rt-rank-lbl" x={cx(i)} y={Yr(rk) + (rk <= (lo + hi) / 2 ? 20 : -12)} textAnchor="middle">#{rk}</text>
                  <text className="c-wk-lbl" x={cx(i)} y={RTVH - RTM.b + 18}>{i + 1}</text>
                </g>
              );
            })}
            <text className="c-axis-title" x={RTM.l + iw / 2} y={RTVH - 4} textAnchor="middle">Week</text>
          </React.Fragment>
        ) : (
          <React.Fragment>
            {cTicks.map((v) => (
              <g key={'c' + v}>
                <line className={v === 0 ? 'c-axis' : 'c-grid'} x1={RTM.l} y1={Yc(v)} x2={RTVW - RTM.r} y2={Yc(v)} />
                <text className="c-tick" x={RTM.l - 9} y={Yc(v) + 4} textAnchor="end">{v > 0 ? '+' + v : v}</text>
              </g>
            ))}
            <text className="c-ref-lbl" x={RTVW - RTM.r} y={Yc(0) - 6} textAnchor="end">WK 1 BASELINE</text>
            <path className="rt-cum-area" d={cumAreaD} fill={lineCol} />
            <path className="rt-line" d={cumLineD} stroke={lineCol} />
            {cum.map((v, i) => {
              const x = cx(i), up = v >= 0;
              return (
                <g key={i}>
                  <circle className="rt-dot" cx={x} cy={Yc(v)} r={i === n - 1 ? 6.5 : 4.5} fill={r.bg} stroke={r.fg} />
                  <text className={'rt-mv ' + (v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : 'is-flat')} x={x} y={Yc(v) + (v < 0 ? 22 : -13)} textAnchor="middle">{v > 0 ? '+' + v : v === 0 ? '±0' : v}</text>
                  <text className="c-wk-lbl" x={x} y={RTVH - RTM.b + 18}>{i + 1}</text>
                </g>
              );
            })}
            <text className="c-axis-title" x={RTM.l + iw / 2} y={RTVH - 4} textAnchor="middle">Week</text>
          </React.Fragment>
        )}
      </svg>

      <div className="chart-foot">
        {mode === 'trail' ? (
          <React.Fragment>
            <span className="chart-foot__key"><span className="chart-foot__sw" style={{ background: lineCol, borderRadius: 999 }} /> {r.name} rank</span>
            <span className="chart-foot__key"><span className="chart-foot__mv is-pos">▲</span> Climbed vs prior week</span>
            <span className="chart-foot__key"><span className="chart-foot__mv is-neg">▼</span> Dropped vs prior week</span>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <span className="chart-foot__key"><span className="chart-foot__sw" style={{ background: lineCol, borderRadius: 999 }} /> Cumulative shift vs Wk 1</span>
            <span className="chart-foot__key"><span className="chart-foot__mv is-pos">＋</span> Above baseline = net climb</span>
            <span className="chart-foot__key"><span className="chart-foot__mv is-neg">－</span> Below baseline = net drop</span>
          </React.Fragment>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { LeagueScatter, WeeklyChart, RankTrail });
