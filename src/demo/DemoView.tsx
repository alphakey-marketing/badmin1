import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { poseAt, solve, type Joints } from './rig';
import { MOVES, type Move, type Part } from './moves';
import { createRacket, createShuttle } from '../physics/shuttleModel';

const PART_COLOR: Record<Exclude<Part, 'none'>, number> = {
  legs: 0xf97316,
  hips: 0xa855f7,
  trunk: 0x38bdf8,
  shoulder: 0x22c55e,
  elbow: 0xeab308,
  wrist: 0xef4444,
};
const PART_LABEL: Record<Part, string> = {
  legs: '腳／步法',
  hips: '髖部',
  trunk: '軀幹',
  shoulder: '肩膊',
  elbow: '手肘',
  wrist: '手腕／前臂',
  none: '',
};
const SKIN = 0xd6d3d1;
const SHIRT = 0x334155;

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

interface Props {
  moveId: string;
  hand: 'right' | 'left';
  compact?: boolean;
  onMoveChange?: (id: string) => void;
  showPicker?: boolean;
}

interface Rig {
  group: THREE.Group;
  bones: Record<string, THREE.Mesh>;
  joints: THREE.Mesh[];
  head: THREE.Mesh;
  torso: THREE.Mesh;
  pelvis: THREE.Mesh;
  feet: [THREE.Mesh, THREE.Mesh];
  racket: THREE.Group;
  shuttle: THREE.Group;
  footprints: THREE.Group;
  trail: THREE.Line | null;
}

const BONE_PARTS: Record<string, Exclude<Part, 'none'>> = {
  thighL: 'legs', thighR: 'legs', shinL: 'legs', shinR: 'legs',
  upperR: 'shoulder', upperL: 'shoulder', foreR: 'elbow', foreL: 'elbow',
  shoulders: 'shoulder', hips: 'hips',
};

function placeBone(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const l = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(1, Math.max(l, 1e-3), 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

function buildCourt(scene: THREE.Scene) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
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
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));
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

function buildRig(scene: THREE.Scene): Rig {
  const group = new THREE.Group();
  scene.add(group);
  const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide });
  const cyl = (r: number) => {
    const g = new THREE.CylinderGeometry(r, r * 0.85, 1, 10);
    return g;
  };
  const bones: Record<string, THREE.Mesh> = {};
  const add = (name: string, r: number, c: number) => {
    const m = new THREE.Mesh(cyl(r), mat(c));
    group.add(m);
    bones[name] = m;
  };
  add('thighL', 0.065, 0x1e293b);
  add('thighR', 0.065, 0x1e293b);
  add('shinL', 0.048, SKIN);
  add('shinR', 0.048, SKIN);
  add('upperR', 0.042, SHIRT);
  add('upperL', 0.042, SHIRT);
  add('foreR', 0.034, SKIN);
  add('foreL', 0.034, SKIN);
  add('shoulders', 0.05, SHIRT);
  add('hips', 0.07, 0x1e293b);
  const jointGeo = new THREE.SphereGeometry(1, 12, 8);
  const joints: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const j = new THREE.Mesh(jointGeo, mat(SKIN));
    group.add(j);
    joints.push(j);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), mat(SKIN));
  group.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1, 0.2), mat(SHIRT));
  group.add(torso);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.2), mat(0x1e293b));
  group.add(pelvis);
  const footGeo = new THREE.BoxGeometry(0.1, 0.07, 1);
  const feet: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(footGeo, mat(0xf8fafc)), new THREE.Mesh(footGeo, mat(0xf8fafc))];
  feet.forEach((f) => group.add(f));
  const racket = createRacket();
  group.add(racket);
  const shuttle = createShuttle();
  shuttle.scale.setScalar(1.6);
  group.add(shuttle);
  const footprints = new THREE.Group();
  group.add(footprints);
  return { group, bones, joints, head, torso, pelvis, feet, racket, shuttle, footprints, trail: null };
}

function applyJoints(r: Rig, j: Joints, focus: Part) {
  const b = r.bones;
  placeBone(b.thighL, j.hipL, j.kneeL);
  placeBone(b.thighR, j.hipR, j.kneeR);
  placeBone(b.shinL, j.kneeL, j.ankleL);
  placeBone(b.shinR, j.kneeR, j.ankleR);
  placeBone(b.upperR, j.shoulderR, j.elbowR);
  placeBone(b.upperL, j.shoulderL, j.elbowL);
  placeBone(b.foreR, j.elbowR, j.wristR);
  placeBone(b.foreL, j.elbowL, j.wristL);
  placeBone(b.shoulders, j.shoulderL, j.shoulderR);
  placeBone(b.hips, j.hipL, j.hipR);
  const pts = [j.hipL, j.hipR, j.kneeL, j.kneeR, j.ankleL, j.ankleR, j.shoulderL, j.shoulderR, j.elbowL, j.elbowR, j.wristL, j.wristR];
  const sizes = [0.07, 0.07, 0.06, 0.06, 0.045, 0.045, 0.055, 0.055, 0.042, 0.042, 0.04, 0.04];
  pts.forEach((p, i) => {
    r.joints[i].position.copy(p);
    r.joints[i].scale.setScalar(sizes[i]);
  });
  r.head.position.copy(j.head);

  // Torso box between pelvis and chest, oriented with the chest axes.
  const mid = j.pelvis.clone().lerp(j.chest, 0.5);
  r.torso.position.copy(mid);
  const yAxis = j.chest.clone().sub(j.pelvis).normalize();
  const xAxis = j.right.clone().addScaledVector(yAxis, -j.right.dot(yAxis)).normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
  r.torso.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  r.torso.scale.set(1, j.chest.distanceTo(j.pelvis) * 0.9, 1);
  const hipAxis = j.hipR.clone().sub(j.hipL).normalize();
  const pz = new THREE.Vector3().crossVectors(hipAxis, new THREE.Vector3(0, 1, 0)).normalize();
  r.pelvis.position.copy(j.pelvis);
  r.pelvis.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(hipAxis, new THREE.Vector3(0, 1, 0), pz.negate()));

  ([['L', 0], ['R', 1]] as const).forEach(([s, i]) => {
    const a = s === 'L' ? j.ankleL : j.ankleR;
    const t = s === 'L' ? j.toeL : j.toeR;
    const f = r.feet[i];
    const heel = a.clone().addScaledVector(t.clone().sub(a).normalize(), -0.06).setY(Math.max(0.035, a.y - 0.05));
    const toe = t.clone().setY(Math.max(0.035, t.y));
    const d = toe.clone().sub(heel);
    f.position.copy(heel).addScaledVector(d, 0.5);
    f.scale.set(1, 1, d.length());
    f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
  });

  // Racket: local +Y = wrist → head, local +Z = face normal.
  const ry = j.racketHead.clone().sub(j.wristR).normalize();
  const rz = j.racketFace.clone();
  const rx = new THREE.Vector3().crossVectors(ry, rz).normalize();
  r.racket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rx, ry, rz));
  r.racket.position.copy(j.racketHead);

  // Highlight the body part to focus on.
  const setColor = (m: THREE.Mesh, base: number, part: Exclude<Part, 'none'> | null) => {
    (m.material as THREE.MeshStandardMaterial).color.set(part && focus === part ? PART_COLOR[part] : base);
    (m.material as THREE.MeshStandardMaterial).emissive.set(part && focus === part ? PART_COLOR[part] : 0x000000);
    (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35;
  };
  for (const [name, m] of Object.entries(b)) {
    const base = name.startsWith('thigh') || name === 'hips' ? 0x1e293b : name.startsWith('upper') || name === 'shoulders' ? SHIRT : SKIN;
    setColor(m, base, BONE_PARTS[name] ?? null);
  }
  setColor(r.torso, SHIRT, 'trunk');
  setColor(r.pelvis, 0x1e293b, 'hips');
  r.feet.forEach((f) => setColor(f, 0xf8fafc, 'legs'));
  setColor(r.joints[10], SKIN, 'wrist');
  setColor(r.joints[11], SKIN, 'wrist');
}

export default function DemoView({ moveId, hand, compact, onMoveChange, showPicker }: Props) {
  const move = useMemo<Move>(() => MOVES.find((m) => m.id === moveId) ?? MOVES[0], [moveId]);
  const mountRef = useRef<HTMLDivElement>(null);
  const ctx = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    rig: Rig;
  } | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.5);
  const [cam, setCam] = useState<CamView>('side');
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const left = hand === 'left';

  // Set up three.js once
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-3, 8, 5);
    scene.add(sun);
    buildCourt(scene);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    const rig = buildRig(scene);
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
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    ctx.current = { renderer, scene, camera, controls, rig };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, []);

  // Footprints + racket-head trail for this move
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    const r = c.rig;
    r.group.scale.z = left ? -1 : 1;
    r.footprints.clear();
    const seen = new Set<string>();
    for (const k of move.keys) {
      for (const [side, f] of [['L', k.pose.footL], ['R', k.pose.footR]] as const) {
        if (f.lift > 0) continue;
        const key = `${side}${f.x.toFixed(2)},${f.z.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const m = new THREE.Mesh(
          new THREE.CircleGeometry(1, 20),
          new THREE.MeshBasicMaterial({ color: side === 'L' ? 0x60a5fa : 0xfb923c, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
        );
        m.scale.set(0.06, 0.13, 1);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = (-f.yaw * Math.PI) / 180 - Math.PI / 2;
        m.position.set(f.x + 0.06 * Math.cos((f.yaw * Math.PI) / 180), 0.006, f.z + 0.06 * Math.sin((f.yaw * Math.PI) / 180));
        r.footprints.add(m);
      }
    }
    if (r.trail) {
      r.group.remove(r.trail);
      r.trail.geometry.dispose();
    }
    const trailPts: THREE.Vector3[] = [];
    for (let tt = 0; tt <= move.duration; tt += 0.02) trailPts.push(solve(poseAt(move.keys, tt)).racketHead);
    r.trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(trailPts),
      new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.35 }),
    );
    r.group.add(r.trail);
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
    const target = new THREE.Vector3(cx, 0.9, cz);
    const off = { side: [0.5, 1.4, 5.2], back: [-5.2, 2.0, 0.4], front: [5.0, 1.6, -0.4], top: [0.01, 7.5, 0.01] }[cam];
    const sideSign = left ? -1 : 1;
    c.camera.position.set(cx + off[0], off[1], cz + off[2] * (cam === 'side' ? sideSign : 1));
    c.controls.target.copy(target);
  }, [cam, move, left]);

  // Animation
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (playing) {
        tRef.current = (tRef.current + dt * speed) % move.duration;
      }
      const c = ctx.current;
      if (c) {
        const tt = tRef.current;
        const step = [...move.steps].reverse().find((s) => tt >= s.t) ?? move.steps[0];
        const j = solve(poseAt(move.keys, tt));
        applyJoints(c.rig, j, step.focus);
        // Shuttle
        const sh = c.rig.shuttle;
        if (move.contactT !== undefined && move.shuttleIn && move.shuttleOut) {
          const contact = solve(poseAt(move.keys, move.contactT)).racketHead;
          const dtc = tt - move.contactT;
          const dirIn = new THREE.Vector3(...move.shuttleIn).normalize();
          const dirOut = new THREE.Vector3(...move.shuttleOut).normalize();
          sh.visible = dtc > -0.7 && dtc < 0.45;
          if (dtc <= 0) {
            sh.position.copy(contact).addScaledVector(dirIn, dtc * 3.5);
            sh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirIn);
          } else {
            sh.position.copy(contact).addScaledVector(dirOut, dtc * 9);
            sh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirOut);
          }
        } else {
          sh.visible = false;
        }
      }
      if (now - lastUi > 80) {
        lastUi = now;
        setT(tRef.current);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [move, playing, speed]);

  const step = [...move.steps].reverse().find((s) => t >= s.t) ?? move.steps[0];
  const stepIdx = move.steps.indexOf(step);

  return (
    <div className={`demo ${compact ? 'compact' : ''}`}>
      {showPicker && (
        <div className="chips">
          {MOVES.map((m) => (
            <button key={m.id} className={m.id === move.id ? 'chip on' : 'chip'} onClick={() => onMoveChange?.(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
      )}
      <div className="demo-stage">
        <div className="demo-canvas" ref={mountRef} />
        <div className="demo-cue">
          <div className="demo-step">
            第 {stepIdx + 1}/{move.steps.length} 步 · <b>{step.title}</b>
            {step.focus !== 'none' && (
              <span className="focus" style={{ background: `#${PART_COLOR[step.focus].toString(16).padStart(6, '0')}` }}>
                重點：{PART_LABEL[step.focus]}
              </span>
            )}
          </div>
          <div className="demo-text">{mirrorText(step.cue, left)}</div>
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
      </div>
      <div className="demo-steps">
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
      </div>
      {!compact && <p className="muted small">{mirrorText(move.summary, left)}</p>}
      <p className="muted tiny">
        地上 <span style={{ color: '#60a5fa' }}>藍色</span>＝左腳落點，<span style={{ color: '#fb923c' }}>橙色</span>＝右腳落點；紅色線＝拍頭路線。可以拖動畫面轉視角。
        示範係按常見教練教法整理嘅簡化動畫（身高約 1.75 m），唔代表唯一正確做法。
      </p>
    </div>
  );
}
