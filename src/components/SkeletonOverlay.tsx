import { useEffect, useRef } from 'react';
import type { Landmark } from '../types';

// Full body skeleton connections (pairs of landmark indices)
const POSE_CONNECTIONS: [number, number][] = [
  // Face/head
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  // Torso
  [11, 12], [23, 24], [11, 23], [12, 24],
  // Left arm
  [11, 13], [13, 15],
  // Right arm
  [12, 14], [14, 16],
  // Left leg
  [23, 25], [25, 27],
  // Right leg
  [24, 26], [26, 28],
  // Feet
  [27, 29], [28, 30], [29, 31], [30, 32],
];

// Joints highlighted in problem feedback
const KEY_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

interface Props {
  landmarks: Landmark[] | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  problemJoints?: Set<number>;
}

export default function SkeletonOverlay({ landmarks, videoRef, problemJoints = new Set() }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match video display size
    const rect = video.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks || landmarks.length === 0) return;

    const w = canvas.width;
    const h = canvas.height;

    const toCanvas = (lm: Landmark) => ({
      x: lm.x * w,
      y: lm.y * h,
    });

    // Draw connections
    for (const [a, b] of POSE_CONNECTIONS) {
      const lmA = landmarks[a];
      const lmB = landmarks[b];
      if (!lmA || !lmB) continue;
      if ((lmA.visibility ?? 1) < 0.4 || (lmB.visibility ?? 1) < 0.4) continue;

      const pA = toCanvas(lmA);
      const pB = toCanvas(lmB);

      const isProblem = problemJoints.has(a) || problemJoints.has(b);
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.strokeStyle = isProblem ? 'rgba(255,60,60,0.9)' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = isProblem ? 3 : 2;
      ctx.stroke();
    }

    // Draw joint circles
    for (const idx of KEY_JOINTS) {
      const lm = landmarks[idx];
      if (!lm || (lm.visibility ?? 1) < 0.4) continue;

      const p = toCanvas(lm);
      const isProblem = problemJoints.has(idx);

      ctx.beginPath();
      ctx.arc(p.x, p.y, isProblem ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isProblem ? 'rgba(255,60,60,0.95)' : 'rgba(255,255,255,0.9)';
      ctx.fill();

      if (isProblem) {
        ctx.strokeStyle = '#ff3c3c';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [landmarks, videoRef, problemJoints]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
