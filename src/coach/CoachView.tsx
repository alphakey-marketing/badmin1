import { useCallback, useMemo, useRef, useState } from 'react';
import { useVideoSource } from './useVideoSource';
import { usePose, type PoseFrame } from './usePose';
import { MotionAnalyzer, liveChecks } from './analysis';
import { PART_LABEL, STATUS_COLOR, partStatus } from './bodyParts';
import PoseOverlay from './PoseOverlay';
import Skeleton3D from './Skeleton3D';
import ChainTimeline from './ChainTimeline';
import DemoView from '../demo/DemoView';
import type { BodyPart, Check, DrillMode, Hand, Landmark, Phase, SwingReport } from './types';

const MODES: Array<{ id: DrillMode; name: string; desc: string }> = [
  { id: 'smash', name: '殺球', desc: '頭頂揮拍：檢查蓄力、轉身、動力鏈次序同擊球點。' },
  { id: 'clear', name: '高遠球', desc: '同殺球一樣嘅準備，擊球點稍後、手臂完全伸直。' },
  { id: 'drop', name: '吊球', desc: '準備動作要同殺球一模一樣，擊球時先減速。' },
  { id: 'net', name: '網前弓步', desc: '上網弓步：膝頭角度、膝頭唔超過腳尖、上身挺直。' },
  { id: 'ready', name: '準備姿勢', desc: '接殺／接發準備：屈膝、重心喺中間、拍頭舉起。' },
];

const PHASE_LABEL: Record<Phase, string> = {
  idle: '搵緊你…',
  ready: '準備',
  loading: '引拍蓄力',
  swing: '揮拍！',
  follow: '隨揮',
};

const DEMO_FOR: Record<DrillMode, string> = { smash: 'smash', clear: 'clear', drop: 'drop', net: 'net', ready: 'split' };

const PARTS: BodyPart[] = ['legs', 'weight', 'trunk', 'shoulder', 'elbow', 'wrist'];

function CheckRow({ c }: { c: Check }) {
  return (
    <li className={`check-row ${c.status}`}>
      <i style={{ background: STATUS_COLOR[c.status] }} />
      <div>
        <div className="check-top">
          <span>{c.label}</span>
          <b>{c.value}</b>
        </div>
        <div className="check-sub">
          目標 {c.target}
          {c.tip && c.status !== 'good' && c.status !== 'na' ? <span className="check-tip"> · {c.tip}</span> : null}
        </div>
      </div>
    </li>
  );
}

export default function CoachView() {
  const src = useVideoSource();
  const [mode, setMode] = useState<DrillMode>('smash');
  const [hand, setHand] = useState<Hand>('right');
  const [slowMo, setSlowMo] = useState(1);
  const [rate, setRate] = useState(1);
  const [frame, setFrame] = useState<PoseFrame | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [report, setReport] = useState<SwingReport | null>(null);
  const [history, setHistory] = useState<SwingReport[]>([]);
  const [show3D, setShow3D] = useState(true);
  const [showDemo, setShowDemo] = useState(true);
  const analyzer = useRef(new MotionAnalyzer());
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const handRef = useRef(hand);
  handRef.current = hand;
  const fileInput = useRef<HTMLInputElement>(null);

  const onFrame = useCallback((f: PoseFrame | null) => {
    setFrame(f);
    if (!f) {
      setChecks([]);
      setPhase('idle');
      return;
    }
    const r = analyzer.current.push(f.world, f.t, handRef.current, modeRef.current);
    setChecks(liveChecks(r.metrics, modeRef.current));
    setPhase(r.phase);
    if (r.swing) {
      setReport(r.swing);
      setHistory((h) => [r.swing as SwingReport, ...h].slice(0, 8));
    }
  }, []);
  const onReset = useCallback(() => analyzer.current.reset(), []);

  const { ready, modelError, fps } = usePose(src.videoRef, src.kind !== null, { slowMotionFactor: slowMo, onFrame, onReset });

  const status = useMemo(() => {
    // Colour by the latest swing report right after a swing, otherwise by the live checks.
    const fresh = report && frame && frame.t - report.at < 2.5 ? report.checks : [];
    return partStatus([...checks, ...fresh]);
  }, [checks, report, frame]);

  const topIssue = checks.find((c) => c.status === 'bad') ?? checks.find((c) => c.status === 'warn');
  const allGood = checks.length > 0 && checks.every((c) => c.status === 'good' || c.status === 'na');
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const mirrored = src.kind === 'camera' && src.facing === 'user';

  const changeMode = (m: DrillMode) => {
    setMode(m);
    setReport(null);
    analyzer.current.reset();
  };

  return (
    <div className="coach">
      <section className="coach-stage">
        <div className="toolbar">
          <div className="seg">
            <button className={src.kind === 'camera' ? 'on' : ''} onClick={() => src.startCamera()}>📷 相機</button>
            <button className={src.kind === 'file' ? 'on' : ''} onClick={() => fileInput.current?.click()}>🎞️ 上載影片</button>
          </div>
          {src.kind === 'camera' && <button className="btn ghost small" onClick={src.flipCamera}>🔄 前／後鏡頭</button>}
          {src.kind && <button className="btn ghost small" onClick={src.stop}>■ 停止</button>}
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                analyzer.current.reset();
                src.openFile(f);
              }
              e.target.value = '';
            }}
          />
          <span className="spacer" />
          <span className={`pill ${ready ? 'ok' : ''}`}>{modelError ? '模型錯誤' : ready ? `● ${fps} fps` : '○ 載入模型中…'}</span>
        </div>

        <div className={`video-wrap ${mirrored ? 'mirror' : ''}`}>
          <video ref={src.videoRef} muted playsInline />
          <PoseOverlay landmarks={frame?.image ?? null} videoRef={src.videoRef} status={status} hand={hand} />
        </div>

        {src.kind && (
          <div className="stage-hud">
            <span className={`phase phase-${phase}`}>{PHASE_LABEL[phase]}</span>
            {frame && topIssue && <span className={`hint ${topIssue.status}`}>{topIssue.tip ?? topIssue.label}</span>}
            {frame && allGood && <span className="hint good">姿勢唔錯，保持住！</span>}
            {!frame && <span className="hint">請企到成個人（頭到腳）都入到鏡</span>}
          </div>
        )}

        {!src.kind && (
          <div className="empty-stage">
            <h2>全身動作分析</h2>
            <p>用相機即時分析，或者上載你打波嘅影片（建議用手機 60/120 fps 慢鏡拍攝）。</p>
            <div className="empty-actions">
              <button className="btn" onClick={() => src.startCamera()} disabled={src.loading}>📷 開相機</button>
              <button className="btn ghost" onClick={() => fileInput.current?.click()}>🎞️ 上載影片</button>
            </div>
            <ul className="tips">
              <li>📐 鏡頭放喺你<b>側面</b>或者<b>斜後 45°</b>，距離 3–4 米，成個人入鏡。</li>
              <li>💡 光線充足，衣服同背景顏色有對比。</li>
              <li>🏸 每次揮拍後停一停，系統會自動出「揮拍報告」。</li>
              <li>🔒 所有分析都喺你部機度做，影像唔會上傳。</li>
            </ul>
          </div>
        )}
        {(src.error || modelError) && <div className="error-box">{src.error ?? modelError}</div>}

        {src.kind === 'file' && (
          <div className="file-bar">
            <span className="muted small">{src.fileName}</span>
            <label className="small">
              播放速度
              <select
                value={rate}
                onChange={(e) => {
                  const r = Number(e.target.value);
                  setRate(r);
                  if (src.videoRef.current) src.videoRef.current.playbackRate = r;
                }}
              >
                {[1, 0.5, 0.25].map((r) => <option key={r} value={r}>{r}×</option>)}
              </select>
            </label>
            <label className="small" title="如果影片係慢鏡（例如 120 fps 用 30 fps 播），揀返倍數，速度先計得啱">
              慢鏡倍數
              <select value={slowMo} onChange={(e) => setSlowMo(Number(e.target.value))}>
                {[1, 2, 4, 8].map((r) => <option key={r} value={r}>{r === 1 ? '正常' : `${r}×`}</option>)}
              </select>
            </label>
          </div>
        )}
      </section>

      <aside className="coach-panel">
        <div className="card">
          <h3>練習項目</h3>
          <div className="chips">
            {MODES.map((m) => (
              <button key={m.id} className={mode === m.id ? 'chip on' : 'chip'} onClick={() => changeMode(m.id)}>
                {m.name}
              </button>
            ))}
          </div>
          <p className="muted small">{modeInfo.desc}</p>
          <div className="row">
            <span className="muted small">持拍手</span>
            <div className="seg">
              <button className={hand === 'right' ? 'on' : ''} onClick={() => setHand('right')}>右手</button>
              <button className={hand === 'left' ? 'on' : ''} onClick={() => setHand('left')}>左手</button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>
            示範：跟住做
            <button className="btn ghost tiny" onClick={() => setShowDemo((v) => !v)}>{showDemo ? '收起' : '展開'}</button>
          </h3>
          {showDemo && <DemoView moveId={DEMO_FOR[mode]} hand={hand} compact />}
        </div>

        <div className="card">
          <h3>全身狀態（即時）</h3>
          <div className="parts">
            {PARTS.map((p) => (
              <div key={p} className="part">
                <i style={{ background: STATUS_COLOR[status[p]] }} />
                {PART_LABEL[p]}
              </div>
            ))}
          </div>
          {checks.length ? (
            <ul className="checks">{checks.map((c) => <CheckRow key={c.id} c={c} />)}</ul>
          ) : (
            <p className="muted small">開始之後，呢度會顯示每個身體部位嘅角度同建議。</p>
          )}
        </div>

        {mode !== 'ready' && (
          <div className="card">
            <h3>
              揮拍報告
              {report && <span className={`score ${report.score >= 75 ? 'good' : report.score >= 50 ? 'warn' : 'bad'}`}>{report.score}分</span>}
            </h3>
            {report ? (
              <>
                <p className="small">
                  {report.sequenceOk
                    ? '✅ 動力鏈次序正確：力量由下而上一節節傳上去。'
                    : '⚠️ 發力次序唔啱。理想係 髖 → 肩 → 手肘 → 手腕，每節喺上一節最快之後先加速。'}
                </p>
                <ChainTimeline report={report} />
                <p className="muted tiny">圓點＝該部位最快嘅時間（相對擊球，毫秒）。理想係由上至下逐個向右排。</p>
                <ul className="checks">{report.checks.map((c) => <CheckRow key={c.id} c={c} />)}</ul>
              </>
            ) : (
              <p className="muted small">做一下完整揮拍（引拍 → 揮拍 → 隨揮），系統偵測到手腕加速就會自動分析。</p>
            )}
            {history.length > 1 && (
              <div className="history">
                <span className="muted small">最近揮拍：</span>
                {history.map((h) => (
                  <button key={h.id} className={`hist ${h.id === report?.id ? 'on' : ''}`} onClick={() => setReport(h)}>
                    {h.score}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card">
          <h3>
            3D 骨架（可拖動旋轉）
            <button className="btn ghost tiny" onClick={() => setShow3D((v) => !v)}>{show3D ? '收起' : '展開'}</button>
          </h3>
          {show3D && <Skeleton3D world={(frame?.world as Landmark[]) ?? null} status={status} hand={hand} />}
          <p className="muted tiny">由任何角度睇你嘅姿勢。地上圓圈＝重心投影。</p>
        </div>
      </aside>
    </div>
  );
}
