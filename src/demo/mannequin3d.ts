/**
 * 3D look of the demo player: tapered limbs, shaped torso, head that tracks the shuttle,
 * shoes, racket, and colour highlights for the muscle groups working in each step.
 * Shared by the demo viewer and the physics lab.
 */
import * as THREE from 'three';
import type { Joints } from './rig';
import type { Muscle } from './moves';
import { createRacket } from '../physics/shuttleModel';

const SKIN = 0xe0b897;
const SHIRT = 0x2563eb;
const SHORTS = 0x1e293b;
const SHOE = 0xf8fafc;
const HAIR = 0x1f1a17;
export const MUSCLE_COLOR = 0xff3b30;

type SegName =
  | 'thighL' | 'thighR' | 'shinL' | 'shinR'
  | 'upperL' | 'upperR' | 'foreL' | 'foreR' | 'neck';

/** Which segments light up for each muscle group (racket side is R). */
const MUSCLE_SEGMENTS: Record<Muscle, Array<SegName | 'torso' | 'pelvis' | 'handR' | 'shoulderR'>> = {
  quads: ['thighL', 'thighR'],
  hamstrings: ['thighL', 'thighR'],
  glutes: ['pelvis'],
  calves: ['shinL', 'shinR'],
  core: ['torso'],
  chest: ['torso', 'shoulderR'],
  deltoid: ['shoulderR', 'upperR'],
  triceps: ['upperR'],
  forearm: ['foreR'],
  fingers: ['handR', 'foreR'],
};

export interface Mannequin {
  root: THREE.Group;
  racket: THREE.Group;
  update: (j: Joints, muscles: Muscle[], lookAt: THREE.Vector3 | null, time: number) => void;
  setRacketVisible: (v: boolean) => void;
  dispose: () => void;
}

function mat(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.02 });
}

/** A limb: cylinder from radius r0 (start) to r1 (end), unit length along +Y, base at y=0. */
function limbGeo(r0: number, r1: number) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, 16, 1, true);
  g.translate(0, 0.5, 0);
  return g;
}

export function createMannequin(): Mannequin {
  const root = new THREE.Group();
  const disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
  const track = <T extends THREE.BufferGeometry | THREE.Material>(x: T) => {
    disposables.push(x);
    return x;
  };

  const segs = {} as Record<SegName, THREE.Mesh>;
  const caps: THREE.Mesh[] = [];
  const addSeg = (name: SegName, r0: number, r1: number, color: number) => {
    const m = new THREE.Mesh(track(limbGeo(r0, r1)), track(mat(color)));
    m.castShadow = true;
    root.add(m);
    segs[name] = m;
  };
  addSeg('thighL', 0.078, 0.055, SHORTS);
  addSeg('thighR', 0.078, 0.055, SHORTS);
  addSeg('shinL', 0.052, 0.036, SKIN);
  addSeg('shinR', 0.052, 0.036, SKIN);
  addSeg('upperL', 0.048, 0.038, SHIRT);
  addSeg('upperR', 0.048, 0.038, SHIRT);
  addSeg('foreL', 0.037, 0.027, SKIN);
  addSeg('foreR', 0.037, 0.027, SKIN);
  addSeg('neck', 0.045, 0.042, SKIN);

  // Joint caps so limbs look continuous.
  const capGeo = track(new THREE.SphereGeometry(1, 16, 12));
  const capSpec: Array<[number, number]> = [
    [0.075, SHORTS], [0.075, SHORTS], // hips
    [0.056, SKIN], [0.056, SKIN], // knees
    [0.038, SKIN], [0.038, SKIN], // ankles
    [0.06, SHIRT], [0.06, SHIRT], // shoulders
    [0.039, SKIN], [0.039, SKIN], // elbows
    [0.034, SKIN], [0.034, SKIN], // hands
  ];
  for (const [r, c] of capSpec) {
    const m = new THREE.Mesh(capGeo, track(mat(c)));
    m.scale.setScalar(r);
    m.castShadow = true;
    root.add(m);
    caps.push(m);
  }

  // Torso: lathe profile (hips → waist → chest → shoulders), flattened front-to-back.
  const prof = [
    [0.0, 0.0], [0.15, 0.0], [0.155, 0.08], [0.135, 0.2], [0.15, 0.33], [0.175, 0.44], [0.165, 0.5], [0.1, 0.55], [0.0, 0.56],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(track(new THREE.LatheGeometry(prof, 24)), track(mat(SHIRT)));
  torso.castShadow = true;
  root.add(torso);
  const shorts = new THREE.Mesh(
    track(new THREE.LatheGeometry([[0, -0.06], [0.16, -0.06], [0.165, 0.06], [0.155, 0.12], [0, 0.12]].map(([r, y]) => new THREE.Vector2(r, y)), 24)),
    track(mat(SHORTS)),
  );
  shorts.castShadow = true;
  root.add(shorts);

  // Head with hair and a nose, so you can see where the player looks.
  const head = new THREE.Group();
  const skull = new THREE.Mesh(track(new THREE.SphereGeometry(0.105, 24, 18)), track(mat(SKIN)));
  skull.scale.set(0.92, 1.08, 1);
  skull.castShadow = true;
  head.add(skull);
  const hair = new THREE.Mesh(track(new THREE.SphereGeometry(0.11, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), track(mat(HAIR)));
  hair.rotation.z = 0.25;
  hair.position.set(-0.01, 0.015, 0);
  head.add(hair);
  const nose = new THREE.Mesh(track(new THREE.ConeGeometry(0.018, 0.04, 10)), track(mat(SKIN)));
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(0.1, -0.005, 0);
  head.add(nose);
  for (const z of [-0.035, 0.035]) {
    const eye = new THREE.Mesh(track(new THREE.SphereGeometry(0.011, 8, 6)), track(new THREE.MeshBasicMaterial({ color: 0x111111 })));
    eye.position.set(0.09, 0.025, z);
    head.add(eye);
  }
  root.add(head);

  // Shoes
  const shoeGeo = track(new THREE.BoxGeometry(0.105, 0.075, 1));
  shoeGeo.translate(0, 0, 0.5);
  const shoes = [new THREE.Mesh(shoeGeo, track(mat(SHOE))), new THREE.Mesh(shoeGeo, track(mat(SHOE)))];
  shoes.forEach((s) => {
    s.castShadow = true;
    root.add(s);
  });

  const racket = createRacket();
  racket.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  root.add(racket);

  // Base colours, for resetting after muscle highlights.
  const highlightable = new Map<string, THREE.Mesh>();
  (Object.keys(segs) as SegName[]).forEach((k) => highlightable.set(k, segs[k]));
  highlightable.set('torso', torso);
  highlightable.set('pelvis', shorts);
  highlightable.set('handR', caps[11]);
  highlightable.set('shoulderR', caps[7]);
  const baseColor = new Map<THREE.Mesh, number>();
  highlightable.forEach((m) => baseColor.set(m, (m.material as THREE.MeshStandardMaterial).color.getHex()));

  const Y = new THREE.Vector3(0, 1, 0);
  const place = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
    const d = b.clone().sub(a);
    const l = d.length();
    m.position.copy(a);
    m.scale.set(1, Math.max(1e-3, l), 1);
    m.quaternion.setFromUnitVectors(Y, d.normalize());
  };

  const update = (j: Joints, muscles: Muscle[], lookAt: THREE.Vector3 | null, time: number) => {
    place(segs.thighL, j.hipL, j.kneeL);
    place(segs.thighR, j.hipR, j.kneeR);
    place(segs.shinL, j.kneeL, j.ankleL);
    place(segs.shinR, j.kneeR, j.ankleR);
    place(segs.upperL, j.shoulderL, j.elbowL);
    place(segs.upperR, j.shoulderR, j.elbowR);
    place(segs.foreL, j.elbowL, j.wristL);
    place(segs.foreR, j.elbowR, j.wristR);
    const neckTop = j.chest.clone().addScaledVector(j.up, 0.14);
    place(segs.neck, j.chest.clone().addScaledVector(j.up, 0.02), neckTop);
    [j.hipL, j.hipR, j.kneeL, j.kneeR, j.ankleL, j.ankleR, j.shoulderL, j.shoulderR, j.elbowL, j.elbowR, j.wristL, j.wristR].forEach(
      (p, i) => caps[i].position.copy(p),
    );

    // Torso: from the pelvis up to the shoulder line, oriented by the chest axes.
    const up = j.chest.clone().sub(j.pelvis);
    const h = up.length();
    up.normalize();
    const right = j.right.clone().addScaledVector(up, -j.right.dot(up)).normalize();
    const fwd = new THREE.Vector3().crossVectors(up, right);
    const basis = new THREE.Matrix4().makeBasis(fwd, up, right);
    torso.position.copy(j.pelvis).addScaledVector(up, -0.02);
    torso.quaternion.setFromRotationMatrix(basis);
    torso.scale.set(0.62, (h + 0.06) / 0.56, 1);
    // Shorts follow the hips.
    const hipAxis = j.hipR.clone().sub(j.hipL).normalize();
    const pf = new THREE.Vector3().crossVectors(hipAxis, Y).negate().normalize();
    shorts.position.copy(j.pelvis);
    shorts.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(pf, Y, hipAxis));
    shorts.scale.set(0.68, 1, 1);

    // Head looks at the shuttle (or straight ahead).
    head.position.copy(j.head);
    const target = lookAt ?? j.head.clone().add(j.fwd);
    const look = target.clone().sub(j.head).normalize();
    // Limit how far the head can turn from the chest direction.
    const maxTurn = 1.2;
    const angle = look.angleTo(j.fwd);
    if (angle > maxTurn) look.lerp(j.fwd, 1 - maxTurn / angle).normalize();
    const hr = new THREE.Vector3().crossVectors(look, Y).normalize();
    const hu = new THREE.Vector3().crossVectors(hr, look).normalize();
    head.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(look, hu, hr));

    // Shoes: heel behind the ankle, toes forward.
    ([[j.ankleL, j.toeL], [j.ankleR, j.toeR]] as const).forEach(([a, t], i) => {
      const dir = t.clone().sub(a).setY(0).normalize();
      const heel = a.clone().addScaledVector(dir, -0.07);
      heel.y = Math.max(0.038, a.y - 0.045);
      const toe = t.clone();
      toe.y = Math.max(0.038, t.y);
      const d = toe.clone().sub(heel);
      shoes[i].position.copy(heel);
      shoes[i].scale.set(1, 1, d.length() + 0.03);
      shoes[i].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
    });

    // Racket: local +Y = wrist → head, local +Z = face normal.
    const ry = j.racketHead.clone().sub(j.wristR).normalize();
    const rz = j.racketFace.clone();
    const rx = new THREE.Vector3().crossVectors(ry, rz).normalize();
    racket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rx, ry, rz));
    racket.position.copy(j.racketHead);

    // Muscle highlights (gentle pulse).
    const active = new Set<string>();
    for (const m of muscles) for (const s of MUSCLE_SEGMENTS[m]) active.add(s);
    const pulse = 0.45 + 0.25 * Math.sin(time * 6);
    highlightable.forEach((mesh, key) => {
      const mm = mesh.material as THREE.MeshStandardMaterial;
      if (active.has(key)) {
        mm.color.set(baseColor.get(mesh) ?? 0xffffff).lerp(new THREE.Color(MUSCLE_COLOR), 0.65);
        mm.emissive.set(MUSCLE_COLOR);
        mm.emissiveIntensity = pulse * 0.5;
      } else {
        mm.color.set(baseColor.get(mesh) ?? 0xffffff);
        mm.emissive.set(0x000000);
      }
    });
  };

  return {
    root,
    racket,
    update,
    setRacketVisible: (v) => (racket.visible = v),
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
