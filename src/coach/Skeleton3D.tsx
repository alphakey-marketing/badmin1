import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BodyPart, Hand, Landmark, Status } from './types';
import { STATUS_COLOR, bones } from './bodyParts';

interface Props {
  world: Landmark[] | null;
  status: Record<BodyPart, Status>;
  hand: Hand;
}

const NEUTRAL = 0xe2e8f0;

/** Rotatable 3D view of your skeleton (MediaPipe world landmarks, metres). */
export default function Skeleton3D({ world, status, hand }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    bones: THREE.Mesh[];
    joints: THREE.Mesh[];
    com: THREE.Mesh;
    raf: number;
  } | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.4));
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
    camera.position.set(2.2, 1.4, 2.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;

    const grid = new THREE.GridHelper(3, 12, 0x475569, 0x334155);
    scene.add(grid);

    const boneGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 8);
    boneGeo.translate(0, 0.5, 0);
    const bonesM = bones(hand).map(() => {
      const m = new THREE.Mesh(boneGeo, new THREE.MeshStandardMaterial({ color: NEUTRAL, roughness: 0.5 }));
      scene.add(m);
      return m;
    });
    const jointGeo = new THREE.SphereGeometry(0.035, 12, 8);
    const jointsM = Array.from({ length: 33 }, () => {
      const m = new THREE.Mesh(jointGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
      scene.add(m);
      return m;
    });
    const com = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.08, 24),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide }),
    );
    com.rotation.x = -Math.PI / 2;
    scene.add(com);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const s = { renderer, scene, camera, controls, bones: bonesM, joints: jointsM, com, raf: 0 };
    const loop = () => {
      s.raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    stateRef.current = s;
    return () => {
      cancelAnimationFrame(s.raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stateRef.current = null;
    };
  }, [hand]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const visible = !!world;
    s.bones.forEach((b) => (b.visible = visible));
    s.joints.forEach((j) => (j.visible = visible));
    s.com.visible = visible;
    if (!world) return;

    // World landmarks: y down, origin at the hips. Put the lowest foot on the floor.
    let floor = -Infinity;
    for (const i of [27, 28, 29, 30, 31, 32]) floor = Math.max(floor, world[i]?.y ?? -Infinity);
    const P = (lm: Landmark) => new THREE.Vector3(lm.x, floor - lm.y, -lm.z);

    world.forEach((lm, i) => {
      const j = s.joints[i];
      j.position.copy(P(lm));
      j.visible = i >= 11 && (lm.visibility ?? 1) > 0.3;
    });
    const up = new THREE.Vector3(0, 1, 0);
    bones(hand).forEach(([a, b, part], i) => {
      const m = s.bones[i];
      const pa = P(world[a]);
      const pb = P(world[b]);
      const d = pb.clone().sub(pa);
      const l = d.length();
      m.position.copy(pa);
      m.scale.set(1, Math.max(l, 1e-3), 1);
      m.quaternion.setFromUnitVectors(up, d.normalize());
      const st = part ? status[part] : 'na';
      (m.material as THREE.MeshStandardMaterial).color.set(st === 'na' ? NEUTRAL : STATUS_COLOR[st]);
    });
    const hip = P({ x: (world[23].x + world[24].x) / 2, y: (world[23].y + world[24].y) / 2, z: (world[23].z + world[24].z) / 2 });
    s.com.position.set(hip.x, 0.005, hip.z);
    (s.com.material as THREE.MeshBasicMaterial).color.set(STATUS_COLOR[status.weight === 'na' ? 'na' : status.weight]);
  }, [world, status, hand]);

  return <div className="skeleton3d" ref={mountRef} />;
}
