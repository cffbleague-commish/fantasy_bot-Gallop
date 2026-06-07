// CFFB · Price Prediction Board — prediction chart (SVG)
// ProbCurve : multiple pricing-probability distributions overlaid on one axis.
//             Primary (live-adjusted) scenario is shaded with its 80% band;
//             other scenarios draw as colored lines. Legend lists each
//             scenario's projected price.

const { useState: useChartState } = React;

const diamond = (cx, cy, r) => `M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`;

// split-normal density for an arbitrary scenario, peak 1 at sc.proj
const dens = (x, sc) => {
  const s = x <= sc.proj ? sc.sigLo : sc.sigHi;
  return Math.exp(-0.5 * Math.pow((x - sc.proj) / s, 2));
};

const Z80 = 1.2816, ZRANGE = 1.65;

const ProbCurve = ({ p }) => {
  const [hoverX, setHoverX] = useChartState(null);
  const scenarios = p.scenarios;
  const primary = scenarios.find((s) => s.primary) || scenarios[scenarios.length - 1];

  const W = 560, H = 150;
  const MG = { l: 14, r: 14, t: 10, b: 28 };
  const iw = W - MG.l - MG.r, ih = H - MG.t - MG.b;

  // global domain across all scenarios
  const floors = scenarios.map((s) => s.proj - ZRANGE * s.sigLo);
  const ceils = scenarios.map((s) => s.proj + ZRANGE * s.sigHi);
  const rawMin = Math.max(0, Math.min(...floors));
  const rawMax = Math.max(...ceils);
  const pad = (rawMax - rawMin) * 0.06;
  const xmin = Math.max(0, rawMin - pad), xmax = rawMax + pad;

  const X = (v) => MG.l + ((v - xmin) / (xmax - xmin)) * iw;
  const baseY = MG.t + ih;
  const Y = (d) => MG.t + (1 - d) * ih;

  // primary 80% band
  const p80lo = Math.max(1, Math.round(primary.proj - Z80 * primary.sigLo));
  const p80hi = Math.round(primary.proj + Z80 * primary.sigHi);

  const N = 110;
  const sample = (sc) => {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const x = xmin + (i / N) * (xmax - xmin);
      pts.push([x, dens(x, sc)]);
    }
    return pts;
  };
  const lineOf = (pts) => pts.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}`).join(' ');

  // primary area + band
  const primPts = sample(primary);
  const primLine = lineOf(primPts);
  const primArea = `${primLine} L${X(xmax).toFixed(1)} ${baseY} L${X(xmin).toFixed(1)} ${baseY} Z`;
  const bandPts = primPts.filter((q) => q[0] >= p80lo && q[0] <= p80hi);
  let bandPath = '';
  if (bandPts.length) {
    const inner = [[p80lo, dens(p80lo, primary)], ...bandPts, [p80hi, dens(p80hi, primary)]];
    bandPath = inner.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}`).join(' ')
      + ` L${X(p80hi).toFixed(1)} ${baseY} L${X(p80lo).toFixed(1)} ${baseY} Z`;
  }

  const ticks = Array.from(new Set([Math.round(xmin + pad), p80lo, Math.round(primary.proj), p80hi, Math.round(xmax - pad)]))
    .sort((a, b) => a - b);

  return (
    <div className="pcurve">
      <svg className="pcurve__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
           onMouseLeave={() => setHoverX(null)}
           onMouseMove={(e) => {
             const r = e.currentTarget.getBoundingClientRect();
             const px = ((e.clientX - r.left) / r.width) * W;
             const v = xmin + ((px - MG.l) / iw) * (xmax - xmin);
             setHoverX(Math.max(xmin, Math.min(xmax, v)));
           }}>
        <defs>
          <linearGradient id="pc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5B9D6B" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#5B9D6B" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pc-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6FB47F" stopOpacity="0.40" />
            <stop offset="100%" stopColor="#5B9D6B" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <line className="pcurve__axis" x1={MG.l} y1={baseY} x2={W - MG.r} y2={baseY} />

        {/* primary scenario: area + shaded 80% band */}
        <path d={primArea} fill="url(#pc-area)" />
        {bandPath && <path d={bandPath} fill="url(#pc-band)" />}

        {/* primary band edges */}
        <line className="pcurve__edge" x1={X(p80lo)} y1={Y(dens(p80lo, primary))} x2={X(p80lo)} y2={baseY} />
        <line className="pcurve__edge" x1={X(p80hi)} y1={Y(dens(p80hi, primary))} x2={X(p80hi)} y2={baseY} />

        {/* secondary scenarios as colored lines */}
        {scenarios.filter((s) => !s.primary).map((s) => (
          <path key={s.key} d={lineOf(sample(s))} fill="none" stroke={s.color}
                strokeWidth={1.6} strokeOpacity={0.85} strokeDasharray={s.key === 'market' ? '5 4' : '0'} />
        ))}

        {/* primary stroke on top */}
        <path d={primLine} fill="none" stroke={primary.color} strokeWidth={2.4} />

        {/* projected marker for primary */}
        <line className="pcurve__proj" x1={X(primary.proj)} y1={Y(1) - 4} x2={X(primary.proj)} y2={baseY} style={{ stroke: primary.color }} />
        <path d={diamond(X(primary.proj), Y(1) - 8, 5.5)} fill={primary.color} stroke="#0A0A0A" strokeWidth="1" />

        {/* hover readout */}
        {hoverX != null && (() => {
          const inBand = hoverX >= p80lo && hoverX <= p80hi;
          return (
            <g pointerEvents="none">
              <line className="pcurve__hover" x1={X(hoverX)} y1={MG.t} x2={X(hoverX)} y2={baseY} />
              {scenarios.map((s) => (
                <circle key={s.key} cx={X(hoverX)} cy={Y(dens(hoverX, s))} r={3} fill={s.color} stroke="#0A0A0A" strokeWidth="1" />
              ))}
              <g transform={`translate(${Math.min(Math.max(X(hoverX), MG.l + 44), W - MG.r - 44)}, ${MG.t + 4})`}>
                <rect className="pcurve__hover-bg" x={-44} y={-2} width={88} height={34} rx={4} />
                <text className="pcurve__hover-val" x={0} y={12} textAnchor="middle">${Math.round(hoverX)}</text>
                <text className="pcurve__hover-lbl" x={0} y={25} textAnchor="middle">{inBand ? 'likely range' : 'tail'}</text>
              </g>
            </g>
          );
        })()}

        {ticks.map((v, i) => (
          <text key={i} className={'pcurve__tick' + (Math.abs(v - primary.proj) < 0.5 ? ' is-proj' : '')}
                x={X(v)} y={baseY + 22} textAnchor="middle">${v}</text>
        ))}
      </svg>

      {/* legend */}
      <div className="pcurve__legend">
        {scenarios.map((s) => (
          <span key={s.key} className={'pleg' + (s.primary ? ' is-primary' : '')}>
            <span className="pleg__dot" style={{ background: s.color }} />
            <span className="pleg__lbl">{s.label}</span>
            <span className="pleg__val" style={{ color: s.color }}>{fmt$(s.proj)}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { ProbCurve });
