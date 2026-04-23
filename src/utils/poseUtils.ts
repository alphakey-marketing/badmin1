import type { Landmark } from '../types';

// MediaPipe Pose landmark indices
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;
export const LEFT_ELBOW = 13;
export const RIGHT_ELBOW = 14;
export const LEFT_WRIST = 15;
export const RIGHT_WRIST = 16;
export const LEFT_HIP = 23;
export const RIGHT_HIP = 24;
export const LEFT_KNEE = 25;
export const RIGHT_KNEE = 26;
export const LEFT_ANKLE = 27;
export const RIGHT_ANKLE = 28;

/**
 * Compute the angle (in degrees) at vertex p2 formed by the p1–p2–p3 segments.
 */
export function angle3Points(p1: Landmark, p2: Landmark, p3: Landmark): number {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Exponential smoothing for landmark jitter reduction.
 * alpha near 1 = more responsive, near 0 = more smooth.
 */
export function smoothLandmarks(
  current: Landmark[],
  previous: Landmark[] | null,
  alpha = 0.5,
): Landmark[] {
  if (!previous || previous.length !== current.length) return current;
  return current.map((lm, i) => ({
    x: alpha * lm.x + (1 - alpha) * previous[i].x,
    y: alpha * lm.y + (1 - alpha) * previous[i].y,
    z: alpha * lm.z + (1 - alpha) * previous[i].z,
    visibility: lm.visibility,
  }));
}

/**
 * Euclidean distance between two landmarks (2D, using x/y).
 */
export function landmarkDistance(p1: Landmark, p2: Landmark): number {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}
