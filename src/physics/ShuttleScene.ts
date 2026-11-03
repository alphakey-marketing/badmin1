/**
 * Three.js scene for the shuttle physics lab.
 * Main view: the court, flight path and a (scaled-up) shuttle.
 * Inset view: a close-up of the real-size shuttle, so you can see it spin and flip.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRacket, createShuttle } from './shuttleModel';
import { COURT, sampleAt, type SimResult } from './shuttleSim';

/** What the scene needs to draw the racket hit (impact mode). */
export interface ImpactView {
  contact: THREE.Vector3;
  incoming: Array<{ t: number; pos: THREE.Vector3; vel: THREE.Vector3 }>;
  vRacket: THREE.Vector3;
  normal: THREE.Vector3;
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

const SWING_RADIUS = 0.9; // shoulder → racket head, metres
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
  private racketKin: { pivot: THREE.Vector3; rho: THREE.Vector3; axis: THREE.Vector3; omega: THREE.Vector3; q0: THREE.Quaternion; linear: boolean } | null = null;

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

  /** Racket swings on an arc around the shoulder and passes through the contact point at t = 0. */
  private setupRacket() {
    const imp = this.impact;
    this.racket.visible = !!imp;
    this.closeRacket.visible = !!imp;
    if (!imp) {
      this.racketKin = null;
      Object.values(this.impactArrows).forEach((a) => (a.visible = false));
      Object.values(this.closeImpactArrows).forEach((a) => (a.visible = false));
      return;
    }
    const N = imp.normal.clone().normalize();
    const speed = imp.vRacket.length();
    const vhat = speed > 1e-6 ? imp.vRacket.clone().normalize() : UPV.clone();
    // Shaft lies in the string plane: choose rho ⟂ N and ⟂ swing direction, pointing upwards.
    let rho = new THREE.Vector3().crossVectors(N, vhat);
    if (rho.lengthSq() < 1e-4) rho = UPV.clone().addScaledVector(vhat, -UPV.dot(vhat));
    if (rho.lengthSq() < 1e-4) rho.set(0, 0, 1);
    rho.normalize();
    if (rho.y < 0) rho.negate();
    const axis = new THREE.Vector3().crossVectors(rho, vhat).normalize();
    const zAxis = N.clone().addScaledVector(rho, -N.dot(rho)).normalize();
    const xAxis = new THREE.Vector3().crossVectors(rho, zAxis).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, rho, zAxis);
    const q0 = new THREE.Quaternion().setFromRotationMatrix(m);
    this.racketKin = {
      pivot: imp.contact.clone().addScaledVector(rho, -SWING_RADIUS),
      rho,
      axis,
      omega: new THREE.Vector3(speed / SWING_RADIUS, 0, 0),
      q0,
      linear: speed < 2,
    };
  }

  private updateRacket(t: number, shuttlePos: THREE.Vector3) {
    const k = this.racketKin;
    const imp = this.impact;
    if (!k || !imp) return;
    const omega = k.omega.x;
    const angle = omega * t;
    let visible = Math.abs(angle) < 1.8;
    if (k.linear) visible = t > -0.4 && t < 0.25;
    this.racket.visible = visible;
    let pos: THREE.Vector3;
    let quat: THREE.Quaternion;
    if (k.linear) {
      pos = imp.contact.clone().addScaledVector(imp.vRacket, t);
      quat = k.q0.clone();
    } else {
      const qr = new THREE.Quaternion().setFromAxisAngle(k.axis, angle);
      pos = k.rho.clone().multiplyScalar(SWING_RADIUS).applyQuaternion(qr).add(k.pivot);
      quat = qr.multiply(k.q0);
    }
    // Racket head centre sits just behind the strings' contact point.
    this.racket.position.copy(pos).addScaledVector(imp.normal, -0.015 * this.opts.shuttleScale);
    this.racket.quaternion.copy(quat);
    this.racket.scale.setScalar(this.opts.shuttleScale);

    // Close-up: racket relative to the shuttle (only near contact, real size).
    const rel = pos.clone().addScaledVector(imp.normal, -0.015).sub(shuttlePos);
    this.closeRacket.visible = visible && rel.length() < 0.5;
    this.closeRacket.position.copy(rel);
    this.closeRacket.quaternion.copy(quat);

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
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
