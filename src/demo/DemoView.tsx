import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { measure, poseAt, solve } from './rig';
import { CATEGORIES, MOVES, MUSCLE_LABEL, type Move, type Part, type Step } from './moves';
import { createMannequin, type Mannequin } from './mannequin3d';
import { createHumanFigure } from './humanModel';
import { clipDuration, clipJoints, clipSummary, loadMocapClip, loadMocapIndex, validateClip, type MocapClip, type MocapIndexEntry } from './mocap';
import { createShuttle } from '../physics/shuttleModel';

const PART_LABEL: Record<Part, string> = {
  legs: '腳／步法',
  hips: '髖部',
  trunk: '軀幹',
  shoulder: '肩膊',
  elbow: '手肘',
  wrist: '手腕／前臂',
  none: '',
};

type CamView = 'side' | 'back' | 'front' | 'top';
const CAMS: Array<{ id: CamView; label: string }> = [
  { id: 'side', label: '側面' },
  { id: 'back', label: '後面' },
  { id: 'front', label: '正面' },
  { id: 'top', label: '上面' },
];

/** Swap 左/右 in cues for left-handed players. */
function mirrorText(s: string, left: boolean) {
  if (!left) return s;
  return s.replace(/[左右]/g, (c) => (c === '左' ? '右' : '左'));
}

function stepAt(move: Move, t: number): Step {
  return [...move.steps].reverse().find((s) => t >= s.t) ?? move.steps[0];
}

function buildCourt(scene: THREE.Scene) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const netX = 3.3;
  const back = netX - 6.7;
  const pts: number[] = [];
  const seg = (x1: number, z1: number, x2: number, z2: number) => pts.push(x1, 0.004, z1, x2, 0.004, z2);
  for (const z of [-3.05, -2.59, 2.59, 3.05]) seg(back, z, netX, z);
  seg(back, -3.05, back, 3.05);
  seg(back + 0.76, -3.05, back + 0.76, 3.05);
  seg(netX - 1.98, -3.05, netX - 1.98, 3.05);
  seg(back, 0, netX - 1.98, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })));
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(6.3, 0.76),
    new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.15, side: THREE.DoubleSide }),
  );
  net.rotation.y = Math.PI / 2;
  net.position.set(netX, 1.524 - 0.38, 0);
  scene.add(net);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 6.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  tape.position.set(netX, 1.524, 0);
  scene.add(tape);
  const base = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.22, 32), new THREE.MeshBasicMaterial({ color: 0x94a3b8, side: THREE.DoubleSide }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.005;
  scene.add(base);
}

interface Props {
  moveId: string;
  hand: 'right' | 'left';
  compact?: boolean;
  onMoveChange?: (id: string) => void;
  showPicker?: boolean;
}

export default function DemoView({ moveId, hand, compact, onMoveChange, showPicker }: Props) {
  const move = useMemo<Move>(() => MOVES.find((m) => m.id === moveId) ?? MOVES[0], [moveId]);
  const mountRef = useRef<HTMLDivElement>(null);
  const ctx = useRef<{
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    world: THREE.Group;
    man: Mannequin;
    shuttle: THREE.Group;
    footprints: THREE.Group;
    trail: THREE.Line | null;
  } | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.5);
  const [cam, setCam] = useState<CamView>('side');
  const [t, setT] = useState(0);
  const [showMuscles, setShowMuscles] = useState(true);
  const [figureKind, setFigureKind] = useState<'human' | 'mannequin'>('human');
  const [figureStatus, setFigureStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [mocapIndex, setMocapIndex] = useState<MocapIndexEntry[]>([]);
  const [clip, setClip] = useState<MocapClip | null>(null);
  const [source, setSource] = useState<'anim' | 'mocap'>('anim');
  const fileRef = useRef<HTMLInputElement>(null);
  const tRef = useRef(0);
  const left = hand === 'left';
  const useMocap = source === 'mocap' && !!clip;
  const optsRef = useRef({ move, playing, speed, showMuscles, clip: useMocap ? clip : null });
  optsRef.current = { move, playing, speed, showMuscles, clip: useMocap ? clip : null };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.Fog(0x0b1220, 14, 30);
    scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-3, 9, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
    scene.add(sun);
    buildCourt(scene);
    const world = new THREE.Group();
    scene.add(world);
    const man = createMannequin();
    world.add(man.root);
    const figure = { current: man as Mannequin };
    const shuttle = createShuttle();
    shuttle.scale.setScalar(1.6);
    world.add(shuttle);
    const footprints = new THREE.Group();
    world.add(footprints);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const o = optsRef.current;
      const m = o.move;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const mc = o.clip;
      const dur = mc ? clipDuration(mc) : m.duration;
      if (o.playing) tRef.current = (tRef.current + dt * o.speed) % dur;
      const tt = tRef.current % dur;
      const st = stepAt(m, tt);
      const j = mc ? clipJoints(mc, tt) : solve(poseAt(m.keys, tt));

      // Shuttle
      let look: THREE.Vector3 | null = null;
      if (!mc && m.contactT !== undefined && m.shuttleIn && m.shuttleOut) {
        const contact = solve(poseAt(m.keys, m.contactT)).racketHead;
        const dtc = tt - m.contactT;
        const dirIn = new THREE.Vector3(...m.shuttleIn).normalize();
        const dirOut = new THREE.Vector3(...m.shuttleOut).normalize();
        shuttle.visible = dtc > -0.8 && dtc < 0.45;
        if (dtc <= 0) {
          shuttle.position.copy(contact).addScaledVector(dirIn, dtc * 3.5);
          shuttle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirIn);
        } else {
          shuttle.position.copy(contact).addScaledVector(dirOut, dtc * 9);
          shuttle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirOut);
        }
        if (shuttle.visible && dtc < 0.05) look = shuttle.position.clone();
      } else {
        shuttle.visible = false;
      }
      const fig = ctx.current?.man ?? figure.current;
      fig.update(j, o.showMuscles && !mc ? st.muscles ?? [] : [], look, now / 1000);
      controls.update();
      renderer.render(scene, camera);
      if (now - lastUi > 80) {
        lastUi = now;
        setT(tt);
      }
    };
    raf = requestAnimationFrame(tick);
    ctx.current = { camera, controls, world, man, shuttle, footprints, trail: null };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      ctx.current?.man.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, []);

  // Swap between the realistic model and the simple mannequin.
  useEffect(() => {
    let cancelled = false;
    const c = ctx.current;
    if (!c) return;
    const swap = (next: Mannequin) => {
      const cur = ctx.current;
      if (!cur) return;
      cur.world.remove(cur.man.root);
      cur.man.dispose();
      cur.man = next;
      cur.world.add(next.root);
    };
    if (figureKind === 'mannequin') {
      swap(createMannequin());
      setFigureStatus('ok');
      return;
    }
    setFigureStatus('loading');
    createHumanFigure()
      .then((h) => {
        if (cancelled) return h.dispose();
        swap(h);
        setFigureStatus('ok');
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setFigureStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [figureKind]);

  // Imported motion-capture clips (public/mocap/index.json).
  useEffect(() => {
    loadMocapIndex().then(setMocapIndex);
  }, []);
  useEffect(() => {
    const entry = mocapIndex.find((e) => e.stroke === move.id);
    if (!entry) {
      setClip((c) => (c && c.source.startsWith('MultiSense') ? null : c));
      setSource('anim');
      return;
    }
    loadMocapClip(entry.file).then((c) => {
      setClip(c);
      if (c) setSource('mocap');
    });
  }, [mocapIndex, move.id]);

  const compare = useMemo(() => {
    if (!clip) return null;
    const cs = clipSummary(clip);
    // Demo measured exactly like the importer: straightest elbow 0.3 s before → 0.15 s after contact,
    // deepest knees in the 0.4 s before contact (loading phase).
    let demo: { elbow: number; kneeR: number; kneeL: number } | null = null;
    if (move.contactT !== undefined) {
      const c = move.contactT;
      let elbow = 0;
      let kneeR = 180;
      let kneeL = 180;
      for (let tt = Math.max(0, c - 0.4); tt <= c + 0.15; tt += 0.01) {
        const m = measure(poseAt(move.keys, tt));
        if (tt >= c - 0.3) elbow = Math.max(elbow, m.elbowR);
        if (tt <= c) {
          kneeR = Math.min(kneeR, m.kneeR);
          kneeL = Math.min(kneeL, m.kneeL);
        }
      }
      demo = { elbow, kneeR, kneeL };
    }
    const entry = mocapIndex.find((e) => e.stroke === move.id && clip.source.startsWith('MultiSense'));
    return { cs, demo, entry };
  }, [clip, move, mocapIndex]);

  // Footprints + racket-head path for this move
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    c.world.scale.z = left ? -1 : 1;
    c.footprints.clear();
    const seen = new Set<string>();
    let order = 0;
    for (const k of move.keys) {
      for (const [side, f] of [['L', k.pose.footL], ['R', k.pose.footR]] as const) {
        if (f.lift > 0) continue;
        const key = `${side}${f.x.toFixed(2)},${f.z.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        order++;
        const m = new THREE.Mesh(
          new THREE.CircleGeometry(1, 20),
          new THREE.MeshBasicMaterial({ color: side === 'L' ? 0x60a5fa : 0xfb923c, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
        );
        m.scale.set(0.06, 0.13, 1);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = (-f.yaw * Math.PI) / 180 - Math.PI / 2;
        m.position.set(f.x + 0.06 * Math.cos((f.yaw * Math.PI) / 180), 0.006 + order * 0.0001, f.z + 0.06 * Math.sin((f.yaw * Math.PI) / 180));
        c.footprints.add(m);
      }
    }
    if (c.trail) {
      c.world.remove(c.trail);
      c.trail.geometry.dispose();
    }
    const pts: THREE.Vector3[] = [];
    for (let tt = 0; tt <= move.duration; tt += 0.015) pts.push(solve(poseAt(move.keys, tt)).racketHead);
    c.trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.45 }),
    );
    c.world.add(c.trail);
    tRef.current = 0;
  }, [move, left]);

  // Camera presets
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    let cx = 0;
    let cz = 0;
    for (const k of move.keys) {
      cx += k.pose.x;
      cz += k.pose.z;
    }
    cx /= move.keys.length;
    cz = (cz / move.keys.length) * (left ? -1 : 1);
    const off = { side: [0.4, 1.4, 4.8], back: [-4.8, 2.0, 0.3], front: [4.6, 1.6, -0.3], top: [0.01, 7, 0.01] }[cam];
    c.camera.position.set(cx + off[0], off[1], cz + off[2] * (cam === 'side' && left ? -1 : 1));
    c.controls.target.set(cx, 0.9, cz);
  }, [cam, move, left]);

  const step = stepAt(move, t);
  const stepIdx = move.steps.indexOf(step);
  const checks = useMemo(() => {
    if (!step.checks?.length) return [];
    const me = measure(poseAt(move.keys, step.t + 0.0005));
    return step.checks.map((c) => {
      const v = me[c.metric];
      const shown = c.unit === 'cm' ? `${(v * 100).toFixed(0)} cm` : c.unit === '°' ? `${v.toFixed(0)}°` : c.unit === 'm' ? `${v.toFixed(2)} m` : `${v.toFixed(2)}×`;
      const range = c.unit === 'cm' ? `≤ ${(c.max * 100).toFixed(0)} cm` : `${c.min}–${c.max}${c.unit === '°' ? '°' : c.unit === 'm' ? ' m' : '×'}`;
      return { ...c, shown, range, ok: v >= c.min && v <= c.max };
    });
  }, [step, move]);

  return (
    <div className={`demo ${compact ? 'compact' : ''}`}>
      {showPicker && (
        <div className="move-picker">
          {CATEGORIES.map((cat) => (
            <div key={cat} className="move-cat">
              <span className="muted small">{cat}</span>
              <div className="chips">
                {MOVES.filter((m) => m.category === cat).map((m) => (
                  <button key={m.id} className={m.id === move.id ? 'chip on' : 'chip'} onClick={() => onMoveChange?.(m.id)}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="demo-stage">
        <div className="demo-canvas" ref={mountRef} />
        <div className="demo-cue">
          {useMocap && clip ? (
            <div className="demo-step">
              🎥 真人動作捕捉播放中 · {t.toFixed(2)} s / {clipDuration(clip).toFixed(2)} s · 擊球約喺 {(clip.contactFrame / clip.fps).toFixed(2)} s
            </div>
          ) : (
          <>
          <div className="demo-step">
            第 {stepIdx + 1}/{move.steps.length} 步 · <b>{step.title}</b>
            {step.focus !== 'none' && <span className="focus">重點：{PART_LABEL[step.focus]}</span>}
          </div>
          <div className="demo-text">{mirrorText(step.cue, left)}</div>
          {showMuscles && step.muscles?.length ? (
            <div className="demo-muscles">
              主要用力肌群：{step.muscles.map((m) => MUSCLE_LABEL[m]).join('、')}
            </div>
          ) : null}
          </>
          )}
        </div>
      </div>
      <div className="demo-controls">
        <button className="btn icon" onClick={() => setPlaying((p) => !p)} aria-label={playing ? '暫停' : '播放'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="seg">
          {[1, 0.5, 0.25].map((v) => (
            <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>
              {v === 1 ? '1×' : v === 0.5 ? '½×' : '¼×'}
            </button>
          ))}
        </div>
        <div className="seg">
          {CAMS.map((c) => (
            <button key={c.id} className={cam === c.id ? 'on' : ''} onClick={() => setCam(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <label className="check small">
          <input type="checkbox" checked={showMuscles} onChange={(e) => setShowMuscles(e.target.checked)} />
          顯示肌群
        </label>
      </div>
      <div className="demo-controls">
        <div className="seg">
          <button className={figureKind === 'human' ? 'on' : ''} onClick={() => setFigureKind('human')}>真人模型</button>
          <button className={figureKind === 'mannequin' ? 'on' : ''} onClick={() => setFigureKind('mannequin')}>簡化人偶</button>
        </div>
        {figureKind === 'human' && figureStatus === 'loading' && <span className="muted small">載入真人模型中…</span>}
        {figureKind === 'human' && figureStatus === 'error' && <span className="small" style={{ color: '#fca5a5' }}>真人模型載入失敗，顯示簡化人偶</span>}
        <div className="seg">
          <button className={!useMocap ? 'on' : ''} onClick={() => setSource('anim')}>示範動畫</button>
          <button className={useMocap ? 'on' : ''} disabled={!clip} onClick={() => setSource('mocap')} title={clip ? '' : '未有呢個動作嘅動作捕捉數據'}>
            真人動作捕捉
          </button>
        </div>
        <button className="btn ghost small" onClick={() => fileRef.current?.click()}>載入動作檔 (.json)</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const c = validateClip(JSON.parse(await f.text()));
              if (!c) throw new Error('bad');
              setClip(c);
              setSource('mocap');
              tRef.current = 0;
            } catch {
              alert('呢個檔案唔係 badmin1-mocap-v1 格式。');
            }
          }}
        />
      </div>
      {useMocap && clip && (
        <div className="demo-checks">
          <span className="small">
            🎥 <b>真人動作捕捉</b>：{clip.source}（{clip.license}）{clip.subject ? ` · ${clip.subject}` : ''}{clip.skill ? ` · ${clip.skill}` : ''} · {clip.hand === 'right' ? '右手' : '左手'} · {clip.frames.length} 幀 @ {clip.fps} fps
            {clip.url && <> · <a href={clip.url} target="_blank" rel="noreferrer">數據來源</a></>}
          </span>
          {compare?.entry?.stats && compare.demo ? (
            <>
              <span className="muted small">
                專家數據：{compare.entry.subjects?.length ?? 5} 位專家、{compare.entry.count} 次擊球（中位數，括號＝中間 50%）vs 示範動畫：
              </span>
              {(
                [
                  ['擊球前後最伸直嘅手肘', 'elbowMaxNearContact', compare.demo.elbow],
                  ['擊球前 0.4 秒內最屈嘅持拍側膝頭', 'minRacketKneeBefore', compare.demo.kneeR],
                  ['擊球前 0.4 秒內最屈嘅另一邊膝頭', 'minOtherKneeBefore', compare.demo.kneeL],
                ] as const
              ).map(([label, key, demoVal]) => {
                const st = compare.entry?.stats?.[key];
                if (!st) return null;
                const ok = demoVal >= st.q1 - 3 && demoVal <= st.q3 + 3;
                return (
                  <div key={key} className={`demo-check ${ok ? 'ok' : 'bad'}`}>
                    <span>{ok ? '✓' : '△'} {label}</span>
                    <b>專家 {st.median.toFixed(0)}°（{st.q1.toFixed(0)}–{st.q3.toFixed(0)}°）</b>
                    <span className="muted">示範 {demoVal.toFixed(0)}°</span>
                  </div>
                );
              })}
            </>
          ) : compare ? (
            <div className="demo-check ok">
              <span>呢段動作</span>
              <b>擊球時手肘 {compare.cs.elbowAtContact.toFixed(0)}° · 最屈膝頭 {compare.cs.minKneeR.toFixed(0)}°</b>
              {compare.demo && <span className="muted">示範：手肘 {compare.demo.elbow.toFixed(0)}° · 膝頭 {compare.demo.kneeR.toFixed(0)}°</span>}
            </div>
          ) : null}
          <span className="muted tiny">動作捕捉衣只記錄身體關節，冇記錄球拍同腳趾：球拍方向同腳尖係估算嘅。擊球時間 = 持拍手（相對髖部）最快嗰一刻。</span>
        </div>
      )}
      {!useMocap && !compact && (move.id === 'clear' || move.id === 'backhandDrive') && !clip && (
        <p className="muted tiny">
          呢個動作可以用真人動作捕捉數據：從 MultiSenseBadminton 數據集（CC BY 4.0）匯入，步驟見 <code>public/mocap/README.md</code>。
        </p>
      )}
      {!useMocap && <div className="demo-steps">
        {move.steps.map((s, i) => (
          <button
            key={s.t}
            className={i === stepIdx ? 'on' : ''}
            onClick={() => {
              tRef.current = s.t + 0.001;
              setPlaying(false);
              setT(s.t);
            }}
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </div>}
      {!useMocap && checks.length > 0 && (
        <div className="demo-checks">
          <span className="muted small">呢一步嘅角度核對（示範人物 vs 參考）：</span>
          {checks.map((c) => (
            <div key={c.label} className={`demo-check ${c.ok ? 'ok' : 'bad'}`}>
              <span>{c.ok ? '✓' : '✗'} {c.label}</span>
              <b>{c.shown}</b>
              <span className="muted">參考 {c.range} · {c.ref}</span>
            </div>
          ))}
        </div>
      )}
      {!compact && <p className="muted small">{mirrorText(move.summary, left)}</p>}
      <p className="muted tiny">
        地上 <span style={{ color: '#60a5fa' }}>藍色</span>＝左腳落點，<span style={{ color: '#fb923c' }}>橙色</span>＝右腳落點；黃色線＝拍頭路線；紅色發光＝主要用力肌群（教學簡化）。可以拖動畫面轉視角。
        示範係按常見教練教法整理、再用研究角度核對過嘅簡化動畫（身高約 1.75 m），唔代表唯一正確做法。
      </p>
    </div>
  );
}
