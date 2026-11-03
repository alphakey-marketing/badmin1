/**
 * Motion-capture clips ("badmin1-mocap-v1"): 21 joints (Perception Neuron naming), metres, y up,
 * player swinging towards +x. Made by scripts/mocap/extract_multisense.py from the MultiSenseBadminton
 * dataset (CC BY 4.0), or recorded from video in the coach tab.
 */
import * as THREE from 'three';
import type { Joints } from './rig';

export const MOCAP_JOINTS = [
  'Hips', 'Right UpLeg', 'Right Leg', 'Right Foot', 'Left UpLeg', 'Left Leg', 'Left Foot',
  'Spine', 'Spine1', 'Spine2', 'Neck', 'Neck1', 'Head',
  'Right Shoulder', 'Right Arm', 'Right ForeArm', 'Right Hand',
  'Left Shoulder', 'Left Arm', 'Left ForeArm', 'Left Hand',
] as const;
const J = Object.fromEntries(MOCAP_JOINTS.map((n, i) => [n, i])) as Record<(typeof MOCAP_JOINTS)[number], number>;

export interface MocapClip {
  format: 'badmin1-mocap-v1';
  source: string;
  license: string;
  url?: string;
  device?: string;
  stroke: string;
  subject?: string;
  skill?: string;
  hand: 'right' | 'left';
  fps: number;
  contactFrame: number;
  joints: string[];
  frames: number[][];
  summary?: { elbowAtContact?: number; minRacketSideKneeBeforeContact?: number };
}

export interface MocapIndexEntry {
  stroke: string;
  file: string;
  subject?: string;
  skill?: string;
  count?: number;
}

const base = () => import.meta.env?.BASE_URL ?? './';

/** Clips that were imported into public/mocap (empty list if none). */
export async function loadMocapIndex(): Promise<MocapIndexEntry[]> {
  try {
    const r = await fetch(`${base()}mocap/index.json`, { cache: 'no-cache' });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

export async function loadMocapClip(file: string): Promise<MocapClip | null> {
  try {
    const r = await fetch(`${base()}mocap/${file}`);
    if (!r.ok) return null;
    return validateClip(await r.json());
  } catch {
    return null;
  }
}

export function validateClip(j: unknown): MocapClip | null {
  const c = j as MocapClip;
  if (!c || c.format !== 'badmin1-mocap-v1' || !Array.isArray(c.frames) || c.frames.length < 2) return null;
  if (c.frames.some((f) => !Array.isArray(f) || f.length !== 63)) return null;
  return c;
}

export function clipDuration(c: MocapClip) {
  return (c.frames.length - 1) / c.fps;
}

const v = (f: number[], i: number) => new THREE.Vector3(f[i * 3], f[i * 3 + 1], f[i * 3 + 2]);

/** Interpolated frame; left-handed clips are mirrored so the racket arm is always "R". */
function frameAt(c: MocapClip, t: number): number[] {
  const x = Math.max(0, Math.min(c.frames.length - 1, t * c.fps));
  const i = Math.floor(x);
  const a = c.frames[i];
  const b = c.frames[Math.min(c.frames.length - 1, i + 1)];
  const u = x - i;
  const f = a.map((va, k) => va + (b[k] - va) * u);
  if (c.hand === 'right') return f;
  // Mirror z and swap left/right joints.
  const out = f.slice();
  const swap = (L: number, R: number) => {
    for (let k = 0; k < 3; k++) {
      out[L * 3 + k] = f[R * 3 + k];
      out[R * 3 + k] = f[L * 3 + k];
    }
  };
  swap(J['Left UpLeg'], J['Right UpLeg']);
  swap(J['Left Leg'], J['Right Leg']);
  swap(J['Left Foot'], J['Right Foot']);
  swap(J['Left Shoulder'], J['Right Shoulder']);
  swap(J['Left Arm'], J['Right Arm']);
  swap(J['Left ForeArm'], J['Right ForeArm']);
  swap(J['Left Hand'], J['Right Hand']);
  for (let i2 = 0; i2 < 21; i2++) out[i2 * 3 + 2] = -out[i2 * 3 + 2];
  return out;
}

/**
 * Joints for the 3D figure. The suit records no racket and no toes, so those are estimated:
 * racket roughly continues the forearm, toes point the way the pelvis faces.
 */
export function clipJoints(c: MocapClip, t: number): Joints {
  const f = frameAt(c, t);
  const pelvis = v(f, J.Hips);
  const hipR = v(f, J['Right UpLeg']);
  const hipL = v(f, J['Left UpLeg']);
  const shoulderR = v(f, J['Right Arm']);
  const shoulderL = v(f, J['Left Arm']);
  const chest = shoulderR.clone().lerp(shoulderL, 0.5);
  const headBase = v(f, J.Head);
  const right = shoulderR.clone().sub(shoulderL).normalize();
  const up = chest.clone().sub(pelvis).normalize();
  right.addScaledVector(up, -right.dot(up)).normalize();
  const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
  const head = headBase.clone().addScaledVector(up, 0.06);
  const pr = hipR.clone().sub(hipL).setY(0).normalize();
  const pf = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), pr).normalize();
  const toe = (ankle: THREE.Vector3) => ankle.clone().addScaledVector(pf, 0.17).setY(Math.max(0.02, ankle.y - 0.06));
  const ankleR = v(f, J['Right Foot']);
  const ankleL = v(f, J['Left Foot']);
  const elbowR = v(f, J['Right ForeArm']);
  const wristR = v(f, J['Right Hand']);
  const fore = wristR.clone().sub(elbowR).normalize();
  const rdir = fore.clone().addScaledVector(up, 0.25).normalize();
  const racketHead = wristR.clone().addScaledVector(rdir, 0.5);
  const face = fwd.clone().addScaledVector(rdir, -fwd.dot(rdir)).normalize();
  return {
    pelvis, chest, head, hipL, hipR,
    kneeL: v(f, J['Left Leg']), kneeR: v(f, J['Right Leg']), ankleL, ankleR, toeL: toe(ankleL), toeR: toe(ankleR),
    shoulderL, shoulderR, elbowL: v(f, J['Left ForeArm']), elbowR, wristL: v(f, J['Left Hand']), wristR,
    racketHead, racketFace: face, fwd, right, up,
  };
}

const ang = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => (a.clone().sub(b).angleTo(c.clone().sub(b)) * 180) / Math.PI;

/** Key numbers for comparing a real stroke with the demo animation. */
export function clipSummary(c: MocapClip) {
  const tc = c.contactFrame / c.fps;
  const jc = clipJoints(c, tc);
  let minKnee = 180;
  for (let i = 0; i <= c.contactFrame; i++) {
    const j = clipJoints(c, i / c.fps);
    minKnee = Math.min(minKnee, ang(j.hipR, j.kneeR, j.ankleR));
  }
  return {
    contactT: tc,
    elbowAtContact: ang(jc.shoulderR, jc.elbowR, jc.wristR),
    minKneeR: minKnee,
    wristAboveHead: jc.wristR.y - jc.head.y,
  };
}

// ---------------------------------------------------------------------------
// Recording from video (MediaPipe world landmarks → badmin1-mocap-v1)
// ---------------------------------------------------------------------------

type P = { x: number; y: number; z: number };

/** MediaPipe world landmarks (y down, z towards the camera) → 21-joint frame, y up, metres. */
export function fromMediaPipe(w: P[]): number[] {
  const g = (i: number) => new THREE.Vector3(w[i].x, -w[i].y, -w[i].z);
  const mid = (a: THREE.Vector3, b: THREE.Vector3, t = 0.5) => a.clone().lerp(b, t);
  const hipL = g(23), hipR = g(24), shL = g(11), shR = g(12);
  const hips = mid(hipL, hipR);
  const neck = mid(shL, shR);
  const ears = mid(g(7), g(8));
  const pts = [
    hips, hipR, g(26), g(28), hipL, g(25), g(27),
    mid(hips, neck, 0.25), mid(hips, neck, 0.5), mid(hips, neck, 0.75), neck, mid(neck, ears, 0.5), ears,
    mid(neck, shR, 0.5), shR, g(14), g(16),
    mid(neck, shL, 0.5), shL, g(13), g(15),
  ];
  return pts.flatMap((p) => [p.x, p.y, p.z]);
}

/** Same normalisation as the Python importer: floor, origin, swing direction along +x, contact = hand-speed peak. */
export function buildClip(frames: number[][], fps: number, meta: { stroke: string; hand?: 'right' | 'left'; source: string; license: string }): MocapClip {
  const F = frames.map((f) => f.slice());
  const n = F.length;
  let minFoot = Infinity;
  for (const f of F) minFoot = Math.min(minFoot, f[J['Right Foot'] * 3 + 1], f[J['Left Foot'] * 3 + 1]);
  const ox = F[0][0];
  const oz = F[0][2];
  for (const f of F) for (let i = 0; i < 21; i++) {
    f[i * 3] -= ox;
    f[i * 3 + 1] -= minFoot - 0.08;
    f[i * 3 + 2] -= oz;
  }
  const rel = (f: number[], h: number) => v(f, h).sub(v(f, J.Hips));
  const speed = (h: number) => F.slice(1).map((f, i) => rel(f, h).distanceTo(rel(F[i], h)) * fps);
  const sR = speed(J['Right Hand']);
  const sL = speed(J['Left Hand']);
  const hand = meta.hand ?? (Math.max(...sR) >= Math.max(...sL) ? 'right' : 'left');
  const s = hand === 'right' ? sR : sL;
  const contact = Math.min(n - 1, s.indexOf(Math.max(...s)) + 1);
  const H = hand === 'right' ? J['Right Hand'] : J['Left Hand'];
  const d = rel(F[Math.min(n - 1, contact + 1)], H).sub(rel(F[Math.max(0, contact - 1)], H));
  const yaw = Math.atan2(d.z, d.x);
  const c = Math.cos(-yaw);
  const sn = Math.sin(-yaw);
  for (const f of F) for (let i = 0; i < 21; i++) {
    const x = f[i * 3];
    const z = f[i * 3 + 2];
    f[i * 3] = c * x - sn * z;
    f[i * 3 + 2] = sn * x + c * z;
  }
  return {
    format: 'badmin1-mocap-v1',
    source: meta.source,
    license: meta.license,
    stroke: meta.stroke,
    hand,
    fps,
    contactFrame: contact,
    joints: [...MOCAP_JOINTS],
    frames: F.map((f) => f.map((x) => Math.round(x * 10000) / 10000)),
  };
}

/** Resample irregular samples (t in seconds) to a fixed rate. */
export function resampleFrames(samples: Array<{ t: number; f: number[] }>, fps = 60): number[][] {
  if (samples.length < 2) return samples.map((s) => s.f);
  const out: number[][] = [];
  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  let k = 0;
  for (let t = t0; t <= t1; t += 1 / fps) {
    while (k < samples.length - 2 && samples[k + 1].t < t) k++;
    const a = samples[k];
    const b = samples[k + 1];
    const u = Math.max(0, Math.min(1, (t - a.t) / Math.max(1e-6, b.t - a.t)));
    out.push(a.f.map((x, i) => x + (b.f[i] - x) * u));
  }
  return out;
}
