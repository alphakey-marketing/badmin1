/**
 * Shuttlecock flight simulator (rigid body, 6 degrees of freedom).
 *
 * World frame: metres, y is up, the court runs along x with the net at x = 0.
 * The shuttle's own axis is local +Y and points from the skirt to the cork.
 *
 * What is modelled:
 *  - Drag, which is very high for a shuttle (it slows down fast).
 *  - The "turnover" (flip) right after the hit: the cork faces the racket at
 *    impact, so the shuttle starts skirt-first and must flip 180°.
 *  - The aerodynamic restoring torque that keeps the cork in front.
 *  - Spin about the shuttle's own axis, which the feathers drive like a turbine.
 *  - Gyroscopic coupling: a spinning shuttle resists changes to its axis, so it
 *    wobbles (precesses) instead of snapping straight.
 *  - Spin opening the skirt a little, which adds drag.
 *  - A small Magnus-like side force when the spinning shuttle is tilted.
 *
 * The constants are rounded values from published shuttlecock studies.
 * This is an educational model, not a lab-grade one.
 */
import { Quaternion, Vector3 } from 'three';

export type ShuttleType = 'feather' | 'nylon';

export interface ShuttleParams {
  type: ShuttleType;
  /** Launch speed, m/s. */
  speed: number;
  /** Launch elevation, degrees (negative = downwards). */
  elevation: number;
  /** Launch direction to the side, degrees (positive = towards +z). */
  azimuth: number;
  /** Launch point. */
  x0: number;
  y0: number;
  z0: number;
  /** Spin about the shuttle's own axis at launch, revolutions per second. */
  spinRps: number;
  /** Tumble (end-over-end rotation) at launch, revolutions per second. */
  tumbleRps: number;
  /** Which way the feathers drive the spin: +1 or -1. */
  spinDirection: 1 | -1;
  /** Strength of the feather "turbine" (1 = normal). 0 removes all natural spin. */
  spinDriveScale: number;
  /** Turn off the gyroscopic effect (to compare). */
  disableGyro?: boolean;
  /** Start with the cork already in front (no flip), to compare. */
  noTurnover?: boolean;
}

export interface Sample {
  t: number;
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
  axis: Vector3;
  speed: number;
  /** Spin about own axis, rev/s (signed). */
  spinRps: number;
  /** Angle between the shuttle axis and the direction of travel, degrees. 0 = cork in front. */
  aoaDeg: number;
  dragCoef: number;
  drag: Vector3;
  side: Vector3;
  gravity: Vector3;
}

export type Outcome = 'in' | 'out' | 'net' | 'airborne';

export interface SimResult {
  samples: Sample[];
  dt: number;
  outcome: Outcome;
  landing: Vector3 | null;
  flightTime: number;
  /** Time until the cork stays in front (angle < 10°). */
  turnoverTime: number | null;
  maxHeight: number;
  terminalVelocity: number;
}

// ---- Physical constants -------------------------------------------------------
const RHO = 1.2; // air density kg/m³
const G = 9.81;
const MASS = 0.0051; // 5.1 g
const RADIUS = 0.034; // skirt radius (68 mm diameter)
const AREA = Math.PI * RADIUS * RADIUS;
const CD0 = 0.6; // aligned drag coefficient
const CN_SLOPE = 1.0; // skirt normal-force slope: how hard the air pushes a tilted skirt
const I_AXIAL = 1.1e-6; // kg·m², about own axis (feathers sit near the rim)
const I_TRANS = 2.2e-6; // kg·m², end-over-end
const CP_OFFSET = 0.025; // centre of pressure sits this far behind the centre of mass (m)
const ROT_DAMPING = 8e-6; // aerodynamic damping of axis rotation (per m/s)
const SPIN_LENGTH = 3; // metres of travel for spin to settle on its natural rate

export const COURT = {
  halfLength: 6.7,
  halfWidthSingles: 2.59,
  halfWidthDoubles: 3.05,
  netHeight: 1.524,
  netPostHeight: 1.55,
};

interface TypeProps {
  /** Natural spin, revolutions per metre travelled. */
  spinPerMetre: number;
  /** Extra drag at the natural spin rate (skirt opens). */
  spinDrag: number;
  /** Skirt squeezes at high speed (nylon) -> less drag. */
  deform: (speed: number) => number;
}

const TYPE: Record<ShuttleType, TypeProps> = {
  feather: { spinPerMetre: 2.5, spinDrag: 0.08, deform: () => 1 },
  nylon: {
    spinPerMetre: 1.0,
    spinDrag: 0.03,
    deform: (v) => 1 - 0.25 * Math.min(1, Math.max(0, (v - 15) / 45)),
  },
};

export function terminalVelocity(type: ShuttleType): number {
  return Math.sqrt((2 * MASS * G) / (RHO * CD0 * TYPE[type].deform(6) * AREA));
}

const UP = new Vector3(0, 1, 0);
const TWO_PI = Math.PI * 2;

export function simulate(p: ShuttleParams): SimResult {
  const tp = TYPE[p.type];
  const dt = 0.0002;
  const recordEvery = 5; // record every 1 ms
  const maxT = 8;

  const el = (p.elevation * Math.PI) / 180;
  const az = (p.azimuth * Math.PI) / 180;
  const dir = new Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();

  const pos = new Vector3(p.x0, p.y0, p.z0);
  const vel = dir.clone().multiplyScalar(p.speed);

  // Initial orientation: at impact the cork points back at the racket.
  // A small tilt (8°) breaks the perfect symmetry so the flip can start.
  const quat = new Quaternion();
  if (p.noTurnover) {
    quat.setFromUnitVectors(UP, dir);
  } else {
    const back = dir.clone().negate();
    const tiltAxis = new Vector3().crossVectors(dir, UP);
    if (tiltAxis.lengthSq() < 1e-6) tiltAxis.set(0, 0, 1);
    tiltAxis.normalize();
    back.applyAxisAngle(tiltAxis, (8 * Math.PI) / 180);
    quat.setFromUnitVectors(UP, back.normalize());
  }

  const axis = UP.clone().applyQuaternion(quat);
  let spin = p.spinRps * TWO_PI; // rad/s about axis
  // Transverse angular velocity (end-over-end tumble), perpendicular to axis.
  const wt = new Vector3();
  if (p.tumbleRps !== 0) {
    const tumbleAxis = new Vector3().crossVectors(axis, UP);
    if (tumbleAxis.lengthSq() < 1e-6) tumbleAxis.set(0, 0, 1);
    tumbleAxis.normalize();
    wt.copy(tumbleAxis).multiplyScalar(p.tumbleRps * TWO_PI);
  }

  const samples: Sample[] = [];
  let t = 0;
  let step = 0;
  let outcome: Outcome = 'airborne';
  let landing: Vector3 | null = null;
  let turnoverTime: number | null = null;
  let maxHeight = pos.y;

  const q = 0.5 * RHO * AREA;
  const tmpA = new Vector3();
  const tmpB = new Vector3();
  const drag = new Vector3();
  const side = new Vector3();
  const torque = new Vector3();
  const gyro = new Vector3();
  const omega = new Vector3();
  const dq = new Quaternion();
  const prevPos = new Vector3();

  let lastCd = CD0;
  let lastAoa = 0;

  const record = () => {
    samples.push({
      t,
      pos: pos.clone(),
      vel: vel.clone(),
      quat: quat.clone(),
      axis: axis.clone(),
      speed: vel.length(),
      spinRps: spin / TWO_PI,
      aoaDeg: lastAoa,
      dragCoef: lastCd,
      drag: drag.clone().divideScalar(MASS),
      side: side.clone().divideScalar(MASS),
      gravity: new Vector3(0, -G, 0),
    });
  };

  while (t < maxT) {
    const speed = vel.length();
    const vhat = speed > 1e-6 ? tmpA.copy(vel).divideScalar(speed) : tmpA.set(1, 0, 0);
    const cosA = Math.max(-1, Math.min(1, axis.dot(vhat)));
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    lastAoa = (Math.acos(cosA) * 180) / Math.PI;

    // --- Forces ---
    const naturalSpin = tp.spinPerMetre * TWO_PI * speed * p.spinDriveScale; // rad/s
    const spinRatio = naturalSpin > 1 ? Math.min(2, Math.abs(spin) / naturalSpin) : Math.min(2, Math.abs(spin) / 60);
    const cd = CD0 * tp.deform(speed) * (1 + 1.2 * sinA * sinA) * (1 + tp.spinDrag * spinRatio);
    lastCd = cd;
    drag.copy(vhat).multiplyScalar(-q * cd * speed * speed);

    // Side force when tilted: normal force (towards the cork's lean) + Magnus-like term from spin.
    side.set(0, 0, 0);
    if (sinA > 1e-4) {
      tmpB.copy(axis).addScaledVector(vhat, -cosA).normalize(); // axis component perpendicular to travel
      side.addScaledVector(tmpB, q * 0.5 * sinA * cosA * speed * speed);
      const spinParam = (spin * RADIUS) / Math.max(speed, 1); // surface speed / flight speed
      tmpB.crossVectors(axis, vhat);
      if (tmpB.lengthSq() > 1e-10) {
        tmpB.normalize();
        side.addScaledVector(tmpB, q * 0.05 * spinParam * sinA * speed * speed);
      }
    }

    const acc = tmpB.set(0, -G, 0).addScaledVector(drag, 1 / MASS).addScaledVector(side, 1 / MASS);

    if (step % recordEvery === 0) record();

    // --- Torques on the axis ---
    // Drag acts at the centre of pressure, behind the centre of mass: it turns the cork to the front.
    torque.crossVectors(axis, vel).multiplyScalar(CP_OFFSET * q * (CD0 + CN_SLOPE) * speed);
    torque.addScaledVector(wt, -ROT_DAMPING * speed);
    torque.addScaledVector(axis, -torque.dot(axis)); // keep only the part that tilts the axis

    // Gyroscopic coupling: I_t dω/dt = τ − I_a·spin·(ω × axis)
    gyro.set(0, 0, 0);
    if (!p.disableGyro) gyro.crossVectors(wt, axis).multiplyScalar(-I_AXIAL * spin);
    wt.addScaledVector(torque.add(gyro), dt / I_TRANS);

    // Spin: feathers act like a turbine when air flows from cork to skirt.
    const spinTarget = p.spinDirection * naturalSpin * cosA;
    spin += ((spinTarget - spin) * Math.max(speed, 0.5) * dt) / SPIN_LENGTH;

    // --- Integrate ---
    prevPos.copy(pos);
    vel.addScaledVector(acc, dt);
    pos.addScaledVector(vel, dt);

    omega.copy(wt).addScaledVector(axis, spin);
    const w = omega.length();
    if (w > 1e-9) {
      dq.setFromAxisAngle(omega.divideScalar(w), w * dt);
      quat.premultiply(dq).normalize();
    }
    axis.copy(UP).applyQuaternion(quat);
    wt.addScaledVector(axis, -wt.dot(axis));

    t += dt;
    step++;
    maxHeight = Math.max(maxHeight, pos.y);

    if (turnoverTime === null && lastAoa < 10 && t > 0.002) turnoverTime = t;
    if (turnoverTime !== null && lastAoa > 25) turnoverTime = null; // it had not settled yet

    // Net
    if ((prevPos.x < 0 && pos.x >= 0) || (prevPos.x > 0 && pos.x <= 0)) {
      if (pos.y < COURT.netHeight && Math.abs(pos.z) < COURT.halfWidthDoubles + 0.1) {
        outcome = 'net';
        landing = pos.clone();
        break;
      }
    }
    // Floor
    if (pos.y <= 0) {
      const f = prevPos.y / (prevPos.y - pos.y);
      pos.lerpVectors(prevPos, pos, f);
      pos.y = 0;
      landing = pos.clone();
      const inX = Math.abs(pos.x) <= COURT.halfLength && Math.sign(pos.x) !== Math.sign(p.x0);
      const inZ = Math.abs(pos.z) <= COURT.halfWidthSingles;
      outcome = inX && inZ ? 'in' : 'out';
      break;
    }
  }
  record();

  return {
    samples,
    dt: dt * recordEvery,
    outcome,
    landing,
    flightTime: t,
    turnoverTime,
    maxHeight,
    terminalVelocity: terminalVelocity(p.type),
  };
}

/** Sample at a time, by index (samples are evenly spaced). */
export function sampleAt(res: SimResult, t: number): Sample {
  const i = Math.max(0, Math.min(res.samples.length - 1, Math.round(t / res.dt)));
  return res.samples[i];
}

export interface ShotPreset {
  id: string;
  name: string;
  hint: string;
  params: Omit<ShuttleParams, 'type' | 'spinDirection' | 'spinDriveScale'>;
}

export const SHOT_PRESETS: ShotPreset[] = [
  {
    id: 'smash',
    name: '殺球',
    hint: '出手極快（約 70 m/s），但空氣阻力好大，飛到對面已經慢咗一半以上。',
    params: { speed: 70, elevation: -11, azimuth: 0, x0: -4.5, y0: 2.8, z0: 0.6, spinRps: 0, tumbleRps: 0 },
  },
  {
    id: 'clear',
    name: '高遠球',
    hint: '高弧線送到底線。留意落點前幾乎垂直跌落——因為已經去到終端速度。',
    params: { speed: 50, elevation: 38, azimuth: 0, x0: -5.2, y0: 2.6, z0: 0, spinRps: 0, tumbleRps: 0 },
  },
  {
    id: 'drop',
    name: '吊球',
    hint: '慢速過網，落在前場。',
    params: { speed: 16, elevation: 6, azimuth: 0, x0: -4.5, y0: 2.6, z0: 0, spinRps: 0, tumbleRps: 0 },
  },
  {
    id: 'slice',
    name: '劈吊（切球）',
    hint: '拍面斜切，出手時已經帶強烈自旋同少少側向。',
    params: { speed: 22, elevation: 2, azimuth: 5, x0: -4.5, y0: 2.6, z0: -0.6, spinRps: 60, tumbleRps: 0 },
  },
  {
    id: 'tumble',
    name: '搓球（翻滾網前）',
    hint: '速度好低，恢復力矩好弱，所以球會一路翻滾，對手好難打到球頭。',
    params: { speed: 4.2, elevation: 62, azimuth: 0, x0: -0.6, y0: 1.25, z0: 0, spinRps: 8, tumbleRps: 14 },
  },
  {
    id: 'lift',
    name: '挑球',
    hint: '由網前低位向上挑去後場。',
    params: { speed: 32, elevation: 52, azimuth: 0, x0: -1.6, y0: 0.6, z0: 0, spinRps: 0, tumbleRps: 0 },
  },
];
