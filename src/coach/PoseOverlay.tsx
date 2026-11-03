import { useEffect, useRef } from 'react';
import type { BodyPart, Hand, Landmark, Status } from './types';
import { STATUS_COLOR, bones } from './bodyParts';

interface Props {
  landmarks: Landmark[] | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: Record<BodyPart, Status>;
  hand: Hand;
}

/** Draws the colour-coded skeleton on top of the video (object-fit: contain). */
export default function PoseOverlay({ landmarks, videoRef, status, hand }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const v = videoRef.current;
    if (!c || !v) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== W * dpr || c.height !== H * dpr) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!landmarks || !v.videoWidth) return;

    // Area actually covered by the video inside the element.
    const scale = Math.min(W / v.videoWidth, H / v.videoHeight);
    const vw = v.videoWidth * scale;
    const vh = v.videoHeight * scale;
    const ox = (W - vw) / 2;
    const oy = (H - vh) / 2;
    const P = (lm: Landmark) => ({ x: ox + lm.x * vw, y: oy + lm.y * vh });
    const vis = (lm?: Landmark) => !!lm && (lm.visibility ?? 1) > 0.4;

    ctx.lineCap = 'round';
    for (const [a, b, part] of bones(hand)) {
      const A = landmarks[a];
      const B = landmarks[b];
      if (!vis(A) || !vis(B)) continue;
      const pa = P(A);
      const pb = P(B);
      const st = part ? status[part] : 'na';
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.strokeStyle = st === 'na' ? 'rgba(255,255,255,0.85)' : STATUS_COLOR[st];
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      const lm = landmarks[i];
      if (!vis(lm)) continue;
      const p = P(lm);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
    }

    // Centre of mass (hip centre) and a plumb line to the floor.
    const lh = landmarks[23];
    const rh = landmarks[24];
    const la = landmarks[27];
    const ra = landmarks[28];
    if (vis(lh) && vis(rh) && vis(la) && vis(ra)) {
      const h = P({ x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: 0 });
      const floorY = Math.max(P(la).y, P(ra).y);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = STATUS_COLOR[status.weight === 'na' ? 'na' : status.weight];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.lineTo(h.x, floorY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(h.x, h.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();
      ctx.stroke();
    }
  });

  return <canvas ref={ref} className="pose-overlay" />;
}
