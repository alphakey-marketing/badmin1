import { useEffect, useRef } from 'react';

export interface Series {
  label: string;
  color: string;
  points: Array<[number, number]>;
  dashed?: boolean;
}

interface Props {
  title: string;
  unit: string;
  series: Series[];
  /** Vertical marker (e.g. the playback time). */
  cursorX?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  height?: number;
}

/** Small canvas line chart with a moving cursor. */
export default function LineChart({ title, unit, series, cursorX, xMax, yMin, yMax, height = 120 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const all = series.flatMap((s) => s.points);
    if (all.length === 0) return;
    const x1 = xMax ?? Math.max(...all.map((p) => p[0]));
    let y0 = yMin ?? Math.min(...all.map((p) => p[1]));
    let y1 = yMax ?? Math.max(...all.map((p) => p[1]));
    if (y1 - y0 < 1e-6) {
      y1 += 1;
      y0 -= 1;
    }
    const pad = { l: 34, r: 8, t: 6, b: 18 };
    const px = (x: number) => pad.l + (x / (x1 || 1)) * (w - pad.l - pad.r);
    const py = (y: number) => h - pad.b - ((y - y0) / (y1 - y0)) * (h - pad.t - pad.b);

    const css = getComputedStyle(canvas);
    const grid = css.getPropertyValue('--grid').trim() || 'rgba(148,163,184,0.18)';
    const text = css.getPropertyValue('--muted').trim() || '#94a3b8';

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = text;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const v = y0 + ((y1 - y0) * i) / 3;
      const y = py(v);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(Math.abs(y1 - y0) < 10 ? 1 : 0), pad.l - 4, y + 3);
    }
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const v = (x1 * i) / 4;
      ctx.fillText(`${v.toFixed(1)}s`, px(v), h - 4);
    }

    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(s.dashed ? [5, 4] : []);
      ctx.beginPath();
      s.points.forEach(([x, y], i) => {
        const cx = px(x);
        const cy = py(Math.max(y0, Math.min(y1, y)));
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (cursorX !== undefined) {
      ctx.strokeStyle = text;
      ctx.beginPath();
      ctx.moveTo(px(cursorX), pad.t);
      ctx.lineTo(px(cursorX), h - pad.b);
      ctx.stroke();
    }
  }, [series, cursorX, xMax, yMin, yMax]);

  return (
    <figure className="chart">
      <figcaption>
        <span>{title}</span>
        <span className="chart-unit">{unit}</span>
        <span className="chart-legend">
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color, opacity: s.dashed ? 0.7 : 1 }} />
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <canvas ref={ref} style={{ width: '100%', height }} />
    </figure>
  );
}
