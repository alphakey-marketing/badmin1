/**
 * Realistic human figure: a skinned glTF character (Mixamo skeleton) driven by our joint positions.
 *
 * Retargeting: for every bone we know its rest-pose "frame" (bone direction + bend/side axis) and build
 * the same frame from the target joints; the bone's rotation is the rotation between the two frames.
 * All maths is done in the figure root's local space, so any transform above it (offset, left-handed mirror)
 * just works.
 *
 * Model: public/models/michelle.glb, from the three.js examples (character and skeleton from Adobe Mixamo).
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BODY, type Joints } from './rig';
import type { Muscle } from './moves';
import { createMannequin, type Mannequin } from './mannequin3d';
import { createRacket } from '../physics/shuttleModel';

let assetPromise: Promise<GLTF> | null = null;
function loadAsset(): Promise<GLTF> {
  if (!assetPromise) {
    const url = `${import.meta.env?.BASE_URL ?? './'}models/michelle.glb`;
    assetPromise = new GLTFLoader().loadAsync(url);
    assetPromise.catch(() => (assetPromise = null));
  }
  return assetPromise;
}

type BoneKey =
  | 'Hips' | 'Spine' | 'Spine1' | 'Spine2' | 'Neck' | 'Head' | 'HeadTop_End'
  | 'RightShoulder' | 'RightArm' | 'RightForeArm' | 'RightHand' | 'RightHandMiddle1'
  | 'LeftShoulder' | 'LeftArm' | 'LeftForeArm' | 'LeftHand' | 'LeftHandMiddle1'
  | 'RightUpLeg' | 'RightLeg' | 'RightFoot' | 'RightToeBase'
  | 'LeftUpLeg' | 'LeftLeg' | 'LeftFoot' | 'LeftToeBase';

const KEYS: BoneKey[] = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle1',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandMiddle1',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
];

/** Bones we rotate, parents before children. */
const DRIVEN: BoneKey[] = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightUpLeg', 'RightLeg', 'RightFoot',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
];

const UP = new THREE.Vector3(0, 1, 0);

/** Orthonormal frame from a primary direction d and a secondary direction s. */
function frame(d: THREE.Vector3, s: THREE.Vector3): THREE.Matrix4 {
  const x = d.clone().normalize();
  const z = s.clone().addScaledVector(x, -s.dot(x));
  if (z.lengthSq() < 1e-8) z.copy(Math.abs(x.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).addScaledVector(x, -x.dot(Math.abs(x.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)));
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z);
}

/** Direction the middle joint sticks out from the line joining the outer two (knee/elbow direction). */
function bendDir(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, fallback: THREE.Vector3) {
  const ac = c.clone().sub(a);
  const l2 = ac.lengthSq();
  const ab = b.clone().sub(a);
  const proj = l2 > 1e-8 ? a.clone().addScaledVector(ac, ab.dot(ac) / l2) : a.clone();
  const k = b.clone().sub(proj);
  return k.length() > 0.015 ? k.normalize() : fallback.clone();
}

export async function createHumanFigure(): Promise<Mannequin> {
  const gltf = await loadAsset();
  const root = new THREE.Group();
  const model = cloneSkinned(gltf.scene) as THREE.Group;
  root.add(model);

  const find = (k: BoneKey) => {
    let found: THREE.Bone | null = null;
    model.traverse((o) => {
      if (!found && (o as THREE.Bone).isBone && (o.name === `mixamorig${k}` || o.name === `mixamorig:${k}`)) found = o as THREE.Bone;
    });
    return found as THREE.Bone | null;
  };
  const bones = {} as Record<BoneKey, THREE.Bone>;
  for (const k of KEYS) {
    const b = find(k);
    if (!b) throw new Error(`model is missing bone ${k}`);
    bones[k] = b;
  }

  // Rest pose = T-pose clip if present.
  const tpose = gltf.animations.find((a) => /t-?pose/i.test(a.name));
  if (tpose) {
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(tpose).play();
    mixer.update(0);
    mixer.stopAllAction();
  }
  model.updateMatrixWorld(true);
  const wp = (k: BoneKey) => bones[k].getWorldPosition(new THREE.Vector3());

  // Scale so the leg (hip → ankle) matches our rig.
  const legLen = wp('RightUpLeg').distanceTo(wp('RightLeg')) + wp('RightLeg').distanceTo(wp('RightFoot'));
  model.scale.multiplyScalar((BODY.thigh + BODY.shin) / legLen);
  model.updateMatrixWorld(true);

  // Rest data (root is at identity, so world == root space here).
  const P0 = {} as Record<BoneKey, THREE.Vector3>;
  const Q0 = {} as Record<BoneKey, THREE.Quaternion>;
  for (const k of KEYS) {
    P0[k] = wp(k);
    Q0[k] = bones[k].getWorldQuaternion(new THREE.Quaternion());
  }
  const armature = bones.Hips.parent as THREE.Object3D;
  // The hips bone sits above the hip joints: keep that offset so the legs start at our hip joints.
  const hipsOffset0 = P0.Hips.clone().sub(P0.RightUpLeg.clone().lerp(P0.LeftUpLeg, 0.5));
  const armQ = armature.getWorldQuaternion(new THREE.Quaternion());
  const armInv = armature.matrixWorld.clone().invert();
  const R0 = P0.RightUpLeg.clone().sub(P0.LeftUpLeg).normalize();
  const F0 = new THREE.Vector3().crossVectors(UP, R0).normalize();
  const shoulderR0 = P0.RightArm.clone().sub(P0.LeftArm).normalize();
  const palmDown = new THREE.Vector3(0, -1, 0);

  const restFrame: Partial<Record<BoneKey, THREE.Matrix4>> = {
    Hips: frame(P0.Spine1.clone().sub(P0.Hips), R0),
    Spine: frame(P0.Neck.clone().sub(P0.Hips), shoulderR0),
    Spine1: frame(P0.Neck.clone().sub(P0.Hips), shoulderR0),
    Spine2: frame(P0.Neck.clone().sub(P0.Hips), shoulderR0),
    Neck: frame(P0.Head.clone().sub(P0.Neck), shoulderR0),
    Head: frame(P0.HeadTop_End.clone().sub(P0.Head), shoulderR0),
    RightShoulder: frame(P0.RightArm.clone().sub(P0.RightShoulder), UP),
    LeftShoulder: frame(P0.LeftArm.clone().sub(P0.LeftShoulder), UP),
  };
  const limbRest = (a: BoneKey, b: BoneKey, bend: THREE.Vector3) => {
    const d = P0[b].clone().sub(P0[a]);
    return frame(d, new THREE.Vector3().crossVectors(d, bend));
  };
  restFrame.RightArm = limbRest('RightArm', 'RightForeArm', F0.clone().negate());
  restFrame.RightForeArm = limbRest('RightForeArm', 'RightHand', F0.clone().negate());
  restFrame.LeftArm = limbRest('LeftArm', 'LeftForeArm', F0.clone().negate());
  restFrame.LeftForeArm = limbRest('LeftForeArm', 'LeftHand', F0.clone().negate());
  restFrame.RightUpLeg = limbRest('RightUpLeg', 'RightLeg', F0);
  restFrame.RightLeg = limbRest('RightLeg', 'RightFoot', F0);
  restFrame.LeftUpLeg = limbRest('LeftUpLeg', 'LeftLeg', F0);
  restFrame.LeftLeg = limbRest('LeftLeg', 'LeftFoot', F0);
  restFrame.RightHand = frame(P0.RightHandMiddle1.clone().sub(P0.RightHand), palmDown);
  restFrame.LeftHand = frame(P0.LeftHandMiddle1.clone().sub(P0.LeftHand), palmDown);
  restFrame.RightFoot = frame(P0.RightToeBase.clone().sub(P0.RightFoot), R0);
  restFrame.LeftFoot = frame(P0.LeftToeBase.clone().sub(P0.LeftFoot), R0);
  const restInv = {} as Record<BoneKey, THREE.Matrix4>;
  for (const k of DRIVEN) restInv[k] = (restFrame[k] as THREE.Matrix4).clone().transpose();

  // Grip: curl the racket-hand fingers, relax the other hand.
  const curl = (side: 'Right' | 'Left', deg: number) => {
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
      for (const n of [1, 2, 3]) {
        const b = model.getObjectByName(`mixamorig${side}Hand${f}${n}`) ?? model.getObjectByName(`mixamorig:${side}Hand${f}${n}`);
        if (b) b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(deg)));
      }
    }
  };
  curl('Right', 65);
  curl('Left', 20);

  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });

  const racket = createRacket();
  racket.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  root.add(racket);

  // Translucent muscle overlay on top of the skin.
  const overlay = createMannequin({ overlay: true });
  root.add(overlay.root);

  const parentKey: Partial<Record<BoneKey, BoneKey>> = {
    Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck',
    RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
    LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
    RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg',
    LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg',
  };
  const Qc = {} as Record<BoneKey, THREE.Quaternion>;
  const tmpM = new THREE.Matrix4();

  const setBone = (k: BoneKey, target: THREE.Matrix4) => {
    // Δ = target · rest⁻¹ ; world(root-space) rotation = Δ · Q0
    tmpM.multiplyMatrices(target, restInv[k]);
    const delta = new THREE.Quaternion().setFromRotationMatrix(tmpM);
    const q = delta.multiply(Q0[k]);
    Qc[k] = q;
    const pk = parentKey[k];
    const parentQ = pk ? Qc[pk] : armQ;
    bones[k].quaternion.copy(parentQ.clone().invert().multiply(q));
  };

  const update = (j: Joints, muscles: Muscle[], lookAt: THREE.Vector3 | null, time: number) => {
    const hipR = j.hipR.clone().sub(j.hipL);
    const chestR = j.right.clone();
    const spineD = j.chest.clone().sub(j.pelvis);
    setBone('Hips', frame(spineD, hipR));
    // Root position: the model's hip joints land on ours.
    const hipsRot = Qc.Hips.clone().multiply(Q0.Hips.clone().invert());
    const hipsPos = j.hipR.clone().lerp(j.hipL, 0.5).add(hipsOffset0.clone().applyQuaternion(hipsRot));
    bones.Hips.position.copy(hipsPos.applyMatrix4(armInv));
    const lerpR = (t: number) => hipR.clone().normalize().lerp(chestR, t).normalize();
    setBone('Spine', frame(spineD, lerpR(0.33)));
    setBone('Spine1', frame(spineD, lerpR(0.66)));
    setBone('Spine2', frame(spineD, chestR));
    setBone('Neck', frame(j.head.clone().sub(j.chest), chestR));
    const look = (lookAt ? lookAt.clone().sub(j.head) : j.fwd.clone()).normalize();
    if (look.angleTo(j.fwd) > 1.2) look.lerp(j.fwd, 1 - 1.2 / look.angleTo(j.fwd)).normalize();
    const headRight = new THREE.Vector3().crossVectors(look, j.up).normalize();
    setBone('Head', frame(j.up.clone().addScaledVector(look, 0.15), headRight));

    setBone('RightShoulder', frame(j.shoulderR.clone().sub(j.chest), j.up));
    setBone('LeftShoulder', frame(j.shoulderL.clone().sub(j.chest), j.up));
    const arm = (side: 'Right' | 'Left', sh: THREE.Vector3, el: THREE.Vector3, wr: THREE.Vector3) => {
      const k = bendDir(sh, el, wr, j.fwd.clone().negate());
      const dU = el.clone().sub(sh);
      const s = new THREE.Vector3().crossVectors(dU, k);
      setBone(`${side}Arm`, frame(dU, s));
      const dF = wr.clone().sub(el);
      setBone(`${side}ForeArm`, frame(dF, new THREE.Vector3().crossVectors(dF, k)));
      return dF.normalize();
    };
    const foreR = arm('Right', j.shoulderR, j.elbowR, j.wristR);
    const foreL = arm('Left', j.shoulderL, j.elbowL, j.wristL);
    const rdir = j.racketHead.clone().sub(j.wristR).normalize();
    setBone('RightHand', frame(foreR.clone().multiplyScalar(0.55).addScaledVector(rdir, 0.45), j.racketFace));
    setBone('LeftHand', frame(foreL, j.up.clone().negate()));

    const leg = (side: 'Right' | 'Left', hip: THREE.Vector3, knee: THREE.Vector3, ankle: THREE.Vector3, toe: THREE.Vector3) => {
      const pf = new THREE.Vector3().crossVectors(UP, hipR).normalize();
      const k = bendDir(hip, knee, ankle, pf);
      const dT = knee.clone().sub(hip);
      setBone(`${side}UpLeg`, frame(dT, new THREE.Vector3().crossVectors(dT, k)));
      const dS = ankle.clone().sub(knee);
      setBone(`${side}Leg`, frame(dS, new THREE.Vector3().crossVectors(dS, k)));
      const dFt = toe.clone().sub(ankle);
      setBone(`${side}Foot`, frame(dFt, new THREE.Vector3().crossVectors(dFt, UP)));
    };
    leg('Right', j.hipR, j.kneeR, j.ankleR, j.toeR);
    leg('Left', j.hipL, j.kneeL, j.ankleL, j.toeL);

    // Racket from the hand.
    const rx = new THREE.Vector3().crossVectors(rdir, j.racketFace).normalize();
    racket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rx, rdir, j.racketFace));
    racket.position.copy(j.racketHead);

    overlay.update(j, muscles, lookAt, time);
  };

  return {
    root,
    racket,
    update,
    setRacketVisible: (v) => (racket.visible = v),
    dispose: () => overlay.dispose(),
  };
}
