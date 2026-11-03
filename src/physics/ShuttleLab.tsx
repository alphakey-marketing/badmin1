import { useEffect, useMemo, useRef, useState } from 'react';
import { ShuttleScene } from './ShuttleScene';
import {
  SHOT_PRESETS,
  sampleAt,
  simulate,
  type ShuttleParams,
  type ShuttleType,
  type SimResult,
} from './shuttleSim';
import LineChart, { type Series } from '../shared/LineChart';
import PhysicsExplainer from './PhysicsExplainer';

const TIME_SCALES = [
  { v: 1, label: '1×' },
  { v: 0.25, label: '¼×' },
  { v: 0.1, label: '1/10×' },
  { v: 0.02, label: '1/50×' },
];

const OUTCOME_LABEL: Record<SimResult['outcome'], string> = {
  in: '界內 ✓',
  out: '出界 ✗',
  net: '落網 ✗',
  airborne: '仲喺空中',
};

type Base = Omit<ShuttleParams, 'type' | 'spinDirection' | 'spinDriveScale'>;

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  hint?: string;
}

function Slider({ label, value, min, max, step, unit, onChange, hint }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <b>
          {value}
          <small> {unit}</small>
        </b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="slider-hint">{hint}</span>}
    </label>
  );
}

function downsample(res: SimResult, pick: (s: SimResult['samples'][number]) => number): Array<[number, number]> {
  const step = Math.max(1, Math.floor(res.samples.length / 300));
  const out: Array<[number, number]> = [];
  for (let i = 0; i < res.samples.length; i += step) out.push([res.samples[i].t, pick(res.samples[i])]);
  return out;
}

export default function ShuttleLab() {
  const [presetId, setPresetId] = useState('clear');
  const [base, setBase] = useState<Base>(SHOT_PRESETS[1].params);
  const [type, setType] = useState<ShuttleType>('feather');
  const [spinDirection, setSpinDirection] = useState<1 | -1>(1);
  const [spinDrive, setSpinDrive] = useState(1);
  const [disableGyro, setDisableGyro] = useState(false);
  const [noTurnover, setNoTurnover] = useState(false);
  const [compare, setCompare] = useState(true);
  const [showForces, setShowForces] = useState(true);
  const [follow, setFollow] = useState(false);
  const [timeScale, setTimeScale] = useState(0.25);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ShuttleScene | null>(null);
  const timeRef = useRef(0);
  const [inset, setInset] = useState({ x: 0, y: 0, size: 0, narrow: false });

  const params: ShuttleParams = useMemo(
    () => ({ ...base, type, spinDirection, spinDriveScale: spinDrive, disableGyro, noTurnover }),
    [base, type, spinDirection, spinDrive, disableGyro, noTurnover],
  );
  const result = useMemo(() => simulate(params), [params]);
  const ghost = useMemo(
    () => (compare ? simulate({ ...params, spinRps: 0, spinDriveScale: 0 }) : null),
    [params, compare],
  );

  useEffect(() => {
    if (!mountRef.current) return;
    const s = new ShuttleScene(mountRef.current);
    s.onInsetChange = setInset;
    setInset(s.insetRect());
    sceneRef.current = s;
    return () => s.dispose();
  }, []);

  useEffect(() => {
    sceneRef.current?.setResults(result, ghost);
    timeRef.current = 0;
    setTime(0);
    setPlaying(true);
  }, [result, ghost]);

  useEffect(() => {
    sceneRef.current?.setOptions({ showForces, follow });
  }, [showForces, follow]);

  // Playback loop
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const end = Math.max(result.flightTime, ghost?.flightTime ?? 0);
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let t = timeRef.current + dt * timeScale;
      if (t > end + 0.4) t = 0; // loop with a short pause at the end
      timeRef.current = t;
      sceneRef.current?.setTime(Math.min(t, end));
      if (now - lastUi > 66) {
        lastUi = now;
        setTime(Math.min(t, end));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, timeScale, result, ghost]);

  const scrub = (t: number) => {
    timeRef.current = t;
    setTime(t);
    sceneRef.current?.setTime(t);
  };

  const applyPreset = (id: string) => {
    const p = SHOT_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setBase(p.params);
  };
  const upd = (k: keyof Base) => (v: number) => {
    setPresetId('custom');
    setBase((b) => ({ ...b, [k]: v }));
  };

  const s = sampleAt(result, time);
  const preset = SHOT_PRESETS.find((p) => p.id === presetId);
  const end = Math.max(result.flightTime, ghost?.flightTime ?? 0);

  const charts = useMemo(() => {
    const blue = '#38bdf8';
    const amber = '#fbbf24';
    const mk = (pick: (x: SimResult['samples'][number]) => number): Series[] => {
      const out: Series[] = [{ label: '有旋轉', color: blue, points: downsample(result, pick) }];
      if (ghost) out.push({ label: '無旋轉', color: amber, points: downsample(ghost, pick), dashed: true });
      return out;
    };
    return {
      speed: mk((x) => x.speed),
      aoa: mk((x) => x.aoaDeg),
      spin: mk((x) => x.spinRps),
    };
  }, [result, ghost]);

  const diff = ghost?.landing && result.landing
    ? {
        depth: result.landing.x - ghost.landing.x,
        side: result.landing.z - ghost.landing.z,
      }
    : null;

  return (
    <div className="lab">
      <section className="lab-stage">
        <div className="lab-canvas" ref={mountRef} />
        <div className="hud">
          <div><span>時間</span><b>{(time * 1000).toFixed(0)} ms</b></div>
          <div><span>速度</span><b>{s.speed.toFixed(1)} m/s</b></div>
          <div><span>自旋</span><b>{Math.abs(s.spinRps).toFixed(0)} 轉/秒</b></div>
          <div><span>傾角</span><b>{s.aoaDeg.toFixed(0)}°</b></div>
          <div><span>阻力係數</span><b>{s.dragCoef.toFixed(2)}</b></div>
          <div><span>高度</span><b>{s.pos.y.toFixed(2)} m</b></div>
        </div>
        <div className="inset-label" style={{ left: inset.x, top: Math.max(0, inset.y - 24), width: inset.size }}>特寫（真實大小）· 紅色羽毛＝睇轉速</div>
        <div className="legend3d">
          <span><i style={{ background: '#38bdf8' }} />速度</span>
          <span><i style={{ background: '#f87171' }} />空氣阻力</span>
          <span><i style={{ background: '#facc15' }} />重力</span>
          <span><i style={{ background: '#c084fc' }} />側向力（箭咀放大）</span>
          {compare && <span><i style={{ background: '#fbbf24' }} />無旋轉對照</span>}
        </div>
        <div className="playbar" style={{ right: inset.narrow ? 12 : inset.size + 36 }}>
          <button className="btn icon" onClick={() => setPlaying((p) => !p)} aria-label={playing ? '暫停' : '播放'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <input
            type="range"
            min={0}
            max={end}
            step={0.001}
            value={time}
            onChange={(e) => {
              setPlaying(false);
              scrub(Number(e.target.value));
            }}
          />
          <div className="seg">
            {TIME_SCALES.map((ts) => (
              <button key={ts.v} className={timeScale === ts.v ? 'on' : ''} onClick={() => setTimeScale(ts.v)}>
                {ts.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="lab-panel">
        <div className="card">
          <h3>選擇球種</h3>
          <div className="chips">
            {SHOT_PRESETS.map((p) => (
              <button key={p.id} className={presetId === p.id ? 'chip on' : 'chip'} onClick={() => applyPreset(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          {preset && <p className="muted small">{preset.hint}</p>}
        </div>

        <div className="card results">
          <h3>結果</h3>
          <div className="stat-row">
            <div><span>落點</span><b>{OUTCOME_LABEL[result.outcome]}</b></div>
            <div><span>飛行時間</span><b>{result.flightTime.toFixed(2)} s</b></div>
            <div><span>翻轉完成</span><b>{result.turnoverTime !== null ? `${(result.turnoverTime * 1000).toFixed(0)} ms` : '—'}</b></div>
            <div><span>最高點</span><b>{result.maxHeight.toFixed(2)} m</b></div>
          </div>
          {diff && (
            <p className="small">
              同「無旋轉」比較：落點{diff.depth < 0 ? '短咗' : '長咗'} <b>{Math.abs(diff.depth * 100).toFixed(0)} cm</b>，
              側向偏移 <b>{Math.abs(diff.side * 100).toFixed(0)} cm</b>
              {Math.abs(diff.side) > 0.02 ? (diff.side > 0 ? '（向右）' : '（向左）') : ''}。
            </p>
          )}
        </div>

        <div className="card">
          <h3>出手條件</h3>
          <Slider label="初速" value={base.speed} min={2} max={110} step={1} unit="m/s" onChange={upd('speed')} />
          <Slider label="仰角" value={base.elevation} min={-30} max={80} step={1} unit="°" onChange={upd('elevation')} />
          <Slider label="左右方向" value={base.azimuth} min={-20} max={20} step={1} unit="°" onChange={upd('azimuth')} />
          <Slider label="擊球高度" value={base.y0} min={0.3} max={3.4} step={0.05} unit="m" onChange={upd('y0')} />
          <Slider label="擊球位置（離網）" value={base.x0} min={-6.5} max={-0.3} step={0.1} unit="m" onChange={upd('x0')} />
        </div>

        <div className="card">
          <h3>旋轉設定</h3>
          <Slider
            label="出手自旋"
            value={base.spinRps}
            min={0}
            max={150}
            step={1}
            unit="轉/秒"
            onChange={upd('spinRps')}
            hint="切球／劈吊會令球一出手就轉"
          />
          <Slider
            label="翻滾（打筋斗）"
            value={base.tumbleRps}
            min={0}
            max={30}
            step={1}
            unit="轉/秒"
            onChange={upd('tumbleRps')}
            hint="搓球時拍面擦過球頭造成"
          />
          <Slider
            label="羽毛「風車」推力"
            value={spinDrive}
            min={0}
            max={2}
            step={0.1}
            unit="×"
            onChange={setSpinDrive}
            hint="0 = 羽毛完全唔推佢轉"
          />
          <div className="row">
            <span className="muted small">球種</span>
            <div className="seg">
              <button className={type === 'feather' ? 'on' : ''} onClick={() => setType('feather')}>鵝毛球</button>
              <button className={type === 'nylon' ? 'on' : ''} onClick={() => setType('nylon')}>膠球</button>
            </div>
          </div>
          <div className="row">
            <span className="muted small">旋轉方向（由球尾望）</span>
            <div className="seg">
              <button className={spinDirection === 1 ? 'on' : ''} onClick={() => setSpinDirection(1)}>順時針</button>
              <button className={spinDirection === -1 ? 'on' : ''} onClick={() => setSpinDirection(-1)}>逆時針</button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>實驗開關</h3>
          <label className="check"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />顯示「無旋轉」對照軌跡</label>
          <label className="check"><input type="checkbox" checked={disableGyro} onChange={(e) => setDisableGyro(e.target.checked)} />關閉陀螺效應（只留阻力影響）</label>
          <label className="check"><input type="checkbox" checked={noTurnover} onChange={(e) => setNoTurnover(e.target.checked)} />出手已經球頭向前（唔使翻轉）</label>
          <label className="check"><input type="checkbox" checked={showForces} onChange={(e) => setShowForces(e.target.checked)} />顯示受力箭咀</label>
          <label className="check"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />鏡頭跟住球</label>
          <button className="btn ghost small" onClick={() => sceneRef.current?.resetView()}>重設視角</button>
        </div>

        <div className="card">
          <LineChart title="速度" unit="m/s" series={charts.speed} cursorX={time} xMax={end} yMin={0} />
          <LineChart title="傾角（球軸 vs 飛行方向）" unit="°" series={charts.aoa} cursorX={time} xMax={end} yMin={0} yMax={180} />
          <LineChart title="自旋轉速" unit="轉/秒" series={charts.spin} cursorX={time} xMax={end} />
        </div>

        <PhysicsExplainer />
      </aside>
    </div>
  );
}
