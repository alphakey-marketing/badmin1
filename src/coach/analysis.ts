/**
 * Whole-body movement analysis from MediaPipe world landmarks (3D, metres).
 *
 * Two layers:
 *  1. Per-frame posture checks (legs, weight, trunk, shoulder, elbow, wrist).
 *  2. Swing analysis: when the racket wrist hits a speed peak we look back at
 *     the last ~0.8 s and check the kinetic chain — did the hips turn first,
 *     then the shoulders, then the elbow, then the wrist?
 */
import { ALL_REFERENCES, type AngleRange, type PostureReference } from '../data/badmintonReferenceAngles';
import type { Check, DrillMode, FrameMetrics, Hand, Landmark, Phase, SequencePeak, Status, SwingReport } from './types';

// MediaPipe landmark indices
const NOSE = 0;
const L = { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, foot: 31 };
const R = { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, foot: 32 };

const VIS = 0.5;

type V3 = { x: number; y: number; z: number };
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mid = (a: V3, b: V3): V3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: V3) => Math.sqrt(dot(a, a));
const deg = (r: number) => (r * 180) / Math.PI;

function angleBetween(a: V3, b: V3): number {
  const m = len(a) * len(b);
  if (m < 1e-9) return 0;
  return deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b) / m))));
}
/** Angle at b formed by a–b–c (3D). */
function joint(a: V3, b: V3, c: V3) {
  return angleBetween(sub(a, b), sub(c, b));
}
/** Direction of a line in the floor plane (x–z), degrees. World y points down. */
function yaw(a: V3, b: V3) {
  return deg(Math.atan2(b.z - a.z, b.x - a.x));
}
function wrap180(d: number) {
  let x = ((d + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

const ok = (lm: Landmark | undefined): lm is Landmark => !!lm && (lm.visibility ?? 1) >= VIS;

export function computeMetrics(w: Landmark[], hand: Hand, prev: { t: number; wrist: V3 } | null, t: number): FrameMetrics {
  const A = hand === 'right' ? R : L; // racket side
  const B = hand === 'right' ? L : R;
  const m: FrameMetrics = {
    kneeRacket: null,
    kneeOther: null,
    elbow: null,
    shoulderElev: null,
    elbowAboveShoulder: null,
    wristAboveHead: null,
    otherWristAboveShoulder: null,
    trunkLean: null,
    shoulderYaw: null,
    hipYaw: null,
    xFactor: null,
    stance: null,
    weightRacketFoot: null,
    kneePastToe: null,
    wristSpeed: null,
  };
  const g = (i: number) => w[i];
  const up: V3 = { x: 0, y: -1, z: 0 };

  if (ok(g(A.hip)) && ok(g(A.knee)) && ok(g(A.ankle))) m.kneeRacket = joint(g(A.hip), g(A.knee), g(A.ankle));
  if (ok(g(B.hip)) && ok(g(B.knee)) && ok(g(B.ankle))) m.kneeOther = joint(g(B.hip), g(B.knee), g(B.ankle));
  if (ok(g(A.shoulder)) && ok(g(A.elbow)) && ok(g(A.wrist))) m.elbow = joint(g(A.shoulder), g(A.elbow), g(A.wrist));
  if (ok(g(A.shoulder)) && ok(g(A.elbow)) && ok(g(A.hip))) {
    m.shoulderElev = joint(g(A.hip), g(A.shoulder), g(A.elbow));
    m.elbowAboveShoulder = g(A.shoulder).y - g(A.elbow).y;
  }
  if (ok(g(A.wrist)) && ok(g(NOSE))) m.wristAboveHead = g(NOSE).y - g(A.wrist).y;
  if (ok(g(B.wrist)) && ok(g(B.shoulder))) m.otherWristAboveShoulder = g(B.shoulder).y - g(B.wrist).y;

  const shouldersOk = ok(g(L.shoulder)) && ok(g(R.shoulder));
  const hipsOk = ok(g(L.hip)) && ok(g(R.hip));
  if (shouldersOk && hipsOk) {
    const sm = mid(g(L.shoulder), g(R.shoulder));
    const hm = mid(g(L.hip), g(R.hip));
    m.trunkLean = angleBetween(sub(sm, hm), up);
    m.shoulderYaw = yaw(g(L.shoulder), g(R.shoulder));
    m.hipYaw = yaw(g(L.hip), g(R.hip));
    m.xFactor = Math.abs(wrap180(m.shoulderYaw - m.hipYaw));
  }

  const anklesOk = ok(g(L.ankle)) && ok(g(R.ankle));
  if (anklesOk && shouldersOk) {
    const sw = len(sub(g(L.shoulder), g(R.shoulder)));
    const fa = g(A.ankle);
    const fb = g(B.ankle);
    const feet = Math.hypot(fa.x - fb.x, fa.z - fb.z);
    if (sw > 0.05) m.stance = feet / sw;
    if (hipsOk) {
      // Project the hip centre (≈ centre of mass) onto the line between the feet.
      const hm = mid(g(L.hip), g(R.hip));
      const dx = fa.x - fb.x;
      const dz = fa.z - fb.z;
      const L2 = dx * dx + dz * dz;
      if (L2 > 1e-4) {
        const tt = ((hm.x - fb.x) * dx + (hm.z - fb.z) * dz) / L2;
        m.weightRacketFoot = Math.max(0, Math.min(1, tt));
      }
      // Knee past toes, measured along the direction from the other foot to the racket foot.
      if (ok(g(A.knee)) && ok(g(A.foot)) && L2 > 1e-4) {
        const ux = dx / Math.sqrt(L2);
        const uz = dz / Math.sqrt(L2);
        const k = g(A.knee);
        const toe = g(A.foot);
        m.kneePastToe = (k.x - toe.x) * ux + (k.z - toe.z) * uz;
      }
    }
  }

  if (ok(g(A.wrist)) && prev && t > prev.t) {
    const d = len(sub(g(A.wrist), prev.wrist));
    m.wristSpeed = d / (t - prev.t);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Per-frame checks
// ---------------------------------------------------------------------------

function rangeCheck(
  id: string,
  part: Check['part'],
  label: string,
  v: number | null,
  r: { min: number; max: number },
  unit: string,
  tips: { low: string; high: string; good?: string },
  slack = 8,
): Check {
  const target = `${r.min}–${r.max}${unit}`;
  if (v === null) return { id, part, label, value: '—', target, status: 'na', tip: '睇唔清楚呢個部位，請調整鏡頭。' };
  const value = `${v.toFixed(unit === '' ? 2 : 0)}${unit}`;
  let status: Status = 'good';
  let tip = tips.good;
  if (v < r.min) {
    status = v < r.min - slack ? 'bad' : 'warn';
    tip = tips.low;
  } else if (v > r.max) {
    status = v > r.max + slack ? 'bad' : 'warn';
    tip = tips.high;
  }
  return { id, part, label, value, target, status, tip };
}

function boolCheck(id: string, part: Check['part'], label: string, pass: boolean | null, value: string, target: string, tipBad: string, tipGood?: string): Check {
  if (pass === null) return { id, part, label, value: '—', target, status: 'na' };
  return { id, part, label, value, target, status: pass ? 'good' : 'warn', tip: pass ? tipGood : tipBad };
}

export const REFS: Record<Exclude<DrillMode, 'ready'>, PostureReference> = {
  smash: ALL_REFERENCES.SMASH,
  clear: ALL_REFERENCES.CLEAR,
  drop: ALL_REFERENCES.DROP,
  net: ALL_REFERENCES.NET_SHOT,
};

export function liveChecks(m: FrameMetrics, mode: DrillMode): Check[] {
  const pct = (v: number | null) => (v === null ? null : Math.round(v * 100));
  if (mode === 'ready') {
    return [
      rangeCheck('kneeR', 'legs', '球拍側膝頭', m.kneeRacket, { min: 130, max: 165 }, '°', {
        low: '蹲得太低，會慢咗起步。', high: '膝頭太直，微微屈膝先可以即刻彈出。',
      }),
      rangeCheck('kneeO', 'legs', '另一邊膝頭', m.kneeOther, { min: 130, max: 165 }, '°', {
        low: '蹲得太低。', high: '膝頭太直，屈少少。',
      }),
      rangeCheck('stance', 'legs', '雙腳闊度（肩寬倍數）', m.stance, { min: 1.1, max: 1.8 }, '', {
        low: '雙腳太窄，企闊少少，大約比肩膊闊少少。', high: '企得太闊，移動會慢。',
      }, 0.2),
      rangeCheck('weight', 'weight', '重心位置（%在球拍側腳）', pct(m.weightRacketFoot), { min: 35, max: 65 }, '%', {
        low: '重心偏咗去另一隻腳，放返喺中間。', high: '重心偏咗去球拍側，放返喺中間。',
      }, 10),
      rangeCheck('lean', 'trunk', '上身前傾', m.trunkLean, { min: 5, max: 30 }, '°', {
        low: '上身太直，微微向前傾，重心放前腳掌。', high: '彎腰太多，用膝頭蹲，唔好用腰。',
      }),
      boolCheck('racketUp', 'wrist', '拍頭舉起', m.wristAboveHead === null || m.elbowAboveShoulder === null ? null : m.wristAboveHead > -0.45,
        m.wristAboveHead === null ? '—' : `${(m.wristAboveHead * 100).toFixed(0)} cm`, '手腕高過胸口', '舉起球拍放喺身前，準備隨時出手。'),
    ];
  }

  const ref = REFS[mode];
  if (mode === 'net') {
    const contact = ref.phases.contact!;
    return [
      rangeCheck('kneeFront', 'legs', '前腳膝頭（弓步）', m.kneeRacket, ref.lowerBody.kneeFlexion, '°', {
        low: '蹲得太深，膝頭負擔大，起返身會慢。', high: '弓步唔夠深，前腳膝頭再屈多啲，步幅大啲。',
      }),
      rangeCheck('kneeBack', 'legs', '後腳膝頭', m.kneeOther, { min: 130, max: 180 }, '°', {
        low: '後腳屈得太多，後腳應該伸直撐住。', high: '',
      }),
      boolCheck('kneeToe', 'legs', '膝頭唔好超過腳尖', m.kneePastToe === null ? null : m.kneePastToe < 0.06,
        m.kneePastToe === null ? '—' : `${(m.kneePastToe * 100).toFixed(0)} cm`, '< 6 cm', '膝頭衝過咗腳尖，容易受傷；腳踭先著地，步幅踏遠啲。'),
      rangeCheck('stance', 'legs', '步幅（肩寬倍數）', m.stance, { min: 1.8, max: 3.5 }, '', {
        low: '步幅太短，踏前多一步。', high: '步幅太大，好難退返中間。',
      }, 0.3),
      rangeCheck('lean', 'trunk', '上身前傾', m.trunkLean, { min: 0, max: 35 }, '°', {
        low: '', high: '上身撲得太前，保持挺胸，用腳去到網前，唔好用腰。',
      }),
      rangeCheck('elbow', 'elbow', '手肘角度', m.elbow, contact.racketElbow, '°', {
        low: '手縮得太埋，伸前啲早啲接球。', high: '手臂太直太硬，放鬆少少，用手腕手指控制。',
      }),
    ];
  }

  // Overhead strokes: posture before the swing (side-on, elbow up, weight on the back foot).
  const back = ref.phases.backswing!;
  return [
    rangeCheck('knee', 'legs', '後腳膝頭（蓄力）', m.kneeRacket, ref.lowerBody.kneeFlexion, '°', {
      low: '蹲得太深。', high: '後腳要屈膝蓄力，好似彈弓咁，等陣蹬地先有力。',
    }),
    rangeCheck('weight', 'weight', '重心喺後腳（%）', pct(m.weightRacketFoot), { min: 55, max: 90 }, '%', {
      low: '準備時重心要放喺後腳（球拍側），擊球先轉移去前腳。', high: '重心太後，可能會向後跌。',
    }, 10),
    boolCheck('elbowUp', 'shoulder', '手肘抬高', m.elbowAboveShoulder === null ? null : m.elbowAboveShoulder > -0.05,
      m.elbowAboveShoulder === null ? '—' : `${(m.elbowAboveShoulder * 100).toFixed(0)} cm`, '手肘約同肩膊一樣高', '手肘跌得太低，抬到肩膊高度，手肘指向後面。'),
    rangeCheck('elbowBend', 'elbow', '引拍手肘角度', m.elbow, back.racketElbow, '°', {
      low: '手肘夾得太緊。', high: '引拍時手肘要屈（大約 90°），拍頭放喺頭後面。',
    }, 15),
    boolCheck('otherArm', 'shoulder', '非持拍手舉起', m.otherWristAboveShoulder === null ? null : m.otherWristAboveShoulder > 0,
      m.otherWristAboveShoulder === null ? '—' : `${(m.otherWristAboveShoulder * 100).toFixed(0)} cm`, '高過肩膊', '另一隻手舉高指住球：幫你瞄準、平衡，同埋帶動轉身。'),
    rangeCheck('lean', 'trunk', '上身傾斜', m.trunkLean, { min: 0, max: 35 }, '°', {
      low: '', high: '上身傾得太多，保持身體穩定。',
    }),
  ];
}

// ---------------------------------------------------------------------------
// Swing analysis
// ---------------------------------------------------------------------------

interface Hist {
  t: number;
  m: FrameMetrics;
  wrist: V3 | null;
  shoulderYawU: number | null; // unwrapped
  hipYawU: number | null;
}

const SWING_SPEED = 2.5; // m/s wrist speed (relative to hips) to count as a swing
const BUFFER_S = 3;

export class MotionAnalyzer {
  private hist: Hist[] = [];
  private lastSwingAt = -Infinity;
  private swingId = 0;
  private prev: { t: number; wrist: V3 } | null = null;

  reset() {
    this.hist = [];
    this.prev = null;
    this.lastSwingAt = -Infinity;
  }

  push(world: Landmark[], t: number, hand: Hand, mode: DrillMode): { metrics: FrameMetrics; phase: Phase; swing: SwingReport | null } {
    const A = hand === 'right' ? R : L;
    const metrics = computeMetrics(world, hand, this.prev, t);
    const w = world[A.wrist];
    const wrist = ok(w) ? { x: w.x, y: w.y, z: w.z } : null;
    if (wrist) this.prev = { t, wrist };

    const last = this.hist[this.hist.length - 1];
    const unwrap = (v: number | null, p: number | null | undefined) => {
      if (v === null) return null;
      if (p === null || p === undefined) return v;
      return p + wrap180(v - p);
    };
    this.hist.push({
      t,
      m: metrics,
      wrist,
      shoulderYawU: unwrap(metrics.shoulderYaw, last?.shoulderYawU),
      hipYawU: unwrap(metrics.hipYaw, last?.hipYawU),
    });
    while (this.hist.length && t - this.hist[0].t > BUFFER_S) this.hist.shift();

    const phase = this.phase(metrics, t);
    const swing = this.detectSwing(t, mode);
    return { metrics, phase, swing };
  }

  private phase(m: FrameMetrics, t: number): Phase {
    if (t - this.lastSwingAt < 0.5) return 'follow';
    if ((m.wristSpeed ?? 0) > SWING_SPEED) return 'swing';
    if (m.elbowAboveShoulder !== null && m.elbowAboveShoulder > -0.05 && (m.elbow ?? 180) < 130) return 'loading';
    if (m.kneeRacket !== null) return 'ready';
    return 'idle';
  }

  /** A swing = a wrist-speed peak, confirmed once the speed has clearly dropped again. */
  private detectSwing(t: number, mode: DrillMode): SwingReport | null {
    const h = this.hist;
    if (h.length < 8) return null;
    // Look for the max wrist speed between 0.35 s and 0.12 s ago.
    let peakIdx = -1;
    let peak = 0;
    for (let i = 0; i < h.length; i++) {
      const age = t - h[i].t;
      if (age > 0.35 || age < 0.12) continue;
      const s = h[i].m.wristSpeed ?? 0;
      if (s > peak) {
        peak = s;
        peakIdx = i;
      }
    }
    if (peakIdx < 0 || peak < SWING_SPEED) return null;
    const tPeak = h[peakIdx].t;
    if (tPeak - this.lastSwingAt < 0.7) return null;
    // Must be the max of its neighbourhood (±0.25 s)
    for (const x of h) {
      if (Math.abs(x.t - tPeak) < 0.25 && (x.m.wristSpeed ?? 0) > peak) return null;
    }
    const overhead = mode === 'smash' || mode === 'clear' || mode === 'drop';
    const contact = h[peakIdx].m;
    if (overhead && contact.wristAboveHead !== null && contact.wristAboveHead < -0.15) return null; // not an overhead hit
    this.lastSwingAt = tPeak;
    return this.buildReport(peakIdx, mode);
  }

  private buildReport(peakIdx: number, mode: DrillMode): SwingReport {
    const h = this.hist;
    const tc = h[peakIdx].t;
    const win = h.filter((x) => x.t >= tc - 0.8 && x.t <= tc + 0.3);
    const pre = win.filter((x) => x.t <= tc);
    const contact = h[peakIdx].m;

    // Angular velocities (central difference)
    const rate = (get: (x: Hist) => number | null) => {
      const out: Array<{ t: number; v: number }> = [];
      for (let i = 1; i < win.length - 1; i++) {
        const a = get(win[i - 1]);
        const b = get(win[i + 1]);
        const dt = win[i + 1].t - win[i - 1].t;
        if (a === null || b === null || dt <= 0) continue;
        out.push({ t: win[i].t, v: (b - a) / dt });
      }
      return out;
    };
    const hipRate = rate((x) => x.hipYawU).map((p) => ({ ...p, v: Math.abs(p.v) }));
    const shRate = rate((x) => x.shoulderYawU).map((p) => ({ ...p, v: Math.abs(p.v) }));
    const elbowRate = rate((x) => x.m.elbow); // + = extending
    const wristSp = win.filter((x) => x.m.wristSpeed !== null).map((x) => ({ t: x.t, v: x.m.wristSpeed as number }));

    const peakOf = (arr: Array<{ t: number; v: number }>, from: number, to: number) => {
      let best: { t: number; v: number } | null = null;
      for (const p of arr) if (p.t >= from && p.t <= to && (!best || p.v > best.v)) best = p;
      return best;
    };
    const pHip = peakOf(hipRate, tc - 0.6, tc + 0.1);
    const pSh = peakOf(shRate, tc - 0.6, tc + 0.1);
    const pEl = peakOf(elbowRate, tc - 0.4, tc + 0.1);
    const pWr = peakOf(wristSp, tc - 0.05, tc + 0.05) ?? { t: tc, v: contact.wristSpeed ?? 0 };

    const seq: SequencePeak[] = [
      { part: 'hips', label: '髖部轉動', tMs: pHip ? (pHip.t - tc) * 1000 : null, peak: pHip?.v ?? null, unit: '°/s' },
      { part: 'shoulders', label: '肩膊轉動', tMs: pSh ? (pSh.t - tc) * 1000 : null, peak: pSh?.v ?? null, unit: '°/s' },
      { part: 'elbow', label: '手肘伸直', tMs: pEl ? (pEl.t - tc) * 1000 : null, peak: pEl?.v ?? null, unit: '°/s' },
      { part: 'wrist', label: '手腕速度', tMs: (pWr.t - tc) * 1000, peak: pWr.v, unit: 'm/s' },
    ];
    const TOL = 25; // ms, about one video frame
    const times = seq.map((s) => s.tMs);
    let sequenceOk = times.every((x) => x !== null);
    for (let i = 1; i < times.length && sequenceOk; i++) {
      if ((times[i] as number) < (times[i - 1] as number) - TOL) sequenceOk = false;
    }

    const norm = (arr: Array<{ t: number; v: number }>) => {
      const mx = Math.max(1e-6, ...arr.map((p) => p.v));
      return arr.map((p) => [(p.t - tc) * 1000, Math.max(0, p.v / mx)] as [number, number]);
    };
    const curves = { hips: norm(hipRate), shoulders: norm(shRate), elbow: norm(elbowRate), wrist: norm(wristSp) };

    const range = (get: (x: Hist) => number | null) => {
      const v = win.map(get).filter((x): x is number => x !== null);
      return v.length ? Math.max(...v) - Math.min(...v) : null;
    };
    const minOf = (arr: Hist[], get: (x: Hist) => number | null) => {
      const v = arr.map(get).filter((x): x is number => x !== null);
      return v.length ? Math.min(...v) : null;
    };
    const maxOf = (arr: Hist[], get: (x: Hist) => number | null) => {
      const v = arr.map(get).filter((x): x is number => x !== null);
      return v.length ? Math.max(...v) : null;
    };

    const checks: Check[] = [];
    const seqText = seq.map((s) => s.label.replace(/轉動|伸直|速度/, '')).join(' → ');
    checks.push({
      id: 'sequence',
      part: 'trunk',
      label: '動力鏈次序',
      value: sequenceOk ? '正確' : '次序亂咗',
      target: seqText,
      status: times.some((x) => x === null) ? 'na' : sequenceOk ? 'good' : 'bad',
      tip: sequenceOk
        ? '由大肌肉去到小肌肉，好似鞭咁一節接一節加速，做得好！'
        : '發力次序唔啱：應該腳蹬地 → 轉髖 → 轉肩 → 手肘 → 手腕。唔好淨係用手打。',
    });

    if (mode === 'net') {
      const ref = REFS.net;
      checks.push(
        rangeCheck('lungeKnee', 'legs', '弓步最深膝頭角度', minOf(win, (x) => x.m.kneeRacket), ref.lowerBody.kneeFlexion, '°', {
          low: '蹲得太深。', high: '弓步唔夠深，前腳再踏遠啲、屈多啲。',
        }),
        rangeCheck('netElbow', 'elbow', '擊球時手肘', contact.elbow, ref.phases.contact!.racketElbow, '°', {
          low: '手縮得太埋。', high: '手臂太直，放鬆啲，用手指同手腕控制。',
        }),
        boolCheck('netToe', 'legs', '膝頭唔超過腳尖', maxOf(win, (x) => x.m.kneePastToe) === null ? null : (maxOf(win, (x) => x.m.kneePastToe) as number) < 0.06,
          `${((maxOf(win, (x) => x.m.kneePastToe) ?? 0) * 100).toFixed(0)} cm`, '< 6 cm', '膝頭衝過腳尖，保護膝頭：腳踭先落地。'),
      );
    } else if (mode !== 'ready') {
      const ref = REFS[mode];
      const shRange = range((x) => x.shoulderYawU);
      const hipRange = range((x) => x.hipYawU);
      const wStart = pre.length ? pre[0].m.weightRacketFoot : null;
      const wEnd = win[win.length - 1]?.m.weightRacketFoot ?? null;
      const shift = wStart !== null && wEnd !== null ? wStart - wEnd : null;
      checks.push(
        rangeCheck('loadKnee', 'legs', '蓄力時後腳膝頭', minOf(pre, (x) => x.m.kneeRacket), ref.lowerBody.kneeFlexion, '°', {
          low: '蹲得太深。', high: '後腳冇屈膝蓄力，力量冇由地面傳上嚟。',
        }),
        boolCheck('weightShift', 'weight', '重心由後腳轉去前腳', shift === null ? null : shift > 0.15,
          shift === null ? '—' : `${(shift * 100).toFixed(0)}%`, '> 15%', '擊球時重心要由後腳推去前腳，唔好企定喺度用手打。'),
        rangeCheck('hipTurn', 'trunk', '髖部轉動幅度', hipRange, { min: 25, max: 120 }, '°', {
          low: '髖部冇點轉，要用腰胯帶動上身。', high: '',
        }, 10),
        rangeCheck('shTurn', 'trunk', '肩膊轉動幅度', shRange, { min: 45, max: 150 }, '°', {
          low: '轉身唔夠，準備時側身，擊球時肩膊轉返向網。', high: '',
        }, 10),
        rangeCheck('backElbow', 'elbow', '引拍最屈手肘', minOf(pre, (x) => x.m.elbow), ref.phases.backswing!.racketElbow, '°', {
          low: '手肘夾得太緊。', high: '引拍時手肘唔夠屈，拍頭要落到頭後面。',
        }, 15),
        rangeCheck('contactElbow', 'elbow', '擊球時手肘', contact.elbow, ref.phases.contact!.racketElbow, '°', {
          low: '擊球時手未伸直，擊球點太低。', high: '手臂鎖死咗，放鬆少少。',
        }),
        rangeCheck('contactShoulder', 'shoulder', '擊球時手臂抬高', contact.shoulderElev, ref.phases.contact!.racketShoulderElevation ?? { min: 140, max: 180 }, '°', {
          low: '擊球點太低，伸盡手喺最高點擊球。', high: '',
        }),
        boolCheck('contactHigh', 'wrist', '擊球點高過頭', contact.wristAboveHead === null ? null : contact.wristAboveHead > 0.1,
          contact.wristAboveHead === null ? '—' : `${(contact.wristAboveHead * 100).toFixed(0)} cm`, '> 10 cm', '擊球點要喺頭頂前上方。'),
      );
    }

    // The kinetic-chain order counts double: it is the core of a whole-body stroke.
    const scored = checks.filter((c) => c.status !== 'na');
    const weight = (c: Check) => (c.id === 'sequence' ? 2 : 1);
    const pts = scored.reduce((s, c) => s + weight(c) * (c.status === 'good' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
    const total = scored.reduce((s, c) => s + weight(c), 0);
    const score = total ? Math.round((pts / total) * 100) : 0;

    return { id: ++this.swingId, mode, at: tc, score, checks, sequence: seq, sequenceOk, curves };
  }
}

export function refLabel(r: AngleRange) {
  return `${r.min}–${r.max}°`;
}
