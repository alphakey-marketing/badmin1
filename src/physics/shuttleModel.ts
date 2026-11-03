/**
 * Builds a 3D shuttlecock: cork + 16 overlapping feathers.
 * Local +Y is the shuttle axis, pointing from the skirt to the cork.
 * Real size: 68 mm skirt diameter, ~85 mm long. The cork's centre sits at y = 0.
 */
import * as THREE from 'three';

const FEATHERS = 16;
/** Each feather is turned a little around its shaft. That twist is what makes the air spin the shuttle. */
const VANE_TWIST = 0.28; // radians

export function createShuttle(opts: { highlight?: boolean } = {}): THREE.Group {
  const group = new THREE.Group();

  const corkMat = new THREE.MeshStandardMaterial({ color: 0xf4ead5, roughness: 0.75 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.6 });
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
  const vaneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const markMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });

  // Cork: dome + short cylinder.
  const corkR = 0.0128;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(corkR, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), corkMat);
  dome.position.y = 0.004;
  group.add(dome);
  const corkBody = new THREE.Mesh(new THREE.CylinderGeometry(corkR, corkR, 0.012, 24), baseMat);
  corkBody.position.y = -0.002;
  group.add(corkBody);

  // Feathers on a cone from the cork rim (r = 1.2 cm) to the skirt (r = 3.4 cm).
  const rootY = -0.008;
  const tipY = -0.075;
  const rootR = 0.011;
  const tipR = 0.034;
  const shaftLen = Math.hypot(tipR - rootR, tipY - rootY);
  const coneTilt = Math.atan2(tipR - rootR, rootY - tipY);

  const vaneShape = new THREE.Shape();
  // Vane: narrow near the cork, wide near the tip, rounded end.
  vaneShape.moveTo(0, 0);
  vaneShape.lineTo(0.004, shaftLen * 0.35);
  vaneShape.quadraticCurveTo(0.0085, shaftLen * 0.8, 0.007, shaftLen);
  vaneShape.quadraticCurveTo(0, shaftLen * 1.06, -0.007, shaftLen);
  vaneShape.quadraticCurveTo(-0.0085, shaftLen * 0.8, -0.004, shaftLen * 0.35);
  vaneShape.lineTo(0, 0);
  const vaneGeo = new THREE.ShapeGeometry(vaneShape, 6);
  const shaftGeo = new THREE.CylinderGeometry(0.0006, 0.0009, shaftLen, 5);
  shaftGeo.translate(0, shaftLen / 2, 0);

  for (let i = 0; i < FEATHERS; i++) {
    const a = (i / FEATHERS) * Math.PI * 2;
    // pivot at the feather root, then tilt outwards to form the cone
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * rootR, rootY, Math.sin(a) * rootR);
    pivot.rotation.order = 'YZX';
    pivot.rotation.y = -a;
    pivot.rotation.z = Math.PI + coneTilt; // point downwards and outwards

    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    pivot.add(shaft);

    const vane = new THREE.Mesh(vaneGeo, opts.highlight !== false && i === 0 ? markMat : vaneMat);
    // Vane plane faces outwards; twist it around the shaft.
    vane.rotation.y = Math.PI / 2 + VANE_TWIST;
    pivot.add(vane);

    group.add(pivot);
  }

  // Two thread bands holding the feathers.
  for (const [y, r] of [
    [-0.03, rootR + ((tipR - rootR) * 0.33)],
    [-0.045, rootR + ((tipR - rootR) * 0.55)],
  ] as const) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0007, 6, 40), bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    group.add(band);
  }

  return group;
}

/**
 * Badminton racket (real size: head ≈ 23 × 20 cm, total length 67.5 cm).
 * Local frame: head centre at the origin, strings in the x–y plane, face normal = +Z,
 * shaft and handle along −Y.
 */
export function createRacket(): THREE.Group {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35, metalness: 0.4 });
  const stringMat = new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.7 });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
  const faceMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.12, side: THREE.DoubleSide });

  const a = 0.1; // half width
  const b = 0.115; // half length
  const ring = new THREE.EllipseCurve(0, 0, a, b, 0, Math.PI * 2, false, 0);
  const pts = ring.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0));
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, 0.006, 6, true);
  g.add(new THREE.Mesh(tube, frameMat));

  // Strings
  const s: number[] = [];
  for (let i = -9; i <= 9; i++) {
    const x = (i / 10) * a;
    const h = b * Math.sqrt(Math.max(0, 1 - (x * x) / (a * a)));
    s.push(x, -h, 0, x, h, 0);
  }
  for (let i = -10; i <= 10; i++) {
    const y = (i / 11) * b;
    const w = a * Math.sqrt(Math.max(0, 1 - (y * y) / (b * b)));
    s.push(-w, y, 0, w, y, 0);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(s, 3));
  g.add(new THREE.LineSegments(sg, stringMat));
  const face = new THREE.Mesh(new THREE.CircleGeometry(1, 40), faceMat);
  face.scale.set(a, b, 1);
  g.add(face);

  // Shaft + handle
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.27, 8), frameMat);
  shaft.position.y = -b - 0.135;
  g.add(shaft);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.012, 0.2, 10), handleMat);
  handle.position.y = -b - 0.27 - 0.1;
  g.add(handle);
  return g;
}
