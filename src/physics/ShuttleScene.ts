/**
 * Three.js scene for the shuttle physics lab.
 * Main view: the court, flight path and a (scaled-up) shuttle.
 * Inset view: a close-up of the real-size shuttle, so you can see it spin and flip.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRacket, createShuttle } from './shuttleModel';
import { createMannequin, type Mannequin } from '../demo/mannequin3d';
import { createHumanFigure } from '../demo/humanModel';
import { poseAt, solve, type Joints } from '../demo/rig';
import { MOVES, type Move } from '../demo/moves';
import { COURT, sampleAt, type SimResult } from './shuttleSim';

/** What the scene needs to draw the racket hit (impact mode). */
export interface ImpactView {
  contact: THREE.Vector3;
  incoming: Array<{ t: number; pos: THREE.Vector3; vel: THREE.Vector3 }>;
  vRacket: THREE.Vector3;
  normal: THREE.Vector3;
  /** Demo move for the 3D player who hits the shuttle. */
  player?: { move: string; left?: boolean };
}

interface State {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  axis: THREE.Vector3;
  drag: THREE.Vector3;
  side: THREE.Vector3;
  gravity: THREE.Vector3;
}

const UPV = new THREE.Vector3(0, 1, 0);

export interface SceneOptions {
  showForces: boolean;
  follow: boolean;
  shuttleScale: number;
}

const COLORS = {
  velocity: 0x38bdf8,
  drag: 0xf87171,
  gravity: 0xfacc15,
  side: 0xc084fc,
  axis: 0x4ade80,
  path: 0x38bdf8,
  ghost: 0xfbbf24,
};

export class ShuttleScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  private closeScene = new THREE.Scene();
  private closeCamera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);

  private shuttle: THREE.Group;
  private closeShuttle: THREE.Group;
  private pathLine: THREE.Line | null = null;
  private ghostLine: THREE.Line | null = null;
  private ghostMarker: THREE.Mesh;
  private landingMarkers: THREE.Group = new THREE.Group();

  private arrows: Record<'velocity' | 'drag' | 'gravity' | 'side', THREE.ArrowHelper>;
  private closeArrows: Record<'flow' | 'axis', THREE.ArrowHelper>;
  private flowLines: THREE.LineSegments;
  private flowOffsets: Float32Array;

  private racket: THREE.Group;
  private closeRacket: THREE.Group;
  private incomingLine: THREE.Line | null = null;
  private impact: ImpactView | null = null;
  private impactArrows: Record<'face' | 'swing', THREE.ArrowHelper>;
  private closeImpactArrows: Record<'face' | 'swing', THREE.ArrowHelper>;
  private racketKin: { pivot: THREE.Vector3; rho: THREE.Vector3; axis: THREE.Vector3; omega: THREE.Vector3; q0: THREE.Quaternion; linear: boolean; radius: number } | null = null;
  private player: Mannequin | null = null;
  private disposed = false;
  private playerKin: { move: Move; mirror: number; offsetLocal: THREE.Vector3 } | null = null;

  private result: SimResult | null = null;
  private ghost: SimResult | null = null;
  private opts: SceneOptions = { showForces: true, follow: false, shuttleScale: 6 };
  private resizeObs: ResizeObserver;
  private raf = 0;
  private lastFrame = performance.now();
  private flowTime = 0;
  private time = 0;

  /** Called with the close-up inset's position (CSS px) whenever the view resizes. */
  onInsetChange: ((r: { x: number; y: number; size: number; narrow: boolean }) => void) | null = null;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setScissorTest(true);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
    this.camera.position.set(-9, 6, 11);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.5, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;

    this.buildCourt();

    this.shuttle = createShuttle();
    this.scene.add(this.shuttle);

    const ghostGeo = new THREE.SphereGeometry(0.06, 12, 8);
    this.ghostMarker = new THREE.Mesh(
      ghostGeo,
      new THREE.MeshBasicMaterial({ color: COLORS.ghost, transparent: true, opacity: 0.7 }),
    );
    this.scene.add(this.ghostMarker);
    this.scene.add(this.landingMarkers);

    const mkArrow = (c: number) => {
      const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, c, 0.18, 0.1);
      this.scene.add(a);
      return a;
    };
    this.arrows = {
      velocity: mkArrow(COLORS.velocity),
      drag: mkArrow(COLORS.drag),
      gravity: mkArrow(COLORS.gravity),
      side: mkArrow(COLORS.side),
    };

    // --- Close-up scene ---
    this.closeScene.background = new THREE.Color(0x0b1220);
    this.closeScene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(0.5, 1, 0.8);
    this.closeScene.add(dl);
    this.closeShuttle = createShuttle();
    this.closeScene.add(this.closeShuttle);
    const mkClose = (c: number, len: number) => {
      const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), len, c, 0.02, 0.012);
      this.closeScene.add(a);
      return a;
    };
    this.closeArrows = { flow: mkClose(COLORS.velocity, 0.12), axis: mkClose(COLORS.axis, 0.09) };

    // Air-flow streaks around the close-up shuttle (they move opposite to the flight direction).
    const N = 60;
    this.flowOffsets = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 0.02 + Math.random() * 0.05;
      const a = Math.random() * Math.PI * 2;
      this.flowOffsets[i * 3] = Math.cos(a) * r;
      this.flowOffsets[i * 3 + 1] = Math.sin(a) * r;
      this.flowOffsets[i * 3 + 2] = Math.random();
    }
    const flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    this.flowLines = new THREE.LineSegments(
      flowGeo,
      new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.45 }),
    );
    this.closeScene.add(this.flowLines);

    this.racket = createRacket();
    this.racket.visible = false;
    this.scene.add(this.racket);
    this.closeRacket = createRacket();
    this.closeRacket.visible = false;
    this.closeScene.add(this.closeRacket);
    const mkImpact = (c: number, sc: THREE.Scene, len: number, head: number) => {
      const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), len, c, head, head * 0.6);
      a.visible = false;
      sc.add(a);
      return a;
    };
    this.impactArrows = { face: mkImpact(0x4ade80, this.scene, 0.8, 0.12), swing: mkImpact(0xfb923c, this.scene, 0.8, 0.12) };
    this.closeImpactArrows = { face: mkImpact(0x4ade80, this.closeScene, 0.1, 0.018), swing: mkImpact(0xfb923c, this.closeScene, 0.1, 0.018) };

    // Swap in the realistic human model once it has loaded (the simple mannequin is used until then).
    createHumanFigure()
      .then((h) => {
        if (this.disposed) return h.dispose();
        h.setRacketVisible(false);
        const old = this.player;
        if (old) {
          h.root.position.copy(old.root.position);
          h.root.scale.copy(old.root.scale);
          h.root.visible = old.root.visible;
          this.scene.remove(old.root);
          old.dispose();
        } else {
          h.root.visible = false;
        }
        this.scene.add(h.root);
        this.player = h;
        this.setTime(this.time);
      })
      .catch(() => undefined);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.loop();
  }

  private buildCourt() {
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0b1220, 25, 60);
    this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-4, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 30 });
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 30),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    this.scene.add(floor);

    const court = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT.halfLength * 2 + 1, COURT.halfWidthDoubles * 2 + 1),
      new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9 }),
    );
    court.rotation.x = -Math.PI / 2;
    court.receiveShadow = true;
    this.scene.add(court);

    // Court lines (doubles court, metres)
    const L = COURT.halfLength;
    const W = COURT.halfWidthDoubles;
    const ws = COURT.halfWidthSingles;
    const shortService = 1.98;
    const longDoubles = L - 0.76;
    const pts: number[] = [];
    const seg = (x1: number, z1: number, x2: number, z2: number) => pts.push(x1, 0.003, z1, x2, 0.003, z2);
    seg(-L, -W, L, -W);
    seg(-L, W, L, W);
    seg(-L, -ws, L, -ws);
    seg(-L, ws, L, ws);
    seg(-L, -W, -L, W);
    seg(L, -W, L, W);
    seg(-longDoubles, -W, -longDoubles, W);
    seg(longDoubles, -W, longDoubles, W);
    seg(-shortService, -W, -shortService, W);
    seg(shortService, -W, shortService, W);
    seg(-L, 0, -shortService, 0);
    seg(shortService, 0, L, 0);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff })));

    // Net
    const netH = COURT.netHeight;
    const netMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 2 + 0.2, 0.76),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
    );
    netMesh.rotation.y = Math.PI / 2;
    netMesh.position.set(0, netH - 0.38, 0);
    this.scene.add(netMesh);
    const tape = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.04, W * 2 + 0.2),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    tape.position.set(0, netH, 0);
    this.scene.add(tape);
    for (const z of [-W - 0.1, W + 0.1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, COURT.netPostHeight, 8),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8 }),
      );
      post.position.set(0, COURT.netPostHeight / 2, z);
      this.scene.add(post);
    }
  }

  setResults(result: SimResult, ghost: SimResult | null, impact: ImpactView | null = null) {
    this.result = result;
    this.ghost = ghost;
    this.impact = impact;
    this.setupRacket();
    const mkLine = (res: SimResult, color: number, dashed: boolean) => {
      const pts = res.samples.filter((_, i) => i % 4 === 0).map((s) => s.pos);
      pts.push(res.samples[res.samples.length - 1].pos);
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.8 })
        : new THREE.LineBasicMaterial({ color });
      const line = new THREE.Line(g, m);
      if (dashed) line.computeLineDistances();
      return line;
    };
    for (const l of [this.pathLine, this.ghostLine]) {
      if (l) {
        this.scene.remove(l);
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
    }
    this.pathLine = mkLine(result, COLORS.path, false);
    this.scene.add(this.pathLine);
    this.ghostLine = ghost ? mkLine(ghost, COLORS.ghost, true) : null;
    if (this.ghostLine) this.scene.add(this.ghostLine);

    if (this.incomingLine) {
      this.scene.remove(this.incomingLine);
      this.incomingLine.geometry.dispose();
      (this.incomingLine.material as THREE.Material).dispose();
      this.incomingLine = null;
    }
    if (impact && impact.incoming.length > 1) {
      const g = new THREE.BufferGeometry().setFromPoints(impact.incoming.map((p) => p.pos));
      this.incomingLine = new THREE.Line(
        g,
        new THREE.LineDashedMaterial({ color: 0x94a3b8, dashSize: 0.1, gapSize: 0.08 }),
      );
      this.incomingLine.computeLineDistances();
      this.scene.add(this.incomingLine);
    }

    this.landingMarkers.clear();
    const addMark = (res: SimResult, color: number) => {
      if (!res.landing) return;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.16, 32),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(res.landing).setY(0.01);
      this.landingMarkers.add(ring);
    };
    addMark(result, COLORS.path);
    if (ghost) addMark(ghost, COLORS.ghost);
    this.setTime(this.time);
  }

  setOptions(o: Partial<SceneOptions>) {
    this.opts = { ...this.opts, ...o };
    this.setTime(this.time);
  }

  setTime(t: number) {
    this.time = t;
    const res = this.result;
    if (!res) return;
    const s = this.stateAt(t);
    this.shuttle.position.copy(s.pos);
    this.shuttle.quaternion.copy(s.quat);
    this.shuttle.scale.setScalar(this.opts.shuttleScale);
    this.closeShuttle.quaternion.copy(s.quat);

    if (this.ghost) {
      this.ghostMarker.visible = true;
      this.ghostMarker.position.copy(t < 0 ? s.pos : sampleAt(this.ghost, t).pos);
    } else {
      this.ghostMarker.visible = false;
    }

    // Force arrows: acceleration in m/s², drawn at 0.08 m per m/s² (clamped).
    const show = this.opts.showForces;
    const setArrow = (a: THREE.ArrowHelper, v: THREE.Vector3, scale: number, max: number) => {
      const len = v.length() * scale;
      a.visible = show && len > 0.03;
      if (!a.visible) return;
      a.position.copy(s.pos);
      a.setDirection(v.clone().normalize());
      a.setLength(Math.min(max, len), 0.18, 0.1);
    };
    setArrow(this.arrows.velocity, s.vel, 0.05, 3.5);
    setArrow(this.arrows.drag, s.drag, 0.08, 3.5);
    setArrow(this.arrows.gravity, s.gravity, 0.08, 3.5);
    setArrow(this.arrows.side, s.side, 0.2, 2.5);

    // Close-up: air flow direction (opposite to travel) and the shuttle axis.
    const vdir = s.vel.clone().normalize();
    const flow = vdir.clone().negate();
    this.closeArrows.flow.position.copy(vdir.clone().multiplyScalar(0.12));
    this.closeArrows.flow.setDirection(flow);
    this.closeArrows.flow.visible = show;
    this.closeArrows.axis.position.set(0, 0, 0);
    this.closeArrows.axis.setDirection(s.axis);
    this.closeArrows.axis.visible = show;

    // Close-up camera: look from the side of the flight path.
    const sideDir = new THREE.Vector3().crossVectors(vdir, new THREE.Vector3(0, 1, 0));
    if (sideDir.lengthSq() < 1e-4) sideDir.set(0, 0, 1);
    sideDir.normalize();
    this.closeCamera.position.copy(sideDir.multiplyScalar(0.32)).add(new THREE.Vector3(0, 0.08, 0)).addScaledVector(vdir, -0.05);
    this.closeCamera.lookAt(0, -0.02, 0);

    this.updateRacket(t, s.pos);

    if (this.opts.follow) {
      const target = s.pos.clone();
      const delta = target.clone().sub(this.controls.target);
      this.controls.target.copy(target);
      this.camera.position.add(delta);
    }
  }

  private updateFlow(dtReal: number) {
    const res = this.result;
    if (!res) return;
    const s = this.stateAt(this.time);
    const vdir = s.vel.clone().normalize();
    const u = new THREE.Vector3().crossVectors(vdir, new THREE.Vector3(0, 1, 0));
    if (u.lengthSq() < 1e-4) u.set(0, 0, 1);
    u.normalize();
    const w = new THREE.Vector3().crossVectors(u, vdir).normalize();
    this.flowTime += dtReal * 0.6;
    const pos = this.flowLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = this.flowOffsets.length / 3;
    for (let i = 0; i < n; i++) {
      const a = this.flowOffsets[i * 3];
      const b = this.flowOffsets[i * 3 + 1];
      const phase = (this.flowOffsets[i * 3 + 2] + this.flowTime) % 1;
      const along = 0.18 - phase * 0.36; // from front to back
      const p = u.clone().multiplyScalar(a).addScaledVector(w, b).addScaledVector(vdir, along);
      const q = p.clone().addScaledVector(vdir, -0.025);
      pos.setXYZ(i * 2, p.x, p.y, p.z);
      pos.setXYZ(i * 2 + 1, q.x, q.y, q.z);
    }
    pos.needsUpdate = true;
    this.flowLines.visible = this.opts.showForces;
  }

  /** Shuttle state at time t (t < 0 = still flying in, before the hit). */
  private stateAt(t: number): State {
    const imp = this.impact;
    if (t < 0 && imp && imp.incoming.length) {
      const pts = imp.incoming;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round((t - pts[0].t) / 0.001)));
      const p = pts[i];
      const v = p.vel;
      return {
        pos: p.pos,
        vel: v,
        quat: new THREE.Quaternion().setFromUnitVectors(UPV, v.clone().normalize()),
        axis: v.clone().normalize(),
        drag: v.clone().normalize().multiplyScalar(-9.81 * (v.lengthSq() / (6.78 * 6.78))),
        side: new THREE.Vector3(),
        gravity: new THREE.Vector3(0, -9.81, 0),
      };
    }
    const s = sampleAt(this.result as SimResult, Math.max(0, t));
    return s;
  }

  /**
   * Racket swings on an arc around the shoulder and passes through the contact point at t = 0.
   * With a 3D player, the arc is centred on the player's racket shoulder, and the player is placed
   * so that its racket meets the shuttle at the contact point.
   */
  private setupRacket() {
    const imp = this.impact;
    this.racket.visible = !!imp;
    this.closeRacket.visible = !!imp;
    if (!imp) {
      this.racketKin = null;
      this.playerKin = null;
      if (this.player) this.player.root.visible = false;
      Object.values(this.impactArrows).forEach((a) => (a.visible = false));
      Object.values(this.closeImpactArrows).forEach((a) => (a.visible = false));
      return;
    }
    const N = imp.normal.clone().normalize();
    const speed = imp.vRacket.length();
    const vhat = speed > 1e-6 ? imp.vRacket.clone().normalize() : UPV.clone();
    const mirror = imp.player?.left ? -1 : 1;
    const M = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.y, v.z * mirror);
    const move = imp.player ? MOVES.find((m) => m.id === imp.player?.move) : undefined;

    let rho: THREE.Vector3 | null = null;
    let radius = 0.9;
    let jc: Joints | null = null;
    if (move && move.contactT !== undefined) {
      jc = solve(poseAt(move.keys, move.contactT));
      // Shoulder → racket head at contact (player's own shape), made perpendicular to the swing and the face.
      const dir = M(jc.racketHead.clone().sub(jc.shoulderR));
      radius = Math.min(1.15, Math.max(0.7, dir.length()));
      const r = dir.normalize();
      r.addScaledVector(vhat, -r.dot(vhat));
      const nPerp = N.clone().addScaledVector(vhat, -N.dot(vhat));
      if (nPerp.lengthSq() > 1e-4) {
        nPerp.normalize();
        r.addScaledVector(nPerp, -r.dot(nPerp));
      }
      if (r.lengthSq() > 1e-3) rho = r.normalize();
    }
    if (!rho) {
      // Shaft lies in the string plane: choose rho ⟂ N and ⟂ swing direction, pointing upwards.
      rho = new THREE.Vector3().crossVectors(N, vhat);
      if (rho.lengthSq() < 1e-4) rho = UPV.clone().addScaledVector(vhat, -UPV.dot(vhat));
      if (rho.lengthSq() < 1e-4) rho.set(0, 0, 1);
      rho.normalize();
      if (rho.y < 0) rho.negate();
    }
    const axis = new THREE.Vector3().crossVectors(rho, vhat).normalize();
    const zAxis = N.clone().addScaledVector(rho, -N.dot(rho)).normalize();
    const xAxis = new THREE.Vector3().crossVectors(rho, zAxis).normalize();
    const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, rho, zAxis));
    const pivot = imp.contact.clone().addScaledVector(rho, -radius);
    this.racketKin = { pivot, rho, axis, omega: new THREE.Vector3(speed / radius, 0, 0), q0, linear: speed < 2, radius };

    if (move && jc) {
      if (!this.player) {
        this.player = createMannequin();
        this.player.setRacketVisible(false);
        this.scene.add(this.player.root);
      }
      this.player.root.visible = true;
      this.player.root.scale.z = mirror;
      // Place the player so its racket shoulder sits on the swing pivot at contact.
      const offsetLocal = M(pivot).sub(jc.shoulderR);
      this.player.root.position.copy(M(offsetLocal));
      this.playerKin = { move, mirror, offsetLocal };
    } else {
      this.playerKin = null;
      if (this.player) this.player.root.visible = false;
    }
  }

  private updateRacket(t: number, shuttlePos: THREE.Vector3) {
    const k = this.racketKin;
    const imp = this.impact;
    if (!k || !imp) return;
    const angle = k.omega.x * t;
    let arcPos: THREE.Vector3;
    let arcQuat: THREE.Quaternion;
    if (k.linear) {
      arcPos = imp.contact.clone().addScaledVector(imp.vRacket, t);
      arcQuat = k.q0.clone();
    } else {
      const qr = new THREE.Quaternion().setFromAxisAngle(k.axis, angle);
      arcPos = k.rho.clone().multiplyScalar(k.radius).applyQuaternion(qr).add(k.pivot);
      arcQuat = qr.multiply(k.q0);
    }
    // Racket head centre sits just behind the strings' contact point.
    const arcHead = arcPos.clone().addScaledVector(imp.normal, -0.015);

    let headPos = arcHead;
    let headQuat = arcQuat;
    let visible = k.linear ? t > -0.4 && t < 0.25 : Math.abs(angle) < 1.8;
    const pk = this.playerKin;
    if (pk && this.player) {
      // Blend from the player's own racket (key poses) into the physics swing near contact.
      const mv = pk.move;
      const mt = Math.max(0, Math.min(mv.duration, (mv.contactT ?? 0) + t));
      const pose = poseAt(mv.keys, mt);
      const j0 = solve(pose);
      const M = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.y, v.z * pk.mirror);
      const toWorld = (v: THREE.Vector3) => M(v.clone().add(pk.offsetLocal));
      const kHead = toWorld(j0.racketHead);
      const ky = M(j0.racketHead.clone().sub(j0.wristR)).normalize();
      const kz = M(j0.racketFace.clone()).normalize();
      const kx = new THREE.Vector3().crossVectors(ky, kz).normalize();
      const kQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(kx, ky, kz));
      const a = Math.abs(k.linear ? t * 6 : angle);
      const w = 1 - THREE.MathUtils.smoothstep(a, 0.5, 1.4);
      headPos = kHead.clone().lerp(arcHead, w);
      headQuat = kQuat.clone().slerp(arcQuat, w);
      visible = true;
      // The hand holds the grip: 0.5 m from the head centre along the shaft.
      const shaft = new THREE.Vector3(0, 1, 0).applyQuaternion(headQuat);
      const gripWorld = headPos.clone().addScaledVector(shaft, -0.5);
      const gripLocal = M(gripWorld).sub(pk.offsetLocal);
      const j = solve(pose, { wristR: gripLocal });
      const look = M(shuttlePos).sub(pk.offsetLocal);
      this.player.update(j, [], t < 0.08 ? look : null, performance.now() / 1000);
    }
    this.racket.visible = visible;
    this.racket.position.copy(headPos);
    this.racket.quaternion.copy(headQuat);
    this.racket.scale.setScalar(pk ? 1 : this.opts.shuttleScale);
    if (!pk) this.racket.position.addScaledVector(imp.normal, -0.015 * (this.opts.shuttleScale - 1));

    // Close-up: racket relative to the shuttle (only near contact, real size).
    const rel = arcHead.clone().sub(shuttlePos);
    this.closeRacket.visible = Math.abs(angle) < 1.8 && rel.length() < 0.5;
    this.closeRacket.position.copy(rel);
    this.closeRacket.quaternion.copy(arcQuat);

    const near = Math.abs(t) < 0.3 && this.opts.showForces;
    const vhat = imp.vRacket.lengthSq() > 1e-6 ? imp.vRacket.clone().normalize() : imp.normal.clone();
    const placeArrow = (a: THREE.ArrowHelper, origin: THREE.Vector3, dir: THREE.Vector3) => {
      a.visible = near;
      a.position.copy(origin);
      a.setDirection(dir);
    };
    placeArrow(this.impactArrows.face, imp.contact, imp.normal);
    placeArrow(this.impactArrows.swing, imp.contact, vhat);
    const rc = imp.contact.clone().sub(shuttlePos);
    placeArrow(this.closeImpactArrows.face, rc, imp.normal);
    placeArrow(this.closeImpactArrows.swing, rc, vhat);
    if (rc.length() > 0.4) {
      this.closeImpactArrows.face.visible = false;
      this.closeImpactArrows.swing.visible = false;
    }
  }

  /** Camera position that frames the player and the hit. */
  focusHit() {
    const imp = this.impact;
    if (!imp) return this.resetView();
    const c = imp.contact;
    this.camera.position.set(c.x - 2.2, Math.max(1.6, c.y + 0.4), c.z + 4.2);
    this.controls.target.set(c.x + 0.8, Math.max(1, c.y - 0.6), c.z);
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onInsetChange?.(this.insetRect());
  }

  /** Size of the close-up inset in CSS pixels. */
  insetRect() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const narrow = w < 640;
    const size = Math.round(Math.min(w * (narrow ? 0.4 : 0.32), h * 0.45, 300));
    const bottom = narrow ? 64 : 12; // on phones the play bar sits below the inset
    return { x: w - size - 12, y: h - size - bottom, size, narrow };
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.controls.update();
    this.updateFlow(dt);

    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissor(0, 0, w, h);
    this.renderer.render(this.scene, this.camera);

    const r = this.insetRect();
    const yGl = h - r.y - r.size;
    this.renderer.setViewport(r.x, yGl, r.size, r.size);
    this.renderer.setScissor(r.x, yGl, r.size, r.size);
    this.closeCamera.aspect = 1;
    this.closeCamera.updateProjectionMatrix();
    this.renderer.render(this.closeScene, this.closeCamera);
  };

  resetView() {
    this.camera.position.set(-9, 6, 11);
    this.controls.target.set(0, 1.5, 0);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.disposed = true;
    this.player?.dispose();
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
