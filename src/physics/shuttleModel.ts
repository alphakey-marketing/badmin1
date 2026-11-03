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
