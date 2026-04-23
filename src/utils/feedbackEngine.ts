import type { Landmark, FeedbackResult, RacketHand, Severity } from '../types';
import {
  LEFT_SHOULDER, RIGHT_SHOULDER,
  LEFT_ELBOW, RIGHT_ELBOW,
  LEFT_WRIST, RIGHT_WRIST,
  LEFT_HIP, RIGHT_HIP,
  LEFT_KNEE, RIGHT_KNEE,
  LEFT_ANKLE, RIGHT_ANKLE,
  angle3Points,
  landmarkDistance,
} from './poseUtils';

const VISIBILITY_THRESHOLD = 0.5;

function isVisible(lm: Landmark | undefined): lm is Landmark {
  return lm !== undefined && (lm.visibility ?? 1) >= VISIBILITY_THRESHOLD;
}

/**
 * Compute feedback from a pose landmarks array.
 */
export function computeFeedback(
  landmarks: Landmark[],
  racketHand: RacketHand = 'right',
): FeedbackResult {
  const metrics = {
    leftElbowAngle: null as number | null,
    rightElbowAngle: null as number | null,
    leftKneeAngle: null as number | null,
    rightKneeAngle: null as number | null,
    stanceWidthRatio: null as number | null,
  };

  // Check key landmarks are visible
  const keyIndices = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP];
  const anyKeyVisible = keyIndices.some((i) => isVisible(landmarks[i]));

  if (!anyKeyVisible || landmarks.length < 29) {
    return {
      message: 'No person detected – move closer',
      severity: 'error',
      details: metrics,
    };
  }

  // Compute elbow angles
  const lShoulder = landmarks[LEFT_SHOULDER];
  const rShoulder = landmarks[RIGHT_SHOULDER];
  const lElbow = landmarks[LEFT_ELBOW];
  const rElbow = landmarks[RIGHT_ELBOW];
  const lWrist = landmarks[LEFT_WRIST];
  const rWrist = landmarks[RIGHT_WRIST];
  const lHip = landmarks[LEFT_HIP];
  const rHip = landmarks[RIGHT_HIP];
  const lKnee = landmarks[LEFT_KNEE];
  const rKnee = landmarks[RIGHT_KNEE];
  const lAnkle = landmarks[LEFT_ANKLE];
  const rAnkle = landmarks[RIGHT_ANKLE];

  if (isVisible(lShoulder) && isVisible(lElbow) && isVisible(lWrist)) {
    metrics.leftElbowAngle = angle3Points(lShoulder, lElbow, lWrist);
  }
  if (isVisible(rShoulder) && isVisible(rElbow) && isVisible(rWrist)) {
    metrics.rightElbowAngle = angle3Points(rShoulder, rElbow, rWrist);
  }

  // Compute knee angles
  if (isVisible(lHip) && isVisible(lKnee) && isVisible(lAnkle)) {
    metrics.leftKneeAngle = angle3Points(lHip, lKnee, lAnkle);
  }
  if (isVisible(rHip) && isVisible(rKnee) && isVisible(rAnkle)) {
    metrics.rightKneeAngle = angle3Points(rHip, rKnee, rAnkle);
  }

  // Stance width ratio: ankle distance / hip height
  if (isVisible(lAnkle) && isVisible(rAnkle) && isVisible(lHip) && isVisible(rHip)) {
    const ankleDistance = landmarkDistance(lAnkle, rAnkle);
    // Hip height: average y-distance from hips to ankles (in normalized coords)
    const hipY = (lHip.y + rHip.y) / 2;
    const ankleY = (lAnkle.y + rAnkle.y) / 2;
    const hipHeight = Math.abs(ankleY - hipY);
    if (hipHeight > 0.01) {
      metrics.stanceWidthRatio = ankleDistance / hipHeight;
    }
  }

  // --- Evaluate rules and collect feedback candidates ---
  const issues: Array<{ message: string; severity: Severity }> = [];

  // Elbow angle check (racket hand)
  const elbowAngle =
    racketHand === 'right' ? metrics.rightElbowAngle : metrics.leftElbowAngle;

  if (elbowAngle !== null) {
    if (elbowAngle < 130) {
      issues.push({ message: 'Elbow too low / straight – bend elbow more for snap', severity: 'warning' });
    } else if (elbowAngle > 170) {
      issues.push({ message: 'Elbow raised too early', severity: 'warning' });
    }
  }

  // Knee angle check (front knee during lunge)
  // Detect lunge by checking which ankle is more forward (lower y value = higher in frame = in front).
  // This heuristic assumes a front-facing or slight side-angle camera; it is less reliable from a
  // pure side view where both ankles have similar y coordinates.
  let frontKneeAngle: number | null = null;
  if (isVisible(lAnkle) && isVisible(rAnkle)) {
    frontKneeAngle =
      lAnkle.y < rAnkle.y ? metrics.leftKneeAngle : metrics.rightKneeAngle;
  }
  if (frontKneeAngle !== null && frontKneeAngle < 100) {
    issues.push({ message: 'Too shallow lunge – bend front knee more', severity: 'warning' });
  }

  // Stance width ratio check
  if (metrics.stanceWidthRatio !== null) {
    if (metrics.stanceWidthRatio < 0.8) {
      issues.push({ message: 'Stance too narrow – widen your feet', severity: 'warning' });
    } else if (metrics.stanceWidthRatio > 2.0) {
      issues.push({ message: 'Stance too wide – bring feet closer', severity: 'warning' });
    }
  }

  // Prioritise: error > warning > good
  const errorIssue = issues.find((i) => i.severity === 'error');
  if (errorIssue) return { ...errorIssue, details: metrics };
  const warningIssue = issues.find((i) => i.severity === 'warning');
  if (warningIssue) return { ...warningIssue, details: metrics };

  return { message: 'Good stance – keep it up!', severity: 'good', details: metrics };
}
