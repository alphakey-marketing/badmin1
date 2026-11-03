/**
 * Racket–shuttle impact.
 *
 * The incoming shuttle flies cork-first, so at contact its axis points along the
 * incoming direction. The racket face (normal N) moves with velocity V. We treat the
 * ~1 ms contact as a rigid-body impulse at the cork:
 *
 *   normal impulse   Jn = (1+e)·(closing speed) / K(N)
 *   friction impulse Jt = min(stick impulse, μ·Jn)      (racket "brushing" the cork)
 *   v_out = v_in + J/m,   ω = I⁻¹ (r × J)
 *
 * K(k) = 1/m + (r×k)·I⁻¹(r×k) + 1/M_racket is the effective inverse mass at the contact point.
 *
 * Checked against research:
 *  - exit speed ≈ 1.35–1.5 × racket head speed for a smash   → here (1+e)/(1+m/M) = 1.40
 *  - slice spin ≈ 125–166 rps (Collet 2024)                   → a 30° cut at 28 m/s gives the same order
 * Assumptions (not measured): μ = 0.4 cork-on-strings friction, cork geometry, 35 g effective racket mass.
 */
import { Vector3 } from 'three';
import { I_AXIAL, I_TRANS, MASS } from './shuttleSim';

export const RESTITUTION = 0.6;
export const FRICTION = 0.4;
const CORK_RADIUS = 0.0128;
/** Cork sphere centre sits this far ahead of the centre of mass, along the axis. */
const CORK_CENTRE = 0.004;

export interface Incoming {
  id: string;
  name: string;
  hint: string;
  /** m/s */
  speed: number;
  /** Angle below horizontal, degrees (90 = straight down). */
  descent: number;
  /** Sideways angle, degrees. */
  azimuth: number;
}

export const INCOMING: Incoming[] = [
  { id: 'vertical', name: '高球垂直跌落', hint: '對方高遠球／挑球落到你後場：已經減到終端速度，差唔多垂直跌落，球頭向下。', speed: 6.6, descent: 78, azimuth: 0 },
  { id: 'lob', name: '斜落高球', hint: '未完全跌直嘅高球，約 55° 落下。', speed: 9, descent: 55, azimuth: 0 },
  { id: 'drive', name: '平抽來球', hint: '平飛過嚟，球頭直指住你。要原路打返，個球要翻足 180°。', speed: 20, descent: 2, azimuth: 0 },
  { id: 'smash', name: '對方殺球', hint: '快速向下斜插，大約 15° 落下。', speed: 25, descent: 15, azimuth: 0 },
  { id: 'net', name: '網前落球', hint: '吊球／放網落到前場，速度慢，大約 45° 落下。', speed: 4.5, descent: 45, azimuth: 0 },
];

export interface Swing {
  /** Racket head speed at contact, m/s. */
  speed: number;
  /** Direction the racket head is moving: elevation / azimuth, degrees. */
  swingElev: number;
  swingAzim: number;
  /** Direction the strings face (face normal): elevation / azimuth, degrees. */
  faceElev: number;
  faceAzim: number;
  /** Effective racket mass at the contact point, grams (firm grip ≈ 35–45, loose ≈ 12–20). */
  massG: number;
}

export interface Stroke {
  id: string;
  name: string;
  hint: string;
  contact: { x: number; y: number; z: number };
  swing: Swing;
  /** Suggested incoming ball for this stroke. */
  incoming: string;
}

/** Right-handed player unless the name says otherwise. +z is the player's right. */
export const STROKES: Stroke[] = [
  {
    id: 'smash', name: '殺球', incoming: 'vertical',
    hint: '拍面向下壓（拍面朝前下方），揮拍方向向前下。',
    contact: { x: -4.4, y: 2.75, z: 0.45 },
    swing: { speed: 50, swingElev: -6, swingAzim: 0, faceElev: -10, faceAzim: 0, massG: 38 },
  },
  {
    id: 'clear', name: '高遠球', incoming: 'vertical',
    hint: '拍面向上開（約 35°），揮拍方向向前上。',
    contact: { x: -5.0, y: 2.65, z: 0.4 },
    swing: { speed: 31, swingElev: 25, swingAzim: 0, faceElev: 36, faceAzim: 0, massG: 35 },
  },
  {
    id: 'drop', name: '吊球（輕擊）', incoming: 'vertical',
    hint: '準備動作同殺球一樣，觸球一刻減速，拍面平推。',
    contact: { x: -4.4, y: 2.65, z: 0.4 },
    swing: { speed: 10, swingElev: 12, swingAzim: 0, faceElev: 24, faceAzim: 0, massG: 30 },
  },
  {
    id: 'slice', name: '劈吊（右手正手切）', incoming: 'vertical',
    hint: '揮拍向左前方「切」過球頭，但拍面仍然向前：拍面同揮拍方向有夾角 → 摩擦令球自旋。',
    contact: { x: -4.4, y: 2.65, z: 0.45 },
    swing: { speed: 28, swingElev: -4, swingAzim: -30, faceElev: 0, faceAzim: 2, massG: 35 },
  },
  {
    id: 'sliceL', name: '左手劈吊（或右手反切）', incoming: 'vertical',
    hint: '同上但左右相反：產生相反方向嘅自旋，研究發現呢種球減速更快。',
    contact: { x: -4.4, y: 2.65, z: -0.45 },
    swing: { speed: 28, swingElev: -4, swingAzim: 30, faceElev: 0, faceAzim: -2, massG: 35 },
  },
  {
    id: 'drive', name: '平抽', incoming: 'drive',
    hint: '拍面垂直、揮拍方向平向前。',
    contact: { x: -3.0, y: 1.55, z: 0.45 },
    swing: { speed: 20, swingElev: 3, swingAzim: 0, faceElev: 4, faceAzim: 0, massG: 32 },
  },
  {
    id: 'block', name: '擋網（接殺）', incoming: 'smash',
    hint: '幾乎唔揮拍，放鬆握拍（有效質量細），拍面向上開，借對方來球嘅力。',
    contact: { x: -3.4, y: 0.85, z: 0.35 },
    swing: { speed: 4, swingElev: 10, swingAzim: 0, faceElev: 22, faceAzim: 0, massG: 20 },
  },
  {
    id: 'tumble', name: '搓球（翻滾網前）', incoming: 'net',
    hint: '拍面向上，球拍橫向擦過球頭底部，令球翻滾。',
    contact: { x: -0.35, y: 1.3, z: 0 },
    swing: { speed: 3.5, swingElev: 25, swingAzim: -70, faceElev: 50, faceAzim: 0, massG: 20 },
  },
  {
    id: 'lift', name: '挑球', incoming: 'net',
    hint: '網前低位，拍面向上大角度開，向上揮。',
    contact: { x: -1.6, y: 0.55, z: 0.3 },
    swing: { speed: 18, swingElev: 45, swingAzim: 0, faceElev: 52, faceAzim: 0, massG: 32 },
  },
];

export function dirFrom(elevDeg: number, azimDeg: number) {
  const e = (elevDeg * Math.PI) / 180;
  const a = (azimDeg * Math.PI) / 180;
  return new Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)).normalize();
}

/** The incoming shuttle travels towards the player (−x). */
export function incomingVelocity(inc: Pick<Incoming, 'speed' | 'descent' | 'azimuth'>) {
  return dirFrom(-inc.descent, inc.azimuth).multiply(new Vector3(-1, 1, 1)).multiplyScalar(inc.speed);
}

export interface ImpactResult {
  hit: boolean;
  vIn: Vector3;
  vRacket: Vector3;
  normal: Vector3;
  vOut: Vector3;
  axis: Vector3;
  omega: Vector3;
  /** Spin about the shuttle's own axis, rps (sign: + = same sense as the natural feather spin in this model). */
  spinRps: number;
  /** End-over-end rotation, rps. */
  tumbleRps: number;
  /** How far the shuttle has to turn to get the cork in front, degrees. */
  turnNeeded: number;
  /** Angle between swing direction and face normal ("cut"), degrees. */
  cutDeg: number;
  /** Closing speed along the face normal and sliding speed across the face, m/s. */
  normalSpeed: number;
  slideSpeed: number;
  /** Whether friction could stop the sliding (else the cork slips across the strings). */
  slipping: boolean;
  /** Part of the exit speed that comes from the incoming ball (rebound), m/s. */
  fromIncoming: number;
}

function invInertia(n: Vector3, w: Vector3) {
  const along = n.clone().multiplyScalar(w.dot(n));
  const perp = w.clone().sub(along);
  return perp.multiplyScalar(1 / I_TRANS).add(along.multiplyScalar(1 / I_AXIAL));
}

export function computeImpact(vIn: Vector3, swing: Swing): ImpactResult {
  const m = MASS;
  const M = swing.massG / 1000;
  const n = vIn.clone().normalize();
  const V = dirFrom(swing.swingElev, swing.swingAzim).multiplyScalar(swing.speed);
  const N = dirFrom(swing.faceElev, swing.faceAzim);

  // Contact point relative to the centre of mass: on the cork surface facing the strings.
  const r = n.clone().multiplyScalar(CORK_CENTRE).addScaledVector(N, -CORK_RADIUS);
  const K = (k: Vector3) => {
    const w = new Vector3().crossVectors(r, k);
    return 1 / m + w.dot(invInertia(n, w)) + 1 / M;
  };

  const u = vIn.clone().sub(V); // shuttle relative to racket
  const un = u.dot(N);
  const cutDeg = (V.length() > 1e-6 ? V.clone().normalize().angleTo(N) : 0) * (180 / Math.PI);
  const base = {
    vIn: vIn.clone(),
    vRacket: V,
    normal: N,
    axis: n.clone(),
    cutDeg,
    normalSpeed: Math.max(0, -un),
  };

  if (un >= -0.05) {
    // The face is not closing on the shuttle: a miss.
    return {
      ...base, hit: false, vOut: vIn.clone(), omega: new Vector3(), spinRps: 0, tumbleRps: 0,
      turnNeeded: 0, slideSpeed: 0, slipping: false, fromIncoming: 0,
    };
  }

  const Jn = (-(1 + RESTITUTION) * un) / K(N);
  const ut = u.clone().addScaledVector(N, -un);
  const slide = ut.length();
  let Jt = 0;
  const tdir = new Vector3();
  let slipping = false;
  if (slide > 1e-6) {
    tdir.copy(ut).multiplyScalar(-1 / slide);
    const stick = slide / K(tdir);
    Jt = Math.min(stick, FRICTION * Jn);
    slipping = stick > FRICTION * Jn;
  }
  const J = N.clone().multiplyScalar(Jn).addScaledVector(tdir, Jt);
  const vOut = vIn.clone().addScaledVector(J, 1 / m);
  const omega = invInertia(n, new Vector3().crossVectors(r, J));
  const spin = omega.dot(n);
  const tumble = omega.clone().addScaledVector(n, -spin).length();

  // Same swing on a shuttle that is not moving: how much of the speed is the racket's.
  const still = computeImpactSpeedOnly(swing, n);
  const turnNeeded = (n.angleTo(vOut) * 180) / Math.PI;

  return {
    ...base,
    hit: true,
    vOut,
    omega,
    spinRps: spin / (2 * Math.PI),
    tumbleRps: tumble / (2 * Math.PI),
    turnNeeded,
    slideSpeed: slide,
    slipping,
    fromIncoming: vOut.length() - still,
  };
}

function computeImpactSpeedOnly(swing: Swing, n: Vector3) {
  // Exit speed if the shuttle had been hanging still (same axis), for the "who supplied the speed" split.
  const r = computeImpactRaw(new Vector3(), swing, n);
  return r;
}

function computeImpactRaw(vIn: Vector3, swing: Swing, n: Vector3) {
  const m = MASS;
  const M = swing.massG / 1000;
  const V = dirFrom(swing.swingElev, swing.swingAzim).multiplyScalar(swing.speed);
  const N = dirFrom(swing.faceElev, swing.faceAzim);
  const r = n.clone().multiplyScalar(CORK_CENTRE).addScaledVector(N, -CORK_RADIUS);
  const K = (k: Vector3) => {
    const w = new Vector3().crossVectors(r, k);
    return 1 / m + w.dot(invInertia(n, w)) + 1 / M;
  };
  const u = vIn.clone().sub(V);
  const un = u.dot(N);
  if (un >= 0) return 0;
  const Jn = (-(1 + RESTITUTION) * un) / K(N);
  const ut = u.clone().addScaledVector(N, -un);
  const slide = ut.length();
  const J = N.clone().multiplyScalar(Jn);
  if (slide > 1e-6) {
    const tdir = ut.clone().multiplyScalar(-1 / slide);
    J.addScaledVector(tdir, Math.min(slide / K(tdir), FRICTION * Jn));
  }
  return vIn.clone().addScaledVector(J, 1 / m).length();
}

/** Point-mass path of the incoming shuttle before contact (integrated backwards in time). */
export function incomingPath(contact: Vector3, vIn: Vector3, duration = 0.6) {
  const k = (0.5 * 1.2 * 0.5 * Math.PI * 0.034 * 0.034) / MASS;
  const dt = 0.001;
  const pts: Array<{ t: number; pos: Vector3; vel: Vector3 }> = [];
  const p = contact.clone();
  const v = vIn.clone();
  for (let t = 0; t >= -duration; t -= dt) {
    pts.push({ t, pos: p.clone(), vel: v.clone() });
    // dv/dt = g − k|v|v ; step backwards
    const a = new Vector3(0, -9.81, 0).addScaledVector(v, -k * v.length());
    v.addScaledVector(a, -dt);
    p.addScaledVector(v, -dt);
    if (p.y > 9 || p.y < 0 || Math.abs(p.x) > 8) break;
  }
  return pts.reverse();
}
