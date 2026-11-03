import { useMemo } from 'react';
import type { Vector3 } from 'three';
import { computeImpact, type ImpactResult, type Swing } from './impact';
import type { SimResult } from './shuttleSim';
import LineChart, { type Series } from '../shared/LineChart';

interface Props {
  swing: Swing;
  vIn: Vector3;
  imp: ImpactResult | null;
  result: SimResult;
  /** +1 standard feather layout, −1 mirrored. */
  spinDirection: 1 | -1;
  onLoad: (strokeId: string, tweak?: Partial<Swing>) => void;
  onSwing: (s: Swing) => void;
}

interface Challenge {
  id: string;
  title: string;
  stroke: string;
  /** Change to the stroke preset so the start does NOT pass yet. */
  start?: Partial<Swing>;
  /** What to adjust (hint). */
  hint: string;
  goal: string;
  test: (imp: ImpactResult, r: SimResult, dir: number) => Array<[string, boolean]>;
}

const landX = (r: SimResult) => r.landing?.x ?? -99;
const isIn = (r: SimResult) => r.outcome === 'in';

const CHALLENGES: Challenge[] = [
  {
    id: 'slice',
    title: '劈吊：轉得勁又落前場',
    stroke: 'slice',
    hint: '提示：揮拍慢少少，拍面開多少少，切角保持。',
    goal: '自旋 ≥ 40 轉/秒，落點喺對方前場（離網 ≤ 2.5 m）',
    test: (imp, r) => [
      [`自旋 ${Math.abs(imp.spinRps).toFixed(0)} ≥ 40 轉/秒`, Math.abs(imp.spinRps) >= 40],
      [`落點離網 ${landX(r).toFixed(1)} m ≤ 2.5 m`, isIn(r) && landX(r) <= 2.5],
    ],
  },
  {
    id: 'flat',
    title: '平直殺球：唔要旋轉，要快',
    stroke: 'smash',
    start: { swingAzim: 25 },
    hint: '起點係斜住揮（有切）。提示：將切角調返 0°。',
    goal: '自旋 ≤ 5 轉/秒，出球 ≥ 60 m/s，界內',
    test: (imp, r) => [
      [`自旋 ${Math.abs(imp.spinRps).toFixed(0)} ≤ 5 轉/秒`, Math.abs(imp.spinRps) <= 5],
      [`出球 ${imp.vOut.length().toFixed(0)} ≥ 60 m/s`, imp.vOut.length() >= 60],
      ['界內', isIn(r)],
    ],
  },
  {
    id: 'reverse',
    title: '反切：轉向同自然旋轉相反',
    stroke: 'sliceL',
    start: { swingAzim: 0 },
    hint: '起點冇切。提示：揮拍方向向另一邊偏（正數切角）。',
    goal: '自旋方向同羽毛自然旋轉相反、≥ 30 轉/秒，界內',
    test: (imp, r, dir) => [
      [`反向自旋 ${Math.max(0, -imp.spinRps * dir).toFixed(0)} ≥ 30 轉/秒`, -imp.spinRps * dir >= 30],
      ['界內', isIn(r)],
    ],
  },
  {
    id: 'tumble',
    title: '搓球：翻滾又貼網',
    stroke: 'tumble',
    start: { swingAzim: 0 },
    hint: '起點係直推冇擦。提示：揮拍方向要橫向擦過球頭（大切角）。',
    goal: '翻滾 ≥ 8 轉/秒，過網後落點離網 ≤ 1 m',
    test: (imp, r) => [
      [`翻滾 ${imp.tumbleRps.toFixed(0)} ≥ 8 轉/秒`, imp.tumbleRps >= 8],
      [`落點離網 ${landX(r).toFixed(2)} m ≤ 1 m`, isIn(r) && landX(r) <= 1],
    ],
  },
  {
    id: 'clear',
    title: '高遠球：送到底線',
    stroke: 'clear',
    start: { faceElev: 22 },
    hint: '起點拍面太平，球會短。提示：拍面開大啲（拍面朝向：上下）。',
    goal: '界內，落點離底線 ≤ 1 m',
    test: (_imp, r) => [
      [`離底線 ${(6.7 - landX(r)).toFixed(1)} m ≤ 1 m`, isIn(r) && 6.7 - landX(r) <= 1],
    ],
  },
];

const OK = <span className="badge ok">✅ 研究證實</span>;
const MODEL = <span className="badge model">🔬 模型推算</span>;

export default function SpinTraining({ swing, vIn, imp, result, spinDirection, onLoad, onSwing }: Props) {
  const cut = swing.swingAzim - swing.faceAzim;

  // Sweep the cut angle (swing direction vs face, left/right) and see what happens.
  const sweep = useMemo(() => {
    const spin: Array<[number, number]> = [];
    const tumble: Array<[number, number]> = [];
    const speed: Array<[number, number]> = [];
    for (let c = -60; c <= 60; c += 3) {
      const r = computeImpact(vIn, { ...swing, swingAzim: swing.faceAzim + c });
      if (!r.hit) continue;
      spin.push([c, r.spinRps * spinDirection]);
      tumble.push([c, r.tumbleRps]);
      speed.push([c, r.vOut.length()]);
    }
    return { spin, tumble, speed };
  }, [swing, vIn, spinDirection]);

  const spinSeries: Series[] = [
    { label: '自旋（+ 同自然方向）', color: '#38bdf8', points: sweep.spin },
    { label: '翻滾', color: '#c084fc', points: sweep.tumble },
  ];
  const speedSeries: Series[] = [{ label: '出球速度', color: '#fbbf24', points: sweep.speed }];
  const fmt = (v: number) => `${v.toFixed(0)}°`;

  return (
    <div className="card spin-train">
      <h3>🎯 學控制旋轉</h3>
      <p className="small">
        下面兩個圖：保持而家嘅拍面同揮拍速度，只係改「揮拍方向左右偏離拍面」嘅角度（切），睇自旋、翻滾同球速點變。直線＝你而家嘅位置（{cut.toFixed(0)}°）。
      </p>
      <LineChart title="切嘅角度 → 自旋／翻滾" unit="轉/秒" series={spinSeries} xMin={-60} xMax={60} xFormat={fmt} cursorX={cut} />
      <LineChart title="切嘅角度 → 出球速度" unit="m/s" series={speedSeries} xMin={-60} xMax={60} xFormat={fmt} cursorX={cut} yMin={0} />
      <div className="row">
        <span className="muted small">快速調切角</span>
        <div className="seg">
          {[-40, -20, 0, 20, 40].map((c) => (
            <button key={c} className={Math.round(cut) === c ? 'on' : ''} onClick={() => onSwing({ ...swing, swingAzim: swing.faceAzim + c })}>
              {c > 0 ? `+${c}` : c}°
            </button>
          ))}
        </div>
      </div>

      <h4>挑戰（揀一個，自己調到過關）</h4>
      <div className="challenges">
        {CHALLENGES.map((c) => {
          const rows = imp && imp.hit ? c.test(imp, result, spinDirection) : [];
          const pass = rows.length > 0 && rows.every(([, ok]) => ok);
          return (
            <div key={c.id} className={`challenge ${pass ? 'pass' : ''}`}>
              <div className="row">
                <b>{pass ? '🏆 ' : ''}{c.title}</b>
                <button className="btn ghost tiny" onClick={() => onLoad(c.stroke, c.start)}>載入起點</button>
              </div>
              <div className="muted tiny">目標：{c.goal}</div>
              <div className="muted tiny">{c.hint}</div>
              <div className="challenge-rows">
                {rows.map(([label, ok]) => (
                  <span key={label} className={ok ? 'ok' : 'no'}>{ok ? '✓' : '✗'} {label}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <h4>點樣控制旋轉</h4>
      <ul className="small tips-list">
        <li>{OK} <b>切就會轉</b>：劈吊（切球）會令羽毛球高速自旋，實測約 125–166 轉/秒（Collet 2024）。</li>
        <li>{OK} <b>旋轉方向睇你點切</b>：右手正手切嘅自旋同羽毛自然旋轉同方向；左手切或者右手反切就相反，個球減速更快（Collet 2024、2026）。</li>
        <li>{MODEL} <b>想轉得勁啲</b>：加大揮拍方向同拍面朝向嘅夾角，即係擦多啲、撞少啲。代價係出球速度會跌（睇上面第二個圖）。</li>
        <li>{MODEL} <b>想平直唔轉</b>：拍面正對揮拍方向（夾角接近 0°），用拍面中間正面撞。</li>
        <li>{OK} <b>搓球翻滾</b>：翻滾網前同普通放網嘅分別主要喺前臂同手腕動作（ISB 2009）。{MODEL} 拍面向上、橫向擦過球頭底部就會翻；擦得越快，翻得越勁。</li>
        <li>{MODEL} <b>速度唔夠就轉唔起</b>：摩擦力同撞擊力成正比，揮拍太慢，擦都擦唔出旋轉。</li>
      </ul>
    </div>
  );
}
