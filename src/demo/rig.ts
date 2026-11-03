/**
 * A simple 3D mannequin driven by key poses.
 *
 * World frame: metres, y up, the player faces +x (towards the net), +z is the player's right.
 * Legs and arms use two-bone IK, so feet stay planted where the key pose puts them.
 */
import * as THREE from 'three';

export type Vec = [number, number, number];

export interface Foot {
  x: number;
  z: number;
  /** Direction the toes point, degrees (0 = towards the net, + = to the right). */
  yaw: number;
  /** Height of the foot off the floor (0 = planted). */
  lift: number;
}

/** One key pose. Arm targets are in the chest frame: [forward, up, right], measured from the chest centre. */
export interface Pose {
  /** Pelvis position on the floor and height. */
  x: number;
  z: number;
  h: number;
  /** Pelvis facing, degrees (0 = net, + = turned to the right). */
  yaw: number;
  /** Chest rotation relative to the pelvis (degrees), forward lean (degrees). */
  twist: number;
  lean: number;
  /** Sideways bend of the trunk, degrees (+ = towards the right). */
  side?: number;
  footL: Foot;
  footR: Foot;
  handR: Vec;
  /** Racket head centre (chest frame). */
  headR: Vec;
  /** Rough direction the strings face (chest frame). */
  faceR: Vec;
  handL: Vec;
  /** Elbow hints (chest frame directions). */
  elbowR?: Vec;
  elbowL?: Vec;
}

export const BODY = {
  hipHalf: 0.09,
  thigh: 0.44,
  shin: 0.43,
  ankle: 0.08,
  spine: 0.5,
  shoulderHalf: 0.19,
  upperArm: 0.3,
  forearm: 0.27,
  neck: 0.26,
  racketLen: 0.5, // hand → head centre
};

const UP = new THREE.Vector3(0, 1, 0);
const d2r = (d: number) => (d * Math.PI) / 180;

function yawDir(yawDeg: number) {
  const a = d2r(yawDeg);
  return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
}

/** Two-bone IK: returns the middle joint position. */
function ik(root: THREE.Vector3, target: THREE.Vector3, a: number, b: number, pole: THREE.Vector3) {
  const d = target.clone().sub(root);
  let len = d.length();
  const maxLen = a + b - 1e-4;
  if (len > maxLen) {
    d.setLength(maxLen);
    target = root.clone().add(d);
    len = maxLen;
  }
  len = Math.max(len, Math.abs(a - b) + 1e-3);
  const dir = d.clone().normalize();
  const cosA = (a * a + len * len - b * b) / (2 * a * len);
  const along = a * cosA;
  const perpLen = Math.sqrt(Math.max(0, a * a - along * along));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-8) perp.copy(new THREE.Vector3(0, 0, 1).cross(dir));
  perp.normalize();
  return { mid: root.clone().addScaledVector(dir, along).addScaledVector(perp, perpLen), end: target };
}

export interface Joints {
  pelvis: THREE.Vector3;
  chest: THREE.Vector3;
  head: THREE.Vector3;
  hipL: THREE.Vector3;
  hipR: THREE.Vector3;
  kneeL: THREE.Vector3;
  kneeR: THREE.Vector3;
  ankleL: THREE.Vector3;
  ankleR: THREE.Vector3;
  toeL: THREE.Vector3;
  toeR: THREE.Vector3;
  shoulderL: THREE.Vector3;
  shoulderR: THREE.Vector3;
  elbowL: THREE.Vector3;
  elbowR: THREE.Vector3;
  wristL: THREE.Vector3;
  wristR: THREE.Vector3;
  racketHead: THREE.Vector3;
  racketFace: THREE.Vector3;
  /** chest frame axes */
  fwd: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
}

/** `wristR` overrides where the racket hand goes (world position), e.g. to hold a racket driven by physics. */
export function solve(p: Pose, override?: { wristR?: THREE.Vector3 }): Joints {
  const pf = yawDir(p.yaw);
  const pr = new THREE.Vector3().crossVectors(pf, UP).normalize();
  const pelvis = new THREE.Vector3(p.x, p.h, p.z);
  const hipL = pelvis.clone().addScaledVector(pr, -BODY.hipHalf);
  const hipR = pelvis.clone().addScaledVector(pr, BODY.hipHalf);

  // Chest frame: twist about vertical, then lean forward.
  const cf0 = yawDir(p.yaw + p.twist);
  const cr = new THREE.Vector3().crossVectors(cf0, UP).normalize();
  const lean = new THREE.Quaternion().setFromAxisAngle(cr, -d2r(p.lean));
  const bend = new THREE.Quaternion().setFromAxisAngle(cf0, d2r(p.side ?? 0));
  const rot = bend.multiply(lean);
  const cu = UP.clone().applyQuaternion(rot);
  const cf = cf0.clone().applyQuaternion(rot);
  cr.crossVectors(cf, cu).normalize();
  const chest = pelvis.clone().addScaledVector(cu, BODY.spine);
  const head = chest.clone().addScaledVector(cu, BODY.neck);
  const toWorld = (v: Vec) => cf.clone().multiplyScalar(v[0]).addScaledVector(cu, v[1]).addScaledVector(cr, v[2]);
  const shoulderL = chest.clone().addScaledVector(cr, -BODY.shoulderHalf);
  const shoulderR = chest.clone().addScaledVector(cr, BODY.shoulderHalf);

  const leg = (hip: THREE.Vector3, f: Foot) => {
    const ankle = new THREE.Vector3(f.x, BODY.ankle + f.lift, f.z);
    const fd = yawDir(f.yaw);
    const { mid, end } = ik(hip, ankle, BODY.thigh, BODY.shin, fd.clone().add(new THREE.Vector3(0, 0.15, 0)));
    const toe = end.clone().addScaledVector(fd, 0.17).setY(Math.max(0.02, end.y - 0.06));
    return { knee: mid, ankle: end, toe };
  };
  const L = leg(hipL, p.footL);
  const R = leg(hipR, p.footR);

  const arm = (sh: THREE.Vector3, hand: Vec, hint: Vec | undefined, side: 1 | -1) => {
    const target = side === 1 && override?.wristR ? override.wristR.clone() : chest.clone().add(toWorld(hand));
    const pole = toWorld(hint ?? [-0.3, -1, 0.6 * side]);
    const { mid, end } = ik(sh, target, BODY.upperArm, BODY.forearm, pole);
    return { elbow: mid, wrist: end };
  };
  const AR = arm(shoulderR, p.handR, p.elbowR, 1);
  const AL = arm(shoulderL, p.handL, p.elbowL, -1);

  const headTarget = chest.clone().add(toWorld(p.headR));
  const rdir = headTarget.sub(AR.wrist).normalize();
  const racketHead = AR.wrist.clone().addScaledVector(rdir, BODY.racketLen);
  const face = toWorld(p.faceR);
  face.addScaledVector(rdir, -face.dot(rdir)).normalize();

  return {
    pelvis, chest, head, hipL, hipR,
    kneeL: L.knee, kneeR: R.knee, ankleL: L.ankle, ankleR: R.ankle, toeL: L.toe, toeR: R.toe,
    shoulderL, shoulderR, elbowL: AL.elbow, elbowR: AR.elbow, wristL: AL.wrist, wristR: AR.wrist,
    racketHead, racketFace: face, fwd: cf, right: cr, up: cu,
  };
}

// ---------------------------------------------------------------------------
// Interpolation between key poses (Catmull-Rom on every number)
// ---------------------------------------------------------------------------

function flatten(p: Pose): number[] {
  const f = (x: Foot) => [x.x, x.z, x.yaw, x.lift];
  return [
    p.x, p.z, p.h, p.yaw, p.twist, p.lean, p.side ?? 0,
    ...f(p.footL), ...f(p.footR),
    ...p.handR, ...p.headR, ...p.faceR, ...p.handL,
    ...(p.elbowR ?? [-0.3, -1, 0.6]), ...(p.elbowL ?? [-0.3, -1, -0.6]),
  ];
}

function unflatten(a: number[]): Pose {
  let i = 0;
  const n = () => a[i++];
  const foot = (): Foot => ({ x: n(), z: n(), yaw: n(), lift: Math.max(0, n()) });
  const v = (): Vec => [n(), n(), n()];
  const x = n(), z = n(), h = n(), yaw = n(), twist = n(), lean = n(), side = n();
  const footL = foot();
  const footR = foot();
  return { x, z, h, yaw, twist, lean, side, footL, footR, handR: v(), headR: v(), faceR: v(), handL: v(), elbowR: v(), elbowL: v() };
}

export interface Key {
  t: number;
  pose: Pose;
}

export function poseAt(keys: Key[], t: number): Pose {
  if (t <= keys[0].t) return keys[0].pose;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.pose;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = (t - k1.t) / Math.max(1e-6, k2.t - k1.t);
  const a0 = flatten(k0.pose), a1 = flatten(k1.pose), a2 = flatten(k2.pose), a3 = flatten(k3.pose);
  const u2 = u * u, u3 = u2 * u;
  // Centripetal-free uniform Catmull-Rom, with tension 0.5 (smooth but no big overshoot on plants).
  const out = a1.map((p1, j) => {
    const p0 = a0[j], p2 = a2[j], p3 = a3[j];
    const m1 = 0.5 * (p2 - p0) * 0.6;
    const m2 = 0.5 * (p3 - p1) * 0.6;
    const v = (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
    // No overshoot: stay between the two key values (real joints don't dip past both neighbouring poses).
    return Math.min(Math.max(p1, p2), Math.max(Math.min(p1, p2), v));
  });
  const pose = unflatten(out);
  // Planted feet must not slide: if both keys plant a foot at the same spot, keep it exact.
  for (const k of ['footL', 'footR'] as const) {
    const A = k1.pose[k];
    const B = k2.pose[k];
    if (A.lift === 0 && B.lift === 0 && Math.hypot(A.x - B.x, A.z - B.z) < 1e-3) pose[k] = { ...A };
  }
  return pose;
}

/** Mirror a pose for a left-handed player. */
export function mirrorPose(p: Pose): Pose {
  const mf = (f: Foot): Foot => ({ x: f.x, z: -f.z, yaw: -f.yaw, lift: f.lift });
  const mv = (v: Vec | undefined): Vec | undefined => (v ? [v[0], v[1], -v[2]] : undefined);
  return {
    ...p,
    z: -p.z,
    yaw: -p.yaw,
    twist: -p.twist,
    footL: mf(p.footR),
    footR: mf(p.footL),
    handR: mv(p.handR) as Vec,
    headR: mv(p.headR) as Vec,
    faceR: mv(p.faceR) as Vec,
    handL: mv(p.handL) as Vec,
    elbowR: mv(p.elbowR),
    elbowL: mv(p.elbowL),
  };
}

// ---------------------------------------------------------------------------
// Authoring helpers: set poses by joint angle instead of guessing positions
// ---------------------------------------------------------------------------

/** Shoulder→hand distance for a given elbow angle (180 = straight). */
export function reachFor(elbowDeg: number) {
  const a = BODY.upperArm;
  const b = BODY.forearm;
  return Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(d2r(elbowDeg)));
}

/**
 * Hand target (chest frame) for an arm pointing along `dir` ([fwd, up, right], from the shoulder)
 * with the given elbow angle.
 */
export function hand(side: 'R' | 'L', dir: Vec, elbowDeg: number): Vec {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const r = reachFor(elbowDeg);
  const sz = side === 'R' ? BODY.shoulderHalf : -BODY.shoulderHalf;
  return [(dir[0] / l) * r, (dir[1] / l) * r, sz + (dir[2] / l) * r];
}

/** Racket head target (chest frame): from the hand along `dir`. */
export function racket(handPos: Vec, dir: Vec): Vec {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return [handPos[0] + (dir[0] / l) * BODY.racketLen, handPos[1] + (dir[1] / l) * BODY.racketLen, handPos[2] + (dir[2] / l) * BODY.racketLen];
}

/** Hip-to-ankle length for a knee angle. */
function legLen(kneeDeg: number) {
  const a = BODY.thigh;
  const b = BODY.shin;
  return Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(d2r(kneeDeg)));
}

/** Set the pelvis height so that one leg has the given knee angle (its foot stays where it is). */
export function fitHeight(p: Pose, side: 'R' | 'L', kneeDeg: number): Pose {
  const pf = yawDir(p.yaw);
  const pr = new THREE.Vector3().crossVectors(pf, UP).normalize();
  const hip = new THREE.Vector3(p.x, 0, p.z).addScaledVector(pr, side === 'R' ? BODY.hipHalf : -BODY.hipHalf);
  const f = side === 'R' ? p.footR : p.footL;
  const d = Math.hypot(hip.x - f.x, hip.z - f.z);
  const L = legLen(kneeDeg);
  const v = Math.sqrt(Math.max(0.01, L * L - d * d));
  return { ...p, h: BODY.ankle + f.lift + v };
}

export interface Measure {
  kneeR: number;
  kneeL: number;
  elbowR: number;
  /** Upper arm vs trunk, degrees (0 = arm by the side, 180 = straight up). */
  shoulderR: number;
  lean: number;
  /** Feet apart / shoulder width. */
  stance: number;
  /** Knee ahead of toes along the foot direction (m). */
  kneePastToeR: number;
  kneePastToeL: number;
  /** How far each ankle misses its target (m): > 2 cm means the leg cannot reach (foot floats). */
  footMissR: number;
  footMissL: number;
  wristAboveHead: number;
  racketHeadY: number;
}

const ang = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => (a.clone().sub(b).angleTo(c.clone().sub(b)) * 180) / Math.PI;

export function measure(p: Pose): Measure {
  const j = solve(p);
  const past = (knee: THREE.Vector3, toe: THREE.Vector3, yaw: number) => knee.clone().sub(toe).dot(yawDir(yaw));
  const miss = (ankle: THREE.Vector3, f: Foot) => ankle.distanceTo(new THREE.Vector3(f.x, BODY.ankle + f.lift, f.z));
  return {
    kneeR: ang(j.hipR, j.kneeR, j.ankleR),
    kneeL: ang(j.hipL, j.kneeL, j.ankleL),
    elbowR: ang(j.shoulderR, j.elbowR, j.wristR),
    shoulderR: ang(j.hipR, j.shoulderR, j.elbowR),
    lean: (j.chest.clone().sub(j.pelvis).angleTo(UP) * 180) / Math.PI,
    stance: Math.hypot(j.ankleR.x - j.ankleL.x, j.ankleR.z - j.ankleL.z) / (2 * BODY.shoulderHalf),
    kneePastToeR: past(j.kneeR, j.toeR, p.footR.yaw),
    kneePastToeL: past(j.kneeL, j.toeL, p.footL.yaw),
    footMissR: miss(j.ankleR, p.footR),
    footMissL: miss(j.ankleL, p.footL),
    wristAboveHead: j.wristR.y - j.head.y,
    racketHeadY: j.racketHead.y,
  };
}
