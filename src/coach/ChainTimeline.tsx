import type { SwingReport } from './types';

const COLORS = { hips: '#a78bfa', shoulders: '#38bdf8', elbow: '#f59e0b', wrist: '#f43f5e' } as const;
const T0 = -600;
const T1 = 150;

/** Kinetic chain: when each body segment reached its top speed, relative to contact. */
export default function ChainTimeline({ report }: { report: SwingReport }) {
  const W = 320;
  const rowH = 30;
  const left = 70;
  const H = rowH * report.sequence.length + 22;
  const x = (t: number) => left + ((Math.max(T0, Math.min(T1, t)) - T0) / (T1 - T0)) * (W - left - 8);

  return (
    <svg className="chain" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="動力鏈時序圖">
      <line x1={x(0)} x2={x(0)} y1={0} y2={H - 18} className="chain-contact" />
      <text x={x(0)} y={H - 4} textAnchor="middle" className="chain-axis">擊球</text>
      {[-500, -300, -100].map((t) => (
        <text key={t} x={x(t)} y={H - 4} textAnchor="middle" className="chain-axis">{t}ms</text>
      ))}
      {report.sequence.map((s, i) => {
        const y0 = i * rowH + 4;
        const pts = report.curves[s.part]
          .filter(([t]) => t >= T0 && t <= T1)
          .map(([t, v]) => `${x(t).toFixed(1)},${(y0 + rowH - 6 - v * (rowH - 10)).toFixed(1)}`)
          .join(' ');
        return (
          <g key={s.part}>
            <text x={0} y={y0 + rowH / 2 + 3} className="chain-label">{s.label}</text>
            <line x1={left} x2={W - 8} y1={y0 + rowH - 6} y2={y0 + rowH - 6} className="chain-base" />
            {pts && <polyline points={pts} fill="none" stroke={COLORS[s.part]} strokeWidth={2} opacity={0.9} />}
            {s.tMs !== null && (
              <>
                <circle cx={x(s.tMs)} cy={y0 + 5} r={4.5} fill={COLORS[s.part]} />
                <text x={x(s.tMs) + 7} y={y0 + 9} className="chain-val">{Math.round(s.tMs)}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
