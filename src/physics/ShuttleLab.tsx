import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { ShuttleScene, type ImpactView } from './ShuttleScene';
import {
  SHOT_PRESETS,
  sampleAt,
  simulate,
  type ShuttleParams,
  type ShuttleType,
  type SimResult,
} from './shuttleSim';
import {
  INCOMING,
  STROKES,
  computeImpact,
  incomingPath,
  incomingVelocity,
  type ImpactResult,
  type Swing,
} from './impact';
import LineChart, { type Series } from '../shared/LineChart';
import PhysicsExplainer from './PhysicsExplainer';
import SpinTraining from './SpinTraining';

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
type Mode = 'hit' | 'direct';
interface Inc {
  speed: number;
  descent: number;
  azimuth: number;
}

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

const elevOf = (v: Vector3) => (Math.asin(v.y / Math.max(1e-6, v.length())) * 180) / Math.PI;

export default function ShuttleLab() {
  const [mode, setMode] = useState<Mode>('hit');
  // Direct mode
  const [presetId, setPresetId] = useState('clear');
  const [base, setBase] = useState<Base>(SHOT_PRESETS[1].params);
  // Hit mode
  const [strokeId, setStrokeId] = useState('smash');
  const [swing, setSwing] = useState<Swing>(STROKES[0].swing);
  const [contact, setContact] = useState(STROKES[0].contact);
  const [playerMove, setPlayerMove] = useState<{ move: string; left?: boolean }>({ move: STROKES[0].move });
  const [showPlayer, setShowPlayer] = useState(true);
  const [incId, setIncId] = useState('vertical');
  const [inc, setInc] = useState<Inc>(INCOMING[0]);
  // Shared
  const [type, setType] = useState<ShuttleType>('feather');
  const [spinDirection, setSpinDirection] = useState<1 | -1>(1);
  const [spinDrive, setSpinDrive] = useState(1);
  const [spinDragPct, setSpinDragPct] = useState(0);
  const [disableGyro, setDisableGyro] = useState(false);
  const [noTurnover, setNoTurnover] = useState(false);
  const [compare, setCompare] = useState(true);
  const [showForces, setShowForces] = useState(true);
  const [follow, setFollow] = useState(false);
  const [timeScale, setTimeScale] = useState(0.1);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ShuttleScene | null>(null);
  const timeRef = useRef(0);
  const [inset, setInset] = useState({ x: 0, y: 0, size: 0, narrow: false });

  const shared = { type, spinDirection, spinDriveScale: spinDrive, disableGyro, spinDragPct };

  // ---- Hit mode: incoming ball + racket → launch state ----
  const hit = useMemo(() => {
    if (mode !== 'hit') return null;
    const vIn = incomingVelocity(inc);
    const imp = computeImpact(vIn, swing);
    const c = new Vector3(contact.x, contact.y, contact.z);
    const path = incomingPath(c, vIn, 1.3);
    return { imp, contact: c, path };
  }, [mode, inc, swing, contact]);

  const params: ShuttleParams = useMemo(() => {
    if (hit) {
      return {
        ...base,
        ...shared,
        x0: hit.contact.x,
        y0: hit.contact.y,
        z0: hit.contact.z,
        init: { vel: hit.imp.vOut, axis: hit.imp.axis, omega: hit.imp.omega },
      };
    }
    return { ...base, ...shared, noTurnover };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit, base, type, spinDirection, spinDrive, disableGyro, spinDragPct, noTurnover]);

  const result = useMemo(() => simulate(params), [params]);
  const ghost = useMemo(() => {
    if (!compare) return null;
    if (params.init) {
      // Same hit, but with the spin about the shuttle's own axis removed.
      const axis = params.init.axis.clone().normalize();
      const omega = params.init.omega.clone().addScaledVector(axis, -params.init.omega.dot(axis));
      return simulate({ ...params, spinDriveScale: 0, init: { ...params.init, omega } });
    }
    return simulate({ ...params, spinRps: 0, spinDriveScale: 0 });
  }, [params, compare]);

  const impactView: ImpactView | null = useMemo(
    () =>
      hit
        ? { contact: hit.contact, incoming: hit.path, vRacket: hit.imp.vRacket, normal: hit.imp.normal, player: showPlayer ? playerMove : undefined }
        : null,
    [hit, showPlayer, playerMove],
  );
  const start = hit ? Math.max(showPlayer ? -1.2 : -0.35, hit.path[0]?.t ?? 0) : 0;
  const end = Math.max(result.flightTime, ghost?.flightTime ?? 0);

  // Same swing against every kind of incoming ball.
  const table = useMemo(() => {
    if (mode !== 'hit') return [];
    return INCOMING.map((ic) => {
      const imp = computeImpact(incomingVelocity(ic), swing);
      if (!imp.hit) return { ic, imp, sim: null as SimResult | null };
      const sim = simulate({
        ...base,
        ...shared,
        x0: contact.x,
        y0: contact.y,
        z0: contact.z,
        init: { vel: imp.vOut, axis: imp.axis, omega: imp.omega },
      });
      return { ic, imp, sim };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, swing, contact, type, spinDirection, spinDrive, disableGyro, spinDragPct]);

  useEffect(() => {
    if (!mountRef.current) return;
    const s = new ShuttleScene(mountRef.current);
    s.onInsetChange = setInset;
    setInset(s.insetRect());
    sceneRef.current = s;
    return () => s.dispose();
  }, []);

  useEffect(() => {
    sceneRef.current?.setResults(result, ghost, impactView);
    timeRef.current = start;
    setTime(start);
    setPlaying(true);
  }, [result, ghost, impactView, start]);

  useEffect(() => {
    sceneRef.current?.setOptions({ showForces, follow, shuttleScale: mode === 'hit' ? (showPlayer ? 1.8 : 2.5) : 6 });
  }, [showForces, follow, mode, showPlayer]);

  // Playback loop
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let t = timeRef.current + dt * timeScale;
      if (t > end + 0.4) t = start; // loop with a short pause at the end
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
  }, [playing, timeScale, start, end]);

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
  const applyStroke = (id: string, tweak?: Partial<Swing>) => {
    const st = STROKES.find((x) => x.id === id);
    if (!st) return;
    setStrokeId(tweak ? 'custom' : id);
    setSwing({ ...st.swing, ...tweak });
    setContact(st.contact);
    setPlayerMove({ move: st.move, left: st.left });
    const ic = INCOMING.find((x) => x.id === st.incoming);
    if (ic) {
      setIncId(ic.id);
      setInc(ic);
    }
  };
  const applyIncoming = (id: string) => {
    const ic = INCOMING.find((x) => x.id === id);
    if (!ic) return;
    setIncId(id);
    setInc(ic);
  };
  const updSwing = (k: keyof Swing) => (v: number) => {
    setStrokeId('custom');
    setSwing((s) => ({ ...s, [k]: v }));
  };
  const updInc = (k: keyof Inc) => (v: number) => {
    setIncId('custom');
    setInc((s) => ({ ...s, [k]: v }));
  };

  const s = time < 0 ? null : sampleAt(result, time);
  const preset = SHOT_PRESETS.find((p) => p.id === presetId);
  const stroke = STROKES.find((p) => p.id === strokeId);
  const incPreset = INCOMING.find((p) => p.id === incId);
  const imp: ImpactResult | null = hit?.imp ?? null;

  const charts = useMemo(() => {
    const blue = '#38bdf8';
    const amber = '#fbbf24';
    const mk = (pick: (x: SimResult['samples'][number]) => number): Series[] => {
      const out: Series[] = [{ label: '有自旋', color: blue, points: downsample(result, pick) }];
      if (ghost) out.push({ label: '無自旋', color: amber, points: downsample(ghost, pick), dashed: true });
      return out;
    };
    return {
      speed: mk((x) => x.speed),
      aoa: mk((x) => x.aoaDeg),
      spin: mk((x) => x.spinRps),
    };
  }, [result, ghost]);

  const diff =
    ghost?.landing && result.landing
      ? { depth: result.landing.x - ghost.landing.x, side: result.landing.z - ghost.landing.z }
      : null;

  return (
    <div className="lab">
      <section className="lab-stage">
        <div className="lab-canvas" ref={mountRef} />
        <div className="hud">
          <div><span>時間</span><b>{(time * 1000).toFixed(0)} ms</b></div>
          {s ? (
            <>
              <div><span>速度</span><b>{s.speed.toFixed(1)} m/s</b></div>
              <div><span>自旋</span><b>{Math.abs(s.spinRps).toFixed(0)} 轉/秒</b></div>
              <div><span>傾角</span><b>{s.aoaDeg.toFixed(0)}°</b></div>
              <div><span>阻力係數</span><b>{s.dragCoef.toFixed(2)}</b></div>
              <div><span>高度</span><b>{s.pos.y.toFixed(2)} m</b></div>
            </>
          ) : (
            <div className="hud-wide"><span>階段</span><b>來球中… 0 ms 擊球</b></div>
          )}
        </div>
        <div className="inset-label" style={{ left: inset.x, top: Math.max(0, inset.y - 24), width: inset.size }}>
          特寫（真實大小）· 紅色羽毛＝睇轉速{mode === 'hit' ? (showPlayer ? ' · 主畫面羽毛球放大 1.8 倍' : ' · 主畫面球同拍放大 2.5 倍') : ''}
        </div>
        <div className="legend3d">
          <span><i style={{ background: '#38bdf8' }} />速度／出球路線</span>
          {mode === 'hit' && <span><i style={{ background: '#94a3b8' }} />來球路線</span>}
          {mode === 'hit' && <span><i style={{ background: '#4ade80' }} />拍面朝向</span>}
          {mode === 'hit' && <span><i style={{ background: '#fb923c' }} />揮拍方向</span>}
          <span><i style={{ background: '#f87171' }} />空氣阻力</span>
          <span><i style={{ background: '#facc15' }} />重力</span>
          <span><i style={{ background: '#c084fc' }} />側向力（放大）</span>
          {compare && <span><i style={{ background: '#fbbf24' }} />無自旋對照</span>}
        </div>
        <div className="playbar" style={{ right: inset.narrow ? 12 : inset.size + 36 }}>
          <button className="btn icon" onClick={() => setPlaying((p) => !p)} aria-label={playing ? '暫停' : '播放'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <input
            type="range"
            min={start}
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
        <div className="seg wide">
          <button className={mode === 'hit' ? 'on' : ''} onClick={() => setMode('hit')}>🏸 擊球模式（來球＋球拍）</button>
          <button className={mode === 'direct' ? 'on' : ''} onClick={() => setMode('direct')}>直接設定出手</button>
        </div>

        {mode === 'hit' ? (
          <>
            <div className="card">
              <h3>① 揀擊球動作</h3>
              <div className="chips">
                {STROKES.map((p) => (
                  <button key={p.id} className={strokeId === p.id ? 'chip on' : 'chip'} onClick={() => applyStroke(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
              {stroke && <p className="muted small">{stroke.hint}</p>}
            </div>

            <div className="card">
              <h3>② 來球方向</h3>
              <div className="chips">
                {INCOMING.map((p) => (
                  <button key={p.id} className={incId === p.id ? 'chip on' : 'chip'} onClick={() => applyIncoming(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
              {incPreset && <p className="muted small">{incPreset.hint}</p>}
              <Slider label="來球速度" value={inc.speed} min={2} max={40} step={0.5} unit="m/s" onChange={updInc('speed')} />
              <Slider label="來球落下角度" value={inc.descent} min={0} max={88} step={1} unit="°" onChange={updInc('descent')} hint="0° = 平飛，88° ≈ 垂直跌落" />
            </div>

            {imp && (
              <div className={`card impact ${imp.hit ? '' : 'miss'}`}>
                <h3>③ 擊球一刻發生咩事</h3>
                {imp.hit ? (
                  <>
                    <div className="stat-row">
                      <div><span>出球速度</span><b>{imp.vOut.length().toFixed(1)} m/s</b></div>
                      <div><span>出球角度</span><b>{elevOf(imp.vOut) >= 0 ? '向上' : '向下'} {Math.abs(elevOf(imp.vOut)).toFixed(0)}°</b></div>
                      <div><span>球要翻轉</span><b>{imp.turnNeeded.toFixed(0)}°</b></div>
                      <div><span>拍面同揮拍夾角（切）</span><b>{imp.cutDeg.toFixed(0)}°</b></div>
                      <div><span>撞擊產生自旋</span><b>{Math.abs(imp.spinRps).toFixed(0)} 轉/秒</b></div>
                      <div><span>撞擊產生翻滾</span><b>{imp.tumbleRps.toFixed(0)} 轉/秒</b></div>
                    </div>
                    <p className="small">
                      揮拍 {swing.speed} m/s → 出球 {imp.vOut.length().toFixed(1)} m/s
                      （約 {(imp.vOut.length() / Math.max(0.1, swing.speed)).toFixed(2)} 倍）。其中大約 <b>{Math.max(0, imp.fromIncoming).toFixed(1)} m/s</b> 係「借」來球反彈嘅力。
                      拍面擦過球頭嘅速度 {imp.slideSpeed.toFixed(1)} m/s{imp.slipping ? '（球頭喺拍線上滑動）' : ''}。
                    </p>
                  </>
                ) : (
                  <p className="small">⚠️ 揮空：拍面冇迎住來球（拍面移動方向同來球方向唔夾）。試吓調高揮拍速度或者改拍面朝向。</p>
                )}
              </div>
            )}

            <div className="card">
              <h3>④ 球拍點揮（拍面 vs 揮拍方向）</h3>
              <Slider label="揮拍速度（拍頭）" value={swing.speed} min={0} max={70} step={1} unit="m/s" onChange={updSwing('speed')} hint="業餘殺球約 30–40，職業可達 60–70" />
              <Slider label="揮拍方向：上下" value={swing.swingElev} min={-40} max={70} step={1} unit="°" onChange={updSwing('swingElev')} />
              <Slider label="揮拍方向：左右" value={swing.swingAzim} min={-80} max={80} step={1} unit="°" onChange={updSwing('swingAzim')} hint="負數 = 向左揮" />
              <Slider label="拍面朝向：上下" value={swing.faceElev} min={-40} max={80} step={1} unit="°" onChange={updSwing('faceElev')} hint="負數 = 拍面向下壓（關拍面），正數 = 開拍面" />
              <Slider label="拍面朝向：左右" value={swing.faceAzim} min={-45} max={45} step={1} unit="°" onChange={updSwing('faceAzim')} />
              <Slider label="握拍鬆緊（有效質量）" value={swing.massG} min={10} max={45} step={1} unit="g" onChange={updSwing('massG')} hint="握得鬆 → 有效質量細 → 回彈慢（擋網用）" />
              <Slider label="擊球點高度" value={contact.y} min={0.3} max={3.2} step={0.05} unit="m" onChange={(v) => { setStrokeId('custom'); setContact((c) => ({ ...c, y: v })); }} />
              <Slider label="擊球點（離網）" value={contact.x} min={-6.5} max={-0.3} step={0.1} unit="m" onChange={(v) => { setStrokeId('custom'); setContact((c) => ({ ...c, x: v })); }} />
            </div>

            <SpinTraining
              swing={swing}
              vIn={incomingVelocity(inc)}
              imp={imp}
              result={result}
              spinDirection={spinDirection}
              onLoad={applyStroke}
              onSwing={(sw) => {
                setStrokeId('custom');
                setSwing(sw);
              }}
            />

            <div className="card">
              <h3>同一下揮拍，唔同來球</h3>
              <p className="muted small">拍點揮都一樣，只係來球方向唔同：</p>
              <div className="table-wrap">
                <table className="cmp">
                  <thead>
                    <tr><th>來球</th><th>出球</th><th>角度</th><th>要翻</th><th>結果</th></tr>
                  </thead>
                  <tbody>
                    {table.map(({ ic, imp: ti, sim }) => (
                      <tr key={ic.id} className={ic.id === incId ? 'on' : ''} onClick={() => applyIncoming(ic.id)}>
                        <td>{ic.name}</td>
                        {ti.hit && sim ? (
                          <>
                            <td>{ti.vOut.length().toFixed(0)} m/s</td>
                            <td>{elevOf(ti.vOut).toFixed(0)}°</td>
                            <td>{ti.turnNeeded.toFixed(0)}°</td>
                            <td>{OUTCOME_LABEL[sim.outcome]}{sim.landing && sim.outcome !== 'net' ? ` ${(sim.landing.x).toFixed(1)}m` : ''}</td>
                          </>
                        ) : (
                          <td colSpan={4}>揮空</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted tiny">「要翻」＝球軸（球頭方向）同出球方向嘅夾角。垂直跌落嘅球球頭向下，殺返出去只需要翻大約 90°；平抽來球要翻足 180°。</p>
            </div>
          </>
        ) : (
          <>
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
            <div className="card">
              <h3>出手條件</h3>
              <Slider label="初速" value={base.speed} min={2} max={110} step={1} unit="m/s" onChange={upd('speed')} />
              <Slider label="仰角" value={base.elevation} min={-30} max={80} step={1} unit="°" onChange={upd('elevation')} />
              <Slider label="左右方向" value={base.azimuth} min={-20} max={20} step={1} unit="°" onChange={upd('azimuth')} />
              <Slider label="擊球高度" value={base.y0} min={0.3} max={3.4} step={0.05} unit="m" onChange={upd('y0')} />
              <Slider label="擊球位置（離網）" value={base.x0} min={-6.5} max={-0.3} step={0.1} unit="m" onChange={upd('x0')} />
              <Slider label="出手自旋" value={base.spinRps} min={0} max={170} step={1} unit="轉/秒" onChange={upd('spinRps')} hint="研究量到劈吊約 125–166 轉/秒" />
              <Slider label="翻滾（打筋斗）" value={base.tumbleRps} min={0} max={30} step={1} unit="轉/秒" onChange={upd('tumbleRps')} />
              <label className="check"><input type="checkbox" checked={noTurnover} onChange={(e) => setNoTurnover(e.target.checked)} />出手已經球頭向前（唔使翻轉）</label>
            </div>
          </>
        )}

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
              同「無自旋」比較：落點{diff.depth < 0 ? '短咗' : '長咗'} <b>{Math.abs(diff.depth * 100).toFixed(0)} cm</b>，
              側向偏移 <b>{Math.abs(diff.side * 100).toFixed(0)} cm</b>
              {Math.abs(diff.side) > 0.02 ? (diff.side > 0 ? '（向右）' : '（向左）') : ''}。
              <span className="muted">（🔬 模型推算）</span>
            </p>
          )}
        </div>

        <div className="card">
          <h3>球同空氣設定</h3>
          <div className="row">
            <span className="muted small">球種</span>
            <div className="seg">
              <button className={type === 'feather' ? 'on' : ''} onClick={() => setType('feather')}>鵝毛球</button>
              <button className={type === 'nylon' ? 'on' : ''} onClick={() => setType('nylon')}>膠球</button>
            </div>
          </div>
          <div className="row">
            <span className="muted small">羽毛排列（自然旋轉方向）</span>
            <div className="seg">
              <button className={spinDirection === 1 ? 'on' : ''} onClick={() => setSpinDirection(1)}>標準</button>
              <button className={spinDirection === -1 ? 'on' : ''} onClick={() => setSpinDirection(-1)}>鏡像</button>
            </div>
          </div>
          <Slider label="羽毛「風車」推力" value={spinDrive} min={0} max={2} step={0.1} unit="×" onChange={setSpinDrive} hint="0 = 羽毛完全唔推佢轉" />
          <Slider label="自旋對阻力影響（研究未有定論）" value={spinDragPct} min={-8} max={8} step={1} unit="%" onChange={setSpinDragPct} hint="Kitta 量到約 +8%，其他研究 −4% 至 −8% 或無分別，所以預設 0" />
          <label className="check"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />顯示「無自旋」對照軌跡</label>
          <label className="check"><input type="checkbox" checked={disableGyro} onChange={(e) => setDisableGyro(e.target.checked)} />關閉陀螺效應</label>
          <label className="check"><input type="checkbox" checked={showForces} onChange={(e) => setShowForces(e.target.checked)} />顯示受力／拍面箭咀</label>
          <label className="check"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />鏡頭跟住球</label>
          {mode === 'hit' && <label className="check"><input type="checkbox" checked={showPlayer} onChange={(e) => setShowPlayer(e.target.checked)} />顯示 3D 球員（跟住步法同揮拍）</label>}
          <div className="row">
            <button className="btn ghost small" onClick={() => sceneRef.current?.resetView()}>全場視角</button>
            {mode === 'hit' && <button className="btn ghost small" onClick={() => sceneRef.current?.focusHit()}>睇擊球位</button>}
          </div>
        </div>

        <div className="card">
          <LineChart title="速度" unit="m/s" series={charts.speed} cursorX={Math.max(0, time)} xMax={end} yMin={0} />
          <LineChart title="傾角（球軸 vs 飛行方向）" unit="°" series={charts.aoa} cursorX={Math.max(0, time)} xMax={end} yMin={0} yMax={180} />
          <LineChart title="自旋轉速" unit="轉/秒" series={charts.spin} cursorX={Math.max(0, time)} xMax={end} />
        </div>

        <PhysicsExplainer />
      </aside>
    </div>
  );
}
